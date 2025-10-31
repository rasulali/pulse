"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  FiRefreshCw,
  FiChevronLeft,
  FiChevronRight,
  FiPlus,
  FiUpload,
  FiLogOut,
  FiAlertTriangle,
  FiSend,
  FiTag,
  FiTrash2,
  FiSearch,
  FiCheckSquare,
  FiSquare,
  FiEdit2,
  FiEye,
  FiEyeOff,
  FiSettings,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { IoToggle } from "react-icons/io5";
import { PiPlugs, PiPlugsConnected } from "react-icons/pi";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
);

type Row = {
  id: number;
  name: string | null;
  url: string;
  occupation: string | null;
  headline: string | null;
  industry_ids: number[];
  allowed?: boolean;
};

type Industry = { id: number; name: string; visible?: boolean };
type Signal = {
  id: number;
  name: string;
  visible: boolean;
  prompt: string;
  embedding_query: string;
};
type AppUser = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  telegram_chat_id: number | null;
  is_admin?: boolean;
  created_at: string;
};
type ConfigData = {
  id: number;
  limit_per_source: number;
  memory_mbytes: number;
  cookie_default: any;
  debug: boolean;
};

const rx = /[A-Za-z\u00C0-\u024F\u0400-\u04FF]/u;
const secondary = (o: string | null, h: string | null) => {
  const oo = (o || "").trim();
  const hh = (h || "").trim();
  const validOcc = !!(oo && rx.test(oo));
  const validHead = !validOcc && !!(hh && rx.test(hh));
  if (validOcc) return oo;
  if (validHead) return hh;
  return "";
};

