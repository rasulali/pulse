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
  FiTrash2,
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
  allowed?: boolean;
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

  const loadLists = async () => {
    const { data: A } = await supabase
      .from("linkedin")
      .select("id,name,url,occupation,headline,allowed")
      .eq("allowed", true)
      .order("name", { ascending: true, nullsFirst: false });
    const { data: B } = await supabase
      .from("linkedin")
      .select("id,name,url,occupation,headline,allowed")
      .eq("allowed", false)
      .order("name", { ascending: true, nullsFirst: false });
    setL(((A as Row[]) || []).map((x) => ({ ...x, allowed: true })));
    setR(((B as Row[]) || []).map((x) => ({ ...x, allowed: false })));
  };

  useEffect(() => {
    if (!user) return;
    loadLists();
  }, [user]);

  const flaggedSortedAllowed = useMemo(() => {
    const withFlag = L.map((x) => ({
      ...x,
      flag: !secondary(x.occupation, x.headline),
    }));
    withFlag.sort(
      (a, b) =>
        Number(b.flag) - Number(a.flag) ||
        (a.name || a.url).localeCompare(b.name || b.url),
    );
    return withFlag;
  }, [L]);

  const runRefresh = async (opts?: { datasetUrl?: string }) => {
    setConfirmOpen(false);
    // Normal refresh: allow cancel (AbortController). Dataset refresh: no cancel.
    if (!opts?.datasetUrl) {
      setTableFrozen(true);
      const c = new AbortController();
      ctrlRef.current = c;
      try {
        await fetch("/api/links/refresh", { method: "POST", signal: c.signal });
        await loadLists();
      } catch {}
      setTableFrozen(false);
      ctrlRef.current = null;
    } else {
      setTableFrozen(true);
      try {
        await fetch("/api/links/refresh-from-dataset", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ datasetUrl: opts.datasetUrl }),
        });
        await loadLists();
      } catch {}
      setTableFrozen(false);
    }
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

  const toggle = async (id: number, next: boolean) => {
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
    if (!singleUrl.trim()) return;
    setBusy(true);
    await fetch("/api/links/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: singleUrl.trim() }),
    });
    setSingleUrl("");
    await loadLists();
    setBusy(false);
  };

  const addBulk = async () => {
    if (!bulkFile) return;
    setBusy(true);
    const text = await bulkFile.text();
    await fetch("/api/links/bulk", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: text,
    });
    setBulkFile(null);
    (document.getElementById("bulk-input") as HTMLInputElement | null)?.value &&
      ((document.getElementById("bulk-input") as HTMLInputElement).value = "");
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

  if (!user) return null;

  return (
    <main className="min-h-dvh bg-neutral-50">
      <header className="sticky top-0 z-10 w-full border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-[1600px] px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">Admin</h1>
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
              disabled={busy || !singleUrl.trim()}
              onClick={addSingle}
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap text-neutral-700"
            >
              <FiPlus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>

          <div className="flex gap-2">
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
            <button
              disabled={busy || !bulkFile}
              onClick={addBulk}
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <FiUpload className="w-4 h-4" />
              <span>Upload</span>
            </button>
            <button
              disabled={busy || L.length + R.length === 0}
              onClick={() => deleteAll("all")}
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap text-neutral-700"
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
              This may take a while.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                className="cursor-pointer px-4 py-2 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 transition-colors text-neutral-700"
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
                className="cursor-pointer px-4 py-2 text-sm rounded-md bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
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
                  Allowed ({flaggedSortedAllowed.length})
                </h2>
                <button
                  disabled={tableFrozen || busy || L.length === 0}
                  onClick={() => deleteAll("allowed")}
                  className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                >
                  <FiTrash2 className="w-3.5 h-3.5" />
                  <span>Delete All</span>
                </button>
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
                    {flaggedSortedAllowed.map((x, i) => {
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
                                {x.name || `Profile ${i + 1}`}
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
                                className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                              >
                                <FiRefreshCw
                                  className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
                                />
                              </button>
                              <button
                                disabled={tableFrozen || busy}
                                onClick={() => toggle(x.id, false)}
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
                    {flaggedSortedAllowed.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-12 text-center text-sm text-neutral-500"
                        >
                          No allowed profiles yet
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
                  Not Allowed ({R.length})
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    disabled={tableFrozen || busy || R.length === 0}
                    onClick={allowAll}
                    className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <FiSend className="w-3.5 h-3.5" />
                    <span>Allow All</span>
                  </button>
                  <button
                    disabled={tableFrozen || busy || R.length === 0}
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
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-600 uppercase tracking-wider w-[220px]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {R.map((x, i) => {
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
                              {x.name || `Profile ${i + 1}`}
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
                                className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-neutral-700"
                              >
                                <FiRefreshCw
                                  className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
                                />
                              </button>
                              <button
                                disabled={tableFrozen || busy}
                                onClick={() => toggle(x.id, true)}
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
                    {R.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-12 text-center text-sm text-neutral-500"
                        >
                          No profiles pending review
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
