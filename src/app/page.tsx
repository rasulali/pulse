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
} from "react-icons/fi";

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

type Industry = { id: number; name: string };

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

  useEffect(() => {
    if (!user) return;
    loadIndustries();
    loadLists();
  }, [user]);

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

  const runRefresh = async (opts?: { datasetUrl?: string }) => {
    setConfirmOpen(false);
    setTableFrozen(true);
    if (opts?.datasetUrl) {
      try {
        await fetch("/api/links/refresh-from-dataset", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ datasetUrl: opts.datasetUrl }),
        });
        await loadLists();
      } finally {
        setTableFrozen(false);
      }
      return;
    }
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
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 transition-colors text-neutral-700"
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
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FiRefreshCw
              className={`w-4 h-4 ${tableFrozen ? "animate-spin" : ""}`}
            />
            <span>{tableFrozen ? "Cancel" : "Refresh All"}</span>
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
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap text-neutral-700"
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
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 transition-colors text-neutral-700"
              >
                <FiTag className="w-4 h-4" />
                <span>{allVisibleSelected}</span>
              </button>
              {indOpen && (
                <div className="absolute z-40 mt-2 w-80 bg-white border border-neutral-200 rounded-md shadow-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FiSearch className="w-4 h-4 text-neutral-500" />
                    <input
                      value={industrySearch}
                      onChange={(e) => setIndustrySearch(e.target.value)}
                      placeholder="Search industries"
                      className="flex-1 px-2 py-1 text-sm rounded border border-neutral-300 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={toggleAllFiltered}
                    className="w-full flex items-center justify-between px-2 py-2 text-sm rounded hover:bg-neutral-50"
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
                  <div className="max-h-56 overflow-auto mt-2 space-y-1">
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
                      className="px-3 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 text-neutral-700"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setIndOpen(false)}
                      className="px-3 py-2 text-sm rounded-md bg-neutral-900 text-white hover:bg-neutral-800"
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
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <FiUpload className="w-4 h-4" />
              <span>Upload</span>
            </button>

            <button
              disabled={busy || tableFrozen}
              onClick={() => deleteAll("all")}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
            >
              <FiTrash2 className="w-4 h-4" />
              <span>Delete Everything</span>
            </button>
          </div>
        </div>
      </section>

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
                className="px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 transition-colors text-neutral-700"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  runRefresh({
                    datasetUrl:
                      "https://api.apify.com/v2/datasets/WEwfHpbas3p2UbgQJ/items",
                  })
                }
                className="px-4 py-2 text-sm rounded-md bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
              >
                Confirm
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
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
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
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-600 uppercase tracking-wider w-[220px]">
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
                                  disabled={tableFrozen || busy || isLoading}
                                  onClick={() => refreshOne(x.id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                                >
                                  <FiRefreshCw
                                    className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
                                  />
                                </button>
                                <button
                                  disabled={tableFrozen || busy}
                                  onClick={() => toggleAllowed(x.id, false)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                                >
                                  <FiChevronRight className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  disabled={tableFrozen || busy}
                                  onClick={() => deleteOne(x.id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
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
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
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
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-600 uppercase tracking-wider w-[220px]">
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
                                  disabled={tableFrozen || busy || isLoading}
                                  onClick={() => refreshOne(x.id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                                >
                                  <FiRefreshCw
                                    className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
                                  />
                                </button>
                                <button
                                  disabled={tableFrozen || busy}
                                  onClick={() => toggleAllowed(x.id, true)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                                >
                                  <FiChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  disabled={tableFrozen || busy}
                                  onClick={() => deleteOne(x.id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
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