export default function Page() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [L, setL] = useState<Row[]>([]);
  const [R, setR] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [singleUrl, setSingleUrl] = useState("");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tableFrozen, setTableFrozen] = useState(false);
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const ctrlRef = useRef<AbortController | null>(null);

  const [indOpen, setIndOpen] = useState(false);
  const [industryOptions, setIndustryOptions] = useState<Industry[]>([]);
  const [industrySearch, setIndustrySearch] = useState("");
  const [selectedIndustryIds, setSelectedIndustryIds] = useState<number[]>([]);

  const [pipelineJob, setPipelineJob] = useState<any>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);

  const [industries, setIndustries] = useState<Industry[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [config, setConfig] = useState<ConfigData | null>(null);

  const [industryModal, setIndustryModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    data?: Industry;
  }>({ open: false, mode: "create" });
  const [signalModal, setSignalModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    data?: Signal;
  }>({ open: false, mode: "create" });
  const [deleteIndustryConfirm, setDeleteIndustryConfirm] = useState<{
    open: boolean;
    id?: number;
    name?: string;
  }>({ open: false });
  const [deleteSignalConfirm, setDeleteSignalConfirm] = useState<{
    open: boolean;
    id?: number;
    name?: string;
  }>({ open: false });
  const [deletingIndustryId, setDeletingIndustryId] = useState<number | null>(
    null,
  );
  const [deletingSignalId, setDeletingSignalId] = useState<number | null>(null);
  const [saveConfigConfirm, setSaveConfigConfirm] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [editIndustriesModal, setEditIndustriesModal] = useState<{
    open: boolean;
    row?: Row;
  }>({ open: false });
  const [editingIndustryIds, setEditingIndustryIds] = useState<number[]>([]);
  const [updatingIndustries, setUpdatingIndustries] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setUser(data.user);
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  const loadIndustries = async () => {
    const { data } = await supabase
      .from("industries")
      .select("id,name")
      .order("name");
    setIndustryOptions((data as Industry[]) || []);
  };

  const loadLists = async () => {
    const cols = "id,name,url,occupation,headline,allowed,industry_ids";
    const { data: A } = await supabase
      .from("linkedin")
      .select(cols)
      .eq("allowed", true)
      .order("name", { ascending: true, nullsFirst: false });
    const { data: B } = await supabase
      .from("linkedin")
      .select(cols)
      .eq("allowed", false)
      .order("name", { ascending: true, nullsFirst: false });
    setL(((A as Row[]) || []).map((x) => ({ ...x, allowed: true })));
    setR(((B as Row[]) || []).map((x) => ({ ...x, allowed: false })));
  };

  const loadPipelineStatus = async () => {
    const { data } = await supabase
      .from("pipeline_jobs")
      .select("*")
      .not("status", "in", "(completed,failed)")
      .order("id", { ascending: false })
      .limit(1);
    setPipelineJob(data?.[0] || null);
  };

  const loadAdminIndustries = async () => {
    const res = await fetch("/api/admin/industries");
    const data = await res.json();
    setIndustries(Array.isArray(data) ? data : []);
    loadIndustries();
  };

  const loadAdminSignals = async () => {
    const res = await fetch("/api/admin/signals");
    const data = await res.json();
    setSignals(Array.isArray(data) ? data : []);
  };

  const loadAdminUsers = async () => {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
  };

  const loadAdminConfig = async () => {
    const res = await fetch("/api/admin/config");
    const data = await res.json();
    const configData =
      data && typeof data === "object" && "id" in data
        ? (data as ConfigData)
        : null;
    setConfig(configData);
  };

  const runPipeline = async () => {
    setPipelineLoading(true);
    try {
      await fetch("/api/scrape/verify-and-run", { method: "POST" });
      await loadPipelineStatus();
    } catch (error) {
      console.error("Failed to start pipeline:", error);
    } finally {
      setPipelineLoading(false);
    }
  };

  const handleIndustry = async (action: string, data?: any) => {
    if (action === "delete") {
      setDeletingIndustryId(data.id);
    }
    await fetch("/api/admin/industries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...data }),
    });
    await loadAdminIndustries();
    if (action === "delete") {
      setDeletingIndustryId(null);
      setDeleteIndustryConfirm({ open: false });
    }
  };

  const handleSignal = async (action: string, data?: any) => {
    if (action === "delete") {
      setDeletingSignalId(data.id);
    }
    await fetch("/api/admin/signals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...data }),
    });
    await loadAdminSignals();
    if (action === "delete") {
      setDeletingSignalId(null);
      setDeleteSignalConfirm({ open: false });
    }
  };

  const handleUser = async (action: string, id: number) => {
    await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, id }),
    });
    await loadAdminUsers();
  };

  const handleConfigUpdate = async (updates: Partial<ConfigData>) => {
    setSavingConfig(true);
    await fetch("/api/admin/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(updates),
    });
    await loadAdminConfig();
    setSavingConfig(false);
    setSaveConfigConfirm(false);
  };

  const toggleDebugMode = async () => {
    if (!config || savingConfig) return;
    const next = !config.debug;
    setConfig({ ...config, debug: next });
    await handleConfigUpdate({ debug: next });
  };

  const updateLinkIndustries = async () => {
    if (editingIndustryIds.length === 0 || !editIndustriesModal.row) return;
    setUpdatingIndustries(true);
    await fetch("/api/links/update-industries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: editIndustriesModal.row.id,
        industry_ids: editingIndustryIds,
      }),
    });
    await loadLists();
    setUpdatingIndustries(false);
    setEditIndustriesModal({ open: false });
  };

  useEffect(() => {
    if (!user) return;
    loadIndustries();
    loadLists();
    loadPipelineStatus();
    loadAdminIndustries();
    loadAdminSignals();
    loadAdminUsers();
    loadAdminConfig();

    const interval = setInterval(loadPipelineStatus, 10000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (industryOptions.length === 1 && selectedIndustryIds.length === 0) {
      setSelectedIndustryIds([industryOptions[0].id]);
    }
  }, [industryOptions]);

  const nameOf = (id: number) =>
    industryOptions.find((x) => x.id === id)?.name || String(id);

  const selectionValid = selectedIndustryIds.length > 0;

  const matchInds = (row: Row) => {
    if (!selectionValid) return false;
    const ids = row.industry_ids || [];
    return ids.some((id) => selectedIndustryIds.includes(id));
  };

  const flaggedSortedAllowed = useMemo(() => {
    const withFlag = L.filter(matchInds).map((x) => ({
      ...x,
      flag: !secondary(x.occupation, x.headline),
    }));
    withFlag.sort(
      (a, b) =>
        Number(b.flag) - Number(a.flag) ||
        (a.name || a.url).localeCompare(b.name || b.url),
    );
    return withFlag;
  }, [L, selectedIndustryIds]);

  const filteredR = useMemo(
    () => R.filter(matchInds),
    [R, selectedIndustryIds],
  );

  const runRefresh = async () => {
    setConfirmOpen(false);
    setTableFrozen(true);
    const c = new AbortController();
    ctrlRef.current = c;
    try {
      await fetch("/api/links/refresh", { method: "POST", signal: c.signal });
      await loadLists();
    } catch {}
    setTableFrozen(false);
    ctrlRef.current = null;
  };

  const cancelRefreshAll = () => {
    ctrlRef.current?.abort();
    setTableFrozen(false);
    setConfirmOpen(false);
  };

  const refreshOne = async (id: number) => {
    setLoadingIds((s) => new Set(s).add(id));
    await fetch("/api/links/refresh-one", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadLists();
    setLoadingIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  };

  const toggleAllowed = async (id: number, next: boolean) => {
    if (tableFrozen) return;
    setBusy(true);
    await fetch("/api/links/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, next }),
    });
    await loadLists();
    setBusy(false);
  };

  const addSingle = async () => {
    if (!singleUrl.trim() || !selectionValid) return;
    setBusy(true);
    await fetch("/api/links/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: singleUrl.trim(),
        industry_ids: selectedIndustryIds,
      }),
    });
    setSingleUrl("");
    await loadLists();
    setBusy(false);
  };

  const addBulk = async () => {
    if (!bulkFile || !selectionValid) return;
    setBusy(true);
    const text = await bulkFile.text();
    const qs = `?industry_ids=${encodeURIComponent(selectedIndustryIds.join(","))}`;
    await fetch(`/api/links/bulk${qs}`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: text,
    });
    setBulkFile(null);
    const el = document.getElementById("bulk-input") as HTMLInputElement | null;
    if (el) el.value = "";
    await loadLists();
    setBusy(false);
  };

  const allowAll = async () => {
    setBusy(true);
    await fetch("/api/links/allow-all", { method: "POST" });
    await loadLists();
    setBusy(false);
  };

  const deleteOne = async (id: number) => {
    setBusy(true);
    await fetch("/api/links/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadLists();
    setBusy(false);
  };

  const deleteAll = async (scope: "allowed" | "not-allowed" | "all") => {
    setBusy(true);
    await fetch("/api/links/delete-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope }),
    });
    await loadLists();
    setBusy(false);
  };

  const allVisibleSelected = useMemo(() => {
    if (!selectedIndustryIds.length) return "Select industries";
    if (selectedIndustryIds.length === 1) return nameOf(selectedIndustryIds[0]);
    return `${selectedIndustryIds.length} selected`;
  }, [selectedIndustryIds, industryOptions]);

  const filteredIndustryOptions = useMemo(() => {
    const q = industrySearch.trim().toLowerCase();
    if (!q) return industryOptions;
    return industryOptions.filter((i) => i.name.toLowerCase().includes(q));
  }, [industryOptions, industrySearch]);

  const allChecked =
    filteredIndustryOptions.length > 0 &&
    filteredIndustryOptions.every((i) => selectedIndustryIds.includes(i.id));
  const someChecked =
    filteredIndustryOptions.some((i) => selectedIndustryIds.includes(i.id)) &&
    !allChecked;

  const toggleAllFiltered = () => {
    if (allChecked) {
      const remove = new Set(filteredIndustryOptions.map((i) => i.id));
      setSelectedIndustryIds((prev) => prev.filter((id) => !remove.has(id)));
    } else {
      const add = filteredIndustryOptions.map((i) => i.id);
      setSelectedIndustryIds((prev) => Array.from(new Set([...prev, ...add])));
    }
  };

  if (!user) return null;

  const viewAllowed = flaggedSortedAllowed;
  const debugMode = !!config?.debug;
  const debugLabel = config ? (debugMode ? "Debug" : "Prod") : "Mode";
  const debugButtonClasses = debugMode
    ? "bg-amber-600 hover:bg-amber-700"
    : "bg-green-600 hover:bg-green-700";
  const debugButtonDisabled = !config || savingConfig;

  return (
    <main className="min-h-dvh bg-neutral-50">
      <header className="sticky top-0 z-10 w-full border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-[1600px] px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">
            LinkedIn Admin
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-600 hidden sm:inline">
              {user.email}
            </span>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace("/login");
              }}
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 transition-colors text-neutral-700"
            >
              <FiLogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1600px] px-6 py-4 border-b border-neutral-200 bg-white">
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            disabled={busy}
            onClick={() =>
              tableFrozen ? cancelRefreshAll() : setConfirmOpen(true)
            }
            className="cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiRefreshCw
              className={`w-4 h-4 ${tableFrozen ? "animate-spin" : ""}`}
            />
            <span className="truncate">
              {tableFrozen ? "Cancel" : "Refresh All"}
            </span>
          </button>

          <button
            disabled={pipelineLoading || !!pipelineJob}
            onClick={runPipeline}
            className="cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiSend className="w-4 h-4" />
            <span className="truncate">Run Pipeline</span>
          </button>
          <button
            disabled={debugButtonDisabled}
            onClick={toggleDebugMode}
            className={`cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${debugButtonClasses}`}
          >
            {savingConfig ? (
              <FiRefreshCw className="w-4 h-4 animate-spin" />
            ) : debugMode ? (
              <PiPlugsConnected className="w-4 h-4" />
            ) : (
              <PiPlugs className="w-4 h-4" />
            )}
            <span className="truncate">{debugLabel}</span>
          </button>

          <div className="flex-1 flex gap-2">
            <input
              type="url"
              value={singleUrl}
              onChange={(e) => setSingleUrl(e.target.value)}
              placeholder="https://www.linkedin.com/in/..."
              className="flex-1 px-3 py-2 text-sm rounded-md border border-neutral-300 bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
            />
            <button
              disabled={busy || !singleUrl.trim() || !selectionValid}
              onClick={addSingle}
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap text-neutral-700"
            >
              <FiPlus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>

          <div className="flex gap-2 items-center">
            <label className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 cursor-pointer transition-colors text-neutral-700">
              <FiUpload className="w-4 h-4" />
              <span className="max-w-[120px] truncate">
                {bulkFile ? bulkFile.name : "Choose file"}
              </span>
              <input
                id="bulk-input"
                type="file"
                accept="text/*"
                onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                className="sr-only"
              />
            </label>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIndOpen((s) => !s)}
                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 transition-colors text-neutral-700"
              >
                <FiTag className="w-4 h-4" />
                <span className="truncate">{allVisibleSelected}</span>
              </button>
              {indOpen && (
                <div className="absolute z-40 mt-2 w-80 bg-white border border-neutral-200 rounded-md shadow-lg p-3">
                  {industryOptions.length > 1 && (
                    <div className="flex items-center gap-2 mb-2">
                      <FiSearch className="w-4 h-4 text-neutral-500" />
                      <input
                        value={industrySearch}
                        onChange={(e) => setIndustrySearch(e.target.value)}
                        placeholder="Search industries"
                        className="flex-1 px-2 py-1 text-sm rounded border border-neutral-300 focus:outline-none"
                      />
                    </div>
                  )}
                  {industryOptions.length > 1 && (
                    <button
                      type="button"
                      onClick={toggleAllFiltered}
                      className="cursor-pointer w-full flex items-center justify-between px-2 py-2 text-sm rounded hover:bg-neutral-50"
                    >
                      <span>Select all (filtered)</span>
                      {allChecked ? (
                        <FiCheckSquare className="w-4 h-4" />
                      ) : someChecked ? (
                        <div className="w-4 h-4 border border-neutral-400 bg-neutral-300" />
                      ) : (
                        <FiSquare className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <div
                    className={`max-h-56 overflow-auto space-y-1 ${industryOptions.length > 1 ? "mt-2" : ""}`}
                  >
                    {industryOptions.length === 0 && (
                      <div className="text-xs text-neutral-500 px-1 py-1.5">
                        No industries
                      </div>
                    )}
                    {industryOptions
                      .filter((i) =>
                        i.name
                          .toLowerCase()
                          .includes(industrySearch.trim().toLowerCase()),
                      )
                      .map((opt) => {
                        const checked = selectedIndustryIds.includes(opt.id);
                        return (
                          <label
                            key={opt.id}
                            className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-neutral-50 cursor-pointer"
                          >
                            <span className="text-sm text-neutral-800">
                              {opt.name}
                            </span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelectedIndustryIds((prev) =>
                                  checked
                                    ? prev.filter((x) => x !== opt.id)
                                    : [...prev, opt.id],
                                )
                              }
                              className="h-4 w-4"
                            />
                          </label>
                        );
                      })}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedIndustryIds([])}
                      className="cursor-pointer px-3 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 text-neutral-700"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setIndOpen(false)}
                      className="cursor-pointer px-3 py-2 text-sm rounded-md bg-neutral-900 text-white hover:bg-neutral-800"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              disabled={busy || !bulkFile || !selectionValid}
              onClick={addBulk}
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <FiUpload className="w-4 h-4" />
              <span>Upload</span>
            </button>

            <button
              disabled={busy || tableFrozen}
              onClick={() => deleteAll("all")}
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
            >
              <FiTrash2 className="w-4 h-4" />
              <span className="truncate">Delete Everything</span>
            </button>
          </div>
        </div>
      </section>

      {pipelineJob && (
        <section className="mx-auto max-w-[1600px] px-6 py-4 border-b border-neutral-200">
          <div className="bg-white rounded-lg border border-neutral-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">
                Pipeline Status
              </h3>
              <span className="px-3 py-1 text-xs font-medium rounded-full">
                {pipelineJob.status.toUpperCase()}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-600">Progress:</span>
                <span className="font-medium text-neutral-900">
                  {pipelineJob.current_batch_offset} / {pipelineJob.total_items}
                </span>
              </div>

              {pipelineJob.total_items > 0 && (
                <div className="w-full bg-neutral-200 rounded-full h-2">
                  <div
                    className="bg-neutral-800 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (pipelineJob.current_batch_offset / pipelineJob.total_items) * 100)}%`,
                    }}
                  />
                </div>
              )}

              {pipelineJob.error_message && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                  <FiAlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900">Error</p>
                    <p className="text-xs text-red-700 mt-1">
                      {pipelineJob.error_message}
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      Retry {pipelineJob.retry_count} /{" "}
                      {pipelineJob.max_retries}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-neutral-500 pt-2 border-t border-neutral-200">
                <span>
                  Started: {new Date(pipelineJob.started_at).toLocaleString()}
                </span>
                <span>
                  Updated: {new Date(pipelineJob.updated_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-[1600px] px-6 py-4">
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50">
              <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">
                <FiUsers className="inline w-4 h-4 mr-1" />
                Users ({users.length})
              </h3>
            </div>
            <div className="overflow-auto" style={{ maxHeight: "600px" }}>
              <table className="w-full">
                <thead className="sticky top-0 bg-white border-b border-neutral-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                      Chat ID
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-neutral-600 uppercase tracking-wider w-[180px]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {[...users]
                    .sort((a, b) => (b.is_admin ? 1 : 0) - (a.is_admin ? 1 : 0))
                    .map((u) => (
                      <tr
                        key={u.id}
                        className="hover:bg-neutral-50 transition-colors"
                      >
                        <td className="px-6 py-4 text-sm text-neutral-900">
                          {u.email}
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-600">
                          {[u.first_name, u.last_name]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-600">
                          {u.telegram_chat_id || "—"}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {u.telegram_chat_id && (
                              <button
                                onClick={() => handleUser("toggle-admin", u.id)}
                                className={`flex gap-x-2 items-center cursor-pointer py-1.5 text-xs
font-medium
${u.is_admin ? "text-green-600" : "text-neutral-600"}`}
                              >
                                {u.is_admin && "admin"}
                                <IoToggle
                                  className={`w-6 h-6 ${!u.is_admin && "rotate-180"}`}
                                />
                              </button>
                            )}
                            <button
                              onClick={() => handleUser("delete", u.id)}
                              className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50"
                            >
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-neutral-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide mb-4">
                <FiSettings className="inline w-4 h-4 mr-1" />
                Scraper Config
              </h3>
              {config && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Limit Per Source
                    </label>
                    <input
                      type="number"
                      value={config.limit_per_source}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          limit_per_source: parseInt(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 text-sm rounded border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Memory (MB)
                    </label>
                    <input
                      type="number"
                      value={config.memory_mbytes}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          memory_mbytes: parseInt(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 text-sm rounded border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Cookie Default (JSON)
                    </label>
                    <textarea
                      value={JSON.stringify(config.cookie_default, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          setConfig({ ...config, cookie_default: parsed });
                        } catch {}
                      }}
                      rows={4}
                      className="w-full px-3 py-2 text-sm rounded border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                    />
                  </div>
                  <button
                    onClick={() => setSaveConfigConfirm(true)}
                    disabled={savingConfig}
                    className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingConfig && (
                      <FiRefreshCw className="w-4 h-4 animate-spin" />
                    )}
                    <span>Save Config</span>
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white border border-neutral-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">
                  Industries ({industries.length})
                </h3>
                <button
                  onClick={() =>
                    setIndustryModal({ open: true, mode: "create" })
                  }
                  className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded bg-neutral-900 text-white hover:bg-neutral-800"
                >
                  <FiPlus className="w-4 h-4" />
                  Add
                </button>
              </div>
              <div className="overflow-auto" style={{ maxHeight: "300px" }}>
                <table className="w-full">
                  <thead className="sticky top-0 bg-white border-b border-neutral-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                        Name
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-neutral-600 uppercase w-[180px]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {industries.map((ind) => (
                      <tr key={ind.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 text-sm text-neutral-900">
                          {ind.name}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() =>
                                handleIndustry("toggle-visible", { id: ind.id })
                              }
                              className={`cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                                ind.visible
                                  ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                                  : "border-neutral-300 bg-neutral-50 text-neutral-500 hover:bg-neutral-100"
                              }`}
                            >
                              {ind.visible ? (
                                <FiEye className="w-3.5 h-3.5" />
                              ) : (
                                <FiEyeOff className="w-3.5 h-3.5" />
                              )}
                              {ind.visible ? "Visible" : "Hidden"}
                            </button>
                            <button
                              onClick={() =>
                                setIndustryModal({
                                  open: true,
                                  mode: "edit",
                                  data: ind,
                                })
                              }
                              className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50"
                            >
                              <FiEdit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                setDeleteIndustryConfirm({
                                  open: true,
                                  id: ind.id,
                                  name: ind.name,
                                })
                              }
                              disabled={deletingIndustryId === ind.id}
                              className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {deletingIndustryId === ind.id ? (
                                <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FiTrash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-neutral-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">
                  Signals ({signals.length})
                </h3>
                <button
                  onClick={() => setSignalModal({ open: true, mode: "create" })}
                  className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded bg-neutral-900 text-white hover:bg-neutral-800"
                >
                  <FiPlus className="w-4 h-4" />
                  Add
                </button>
              </div>
              <div className="overflow-auto" style={{ maxHeight: "300px" }}>
                <table className="w-full">
                  <thead className="sticky top-0 bg-white border-b border-neutral-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-600 uppercase">
                        Name
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-neutral-600 uppercase w-[180px]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {signals.map((sig) => (
                      <tr key={sig.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 text-sm text-neutral-900">
                          {sig.name}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() =>
                                handleSignal("toggle-visible", { id: sig.id })
                              }
                              className={`cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                                sig.visible
                                  ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                                  : "border-neutral-300 bg-neutral-50 text-neutral-500 hover:bg-neutral-100"
                              }`}
                            >
                              {sig.visible ? (
                                <FiEye className="w-3.5 h-3.5" />
                              ) : (
                                <FiEyeOff className="w-3.5 h-3.5" />
                              )}
                              {sig.visible ? "Visible" : "Hidden"}
                            </button>
                            <button
                              onClick={() =>
                                setSignalModal({
                                  open: true,
                                  mode: "edit",
                                  data: sig,
                                })
                              }
                              className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50"
                            >
                              <FiEdit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                setDeleteSignalConfirm({
                                  open: true,
                                  id: sig.id,
                                  name: sig.name,
                                })
                              }
                              disabled={deletingSignalId === sig.id}
                              className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {deletingSignalId === sig.id ? (
                                <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FiTrash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      {industryModal.open && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">
                {industryModal.mode === "create"
                  ? "Add Industry"
                  : "Edit Industry"}
              </h2>
              <button
                onClick={() =>
                  setIndustryModal({ open: false, mode: "create" })
                }
              >
                <FiX className="cursor-pointer w-5 h-5 text-neutral-500" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const name = (
                  form.elements.namedItem("name") as HTMLInputElement
                ).value;
                if (industryModal.mode === "create") {
                  handleIndustry("create", { name, visible: false });
                } else {
                  handleIndustry("update", {
                    name,
                  });
                }
                setIndustryModal({ open: false, mode: "create" });
              }}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Name
                  </label>
                  <input
                    name="name"
                    type="text"
                    defaultValue={industryModal.data?.name || ""}
                    required
                    className="w-full px-3 py-2 text-sm rounded border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setIndustryModal({ open: false, mode: "create" })
                    }
                    className="cursor-pointer px-4 py-2 text-sm rounded border border-neutral-300 hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="cursor-pointer px-4 py-2 text-sm rounded bg-neutral-900 text-white hover:bg-neutral-800"
                  >
                    {industryModal.mode === "create" ? "Create" : "Update"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {signalModal.open && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">
                {signalModal.mode === "create" ? "Add Signal" : "Edit Signal"}
              </h2>
              <button
                className="cursor-pointer"
                onClick={() => setSignalModal({ open: false, mode: "create" })}
              >
                <FiX className="w-5 h-5 text-neutral-500" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const name = (
                  form.elements.namedItem("name") as HTMLInputElement
                ).value;
                const prompt = (
                  form.elements.namedItem("prompt") as HTMLTextAreaElement
                ).value;
                const embedding_query = (
                  form.elements.namedItem(
                    "embedding_query",
                  ) as HTMLTextAreaElement
                ).value;
                if (signalModal.mode === "create") {
                  handleSignal("create", {
                    name,
                    visible: false,
                    prompt,
                    embedding_query,
                  });
                } else {
                  handleSignal("update", {
                    id: signalModal.data?.id,
                    name,
                    prompt,
                    embedding_query,
                  });
                }
                setSignalModal({ open: false, mode: "create" });
              }}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Name
                  </label>
                  <input
                    name="name"
                    type="text"
                    defaultValue={signalModal.data?.name || ""}
                    required
                    className="w-full px-3 py-2 text-sm rounded border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    System Prompt
                  </label>
                  <textarea
                    name="prompt"
                    defaultValue={signalModal.data?.prompt || ""}
                    rows={6}
                    className="w-full px-3 py-2 text-sm rounded border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Embedding Query
                  </label>
                  <textarea
                    name="embedding_query"
                    defaultValue={signalModal.data?.embedding_query || ""}
                    rows={3}
                    className="w-full px-3 py-2 text-sm rounded border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setSignalModal({ open: false, mode: "create" })
                    }
                    className="cursor-pointer px-4 py-2 text-sm rounded border border-neutral-300 hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="cursor-pointer px-4 py-2 text-sm rounded bg-neutral-900 text-white hover:bg-neutral-800"
                  >
                    {signalModal.mode === "create" ? "Create" : "Update"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-2">
              Refresh all links?
            </h2>
            <p className="text-sm text-neutral-600 mb-6">
              This will fetch updated information for all LinkedIn profiles.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                className="cursor-pointer px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 transition-colors text-neutral-700"
              >
                Cancel
              </button>
              <button
                onClick={() => runRefresh()}
                className="cursor-pointer px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteIndustryConfirm.open && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-2">
              Delete industry "{deleteIndustryConfirm.name}"?
            </h2>
            <p className="text-sm text-neutral-600 mb-6">
              This will remove the industry and clean up all LinkedIn profiles.
              Links with only this industry will be deleted. Links with multiple
              industries will have this industry removed.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteIndustryConfirm({ open: false })}
                disabled={deletingIndustryId !== null}
                className="cursor-pointer px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 transition-colors text-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleIndustry("delete", { id: deleteIndustryConfirm.id })
                }
                disabled={deletingIndustryId !== null}
                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingIndustryId === deleteIndustryConfirm.id && (
                  <FiRefreshCw className="w-4 h-4 animate-spin" />
                )}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteSignalConfirm.open && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-2">
              Delete signal "{deleteSignalConfirm.name}"?
            </h2>
            <p className="text-sm text-neutral-600 mb-6">
              This will permanently remove the signal. This action cannot be
              undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteSignalConfirm({ open: false })}
                disabled={deletingSignalId !== null}
                className="cursor-pointer px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 transition-colors text-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleSignal("delete", { id: deleteSignalConfirm.id })
                }
                disabled={deletingSignalId !== null}
                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingSignalId === deleteSignalConfirm.id && (
                  <FiRefreshCw className="w-4 h-4 animate-spin" />
                )}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {saveConfigConfirm && config && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-2">
              Save scraper configuration?
            </h2>
            <p className="text-sm text-neutral-600 mb-6">
              This will update the scraper settings. The new configuration will
              be used for all future scraping operations.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSaveConfigConfirm(false)}
                disabled={savingConfig}
                className="cursor-pointer px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 transition-colors text-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfigUpdate(config)}
                disabled={savingConfig}
                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-neutral-900 text-white hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingConfig && (
                  <FiRefreshCw className="w-4 h-4 animate-spin" />
                )}
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {editIndustriesModal.open && editIndustriesModal.row && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-lg shadow-xl max-w-xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-900">
                Edit Industries
              </h2>
              <button
                onClick={() => setEditIndustriesModal({ open: false })}
                disabled={updatingIndustries}
                className="cursor-pointer text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-neutral-600 mb-1">Profile:</p>
              <a
                href={editIndustriesModal.row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 break-all"
              >
                {editIndustriesModal.row.name || editIndustriesModal.row.url}
              </a>
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium text-neutral-700 mb-3">
                Select Industries{" "}
                <span className="text-neutral-500 font-normal">
                  (at least one required)
                </span>
              </p>
              <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                {industryOptions.map((ind) => {
                  const isSelected = editingIndustryIds.includes(ind.id);
                  return (
                    <button
                      key={ind.id}
                      onClick={() => {
                        if (isSelected) {
                          if (editingIndustryIds.length > 1) {
                            setEditingIndustryIds(
                              editingIndustryIds.filter((id) => id !== ind.id),
                            );
                          }
                        } else {
                          setEditingIndustryIds([
                            ...editingIndustryIds,
                            ind.id,
                          ]);
                        }
                      }}
                      disabled={
                        updatingIndustries ||
                        (isSelected && editingIndustryIds.length === 1)
                      }
                      className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        isSelected
                          ? "bg-neutral-900 text-white border-neutral-900"
                          : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      <span className="truncate max-w-[200px]">{ind.name}</span>
                      {isSelected && (
                        <FiX className="w-3.5 h-3.5 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                {editingIndustryIds.length} industry(ies) selected
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setEditIndustriesModal({ open: false })}
                disabled={updatingIndustries}
                className="cursor-pointer px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 transition-colors text-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={updateLinkIndustries}
                disabled={updatingIndustries || editingIndustryIds.length === 0}
                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-neutral-900 text-white hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updatingIndustries && (
                  <FiRefreshCw className="w-4 h-4 animate-spin" />
                )}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="transition-opacity duration-200"
        style={{
          opacity: tableFrozen ? 0.6 : 1,
          pointerEvents: tableFrozen ? ("none" as const) : "auto",
        }}
      >
        <div className="mx-auto max-w-[1600px] px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-px bg-neutral-200 rounded-lg overflow-hidden border border-neutral-200">
            <section className="bg-white flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50 min-h-16">
                <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">
                  Allowed ({viewAllowed.length})
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    disabled={tableFrozen || busy || L.length === 0}
                    onClick={() => deleteAll("allowed")}
                    className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                  >
                    <FiTrash2 className="w-3.5 h-3.5" />
                    <span>Delete All</span>
                  </button>
                </div>
              </div>
              <div
                className="overflow-y-auto"
                style={{ maxHeight: "calc(100vh - 240px)" }}
              >
                <table className="w-full">
                  <thead className="sticky top-0 bg-white border-b border-neutral-200 z-10">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                        Info
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-600 uppercase tracking-wider w-[270px]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {!selectionValid && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-12 text-center text-sm text-neutral-500"
                        >
                          Select at least one industry to see results
                        </td>
                      </tr>
                    )}
                    {selectionValid &&
                      viewAllowed.map((x) => {
                        const sec = secondary(x.occupation, x.headline);
                        const flag = !sec;
                        const isLoading = loadingIds.has(x.id);
                        return (
                          <tr
                            key={x.id}
                            className="hover:bg-neutral-50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <a
                                  href={x.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-medium text-neutral-900 hover:text-neutral-600 transition-colors"
                                >
                                  {x.name || x.url}
                                </a>
                                {flag && (
                                  <FiAlertTriangle
                                    className="w-4 h-4 text-amber-500 flex-shrink-0"
                                    title="Missing info"
                                  />
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <p
                                className={`text-sm  line-clamp-2 ${flag ? "text-amber-500 font-medium" : "text-neutral-600"}`}
                              >
                                {sec || "Unverifiable"}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  disabled={tableFrozen || busy}
                                  onClick={() => {
                                    setEditIndustriesModal({
                                      open: true,
                                      row: x,
                                    });
                                    setEditingIndustryIds([
                                      ...(x.industry_ids || []),
                                    ]);
                                  }}
                                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                                  title="Edit industries"
                                >
                                  <FiTag className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  disabled={tableFrozen || busy || isLoading}
                                  onClick={() => refreshOne(x.id)}
                                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                                >
                                  <FiRefreshCw
                                    className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
                                  />
                                </button>
                                <button
                                  disabled={tableFrozen || busy}
                                  onClick={() => toggleAllowed(x.id, false)}
                                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                                >
                                  <FiChevronRight className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  disabled={tableFrozen || busy}
                                  onClick={() => deleteOne(x.id)}
                                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                                >
                                  <FiTrash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {selectionValid && viewAllowed.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-12 text-center text-sm text-neutral-500"
                        >
                          No allowed profiles for selected industries
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50 min-h-16">
                <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">
                  Not Allowed ({selectionValid ? filteredR.length : 0})
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    disabled={
                      tableFrozen ||
                      busy ||
                      !selectionValid ||
                      filteredR.length === 0
                    }
                    onClick={allowAll}
                    className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <FiSend className="w-3.5 h-3.5" />
                    <span>Allow All</span>
                  </button>
                  <button
                    disabled={
                      tableFrozen ||
                      busy ||
                      !selectionValid ||
                      filteredR.length === 0
                    }
                    onClick={() => deleteAll("not-allowed")}
                    className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                  >
                    <FiTrash2 className="w-3.5 h-3.5" />
                    <span>Delete All</span>
                  </button>
                </div>
              </div>
              <div
                className="overflow-y-auto"
                style={{ maxHeight: "calc(100vh - 240px)" }}
              >
                <table className="w-full">
                  <thead className="sticky top-0 bg-white border-b border-neutral-200 z-10">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                        Info
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-600 uppercase tracking-wider w-[270px]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {!selectionValid && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-12 text-center text-sm text-neutral-500"
                        >
                          Select at least one industry to see results
                        </td>
                      </tr>
                    )}
                    {selectionValid &&
                      filteredR.map((x) => {
                        const sec = secondary(x.occupation, x.headline);
                        const isLoading = loadingIds.has(x.id);
                        return (
                          <tr
                            key={x.id}
                            className="hover:bg-neutral-50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <a
                                href={x.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-neutral-900 hover:text-neutral-600 transition-colors"
                              >
                                {x.name || x.url}
                              </a>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm text-neutral-600 line-clamp-2">
                                {sec || "—"}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  disabled={tableFrozen || busy}
                                  onClick={() => {
                                    setEditIndustriesModal({
                                      open: true,
                                      row: x,
                                    });
                                    setEditingIndustryIds([
                                      ...(x.industry_ids || []),
                                    ]);
                                  }}
                                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                                  title="Edit industries"
                                >
                                  <FiTag className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  disabled={tableFrozen || busy || isLoading}
                                  onClick={() => refreshOne(x.id)}
                                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                                >
                                  <FiRefreshCw
                                    className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
                                  />
                                </button>
                                <button
                                  disabled={tableFrozen || busy}
                                  onClick={() => toggleAllowed(x.id, true)}
                                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                                >
                                  <FiChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  disabled={tableFrozen || busy}
                                  onClick={() => deleteOne(x.id)}
                                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                                >
                                  <FiTrash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {selectionValid && filteredR.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-12 text-center text-sm text-neutral-500"
                        >
                          No profiles pending review for selected industries
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
