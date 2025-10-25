"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  IoChevronDown,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoCopyOutline,
} from "react-icons/io5";
import { BiLogoTelegram } from "react-icons/bi";

type Option = { id: number; name: string };

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
);

const Toast = ({
  type,
  text,
  visible,
}: {
  type: "success" | "error";
  text: string;
  visible: boolean;
}) => {
  if (!visible) return null;
  return (
    <div
      className={[
        "fixed bottom-6 z-50",
        "left-6 right-6",
        "md:left-auto md:right-6",
        "rounded-lg p-4 flex items-center gap-3 shadow-lg",
        type === "error"
          ? "bg-red-50 border border-red-200 text-red-900"
          : "bg-green-50 border border-green-200 text-green-900",
      ].join(" ")}
      role="status"
    >
      {type === "error" ? (
        <IoCloseCircle className="w-5 h-5" />
      ) : (
        <IoCheckmarkCircle className="w-5 h-5" />
      )}
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
};

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const [industryOpts, setIndustryOpts] = useState<Option[]>([]);
  const [signalOpts, setSignalOpts] = useState<Option[]>([]);
  const [industryIds, setIndustryIds] = useState<number[]>([]);
  const [signalIds, setSignalIds] = useState<number[]>([]);

  const [openInd, setOpenInd] = useState(false);
  const [openSig, setOpenSig] = useState(false);
  const indRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const [toast, setToast] = useState<{
    type: "success" | "error";
    text: string;
    visible: boolean;
  }>({
    type: "success",
    text: "",
    visible: false,
  });

  const showToast = (type: "success" | "error", text: string, ms = 3500) => {
    setToast({ type, text, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), ms);
  };

  useEffect(() => {
    (async () => {
      const [{ data: inds, error: e1 }, { data: sigs, error: e2 }] =
        await Promise.all([
          sb
            .from("industries")
            .select("id,name")
            .eq("visible", true)
            .order("id"),
          sb.from("signals").select("id,name").eq("visible", true).order("id"),
        ]);
      if (e1) showToast("error", e1.message);
      if (e2) showToast("error", e2.message);
      setIndustryOpts(inds ?? []);
      setSignalOpts(sigs ?? []);
    })().catch(() => showToast("error", "Failed to load options"));
  }, []);

  useEffect(() => {
    if (industryOpts.length === 1 && industryIds.length === 0)
      setIndustryIds([industryOpts[0].id]);
  }, [industryOpts, industryIds.length]);

  useEffect(() => {
    if (signalOpts.length === 1 && signalIds.length === 0)
      setSignalIds([signalOpts[0].id]);
  }, [signalOpts, signalIds.length]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (indRef.current && !indRef.current.contains(e.target as Node))
        setOpenInd(false);
      if (sigRef.current && !sigRef.current.contains(e.target as Node))
        setOpenSig(false);
    };
    const esc = (e: KeyboardEvent) =>
      e.key === "Escape" && (setOpenInd(false), setOpenSig(false));
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const toggle = (ids: number[], set: (v: number[]) => void, id: number) =>
    set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTelegramLink(null);
    setCopyState("idle");

    if (!email.includes("@")) return showToast("error", "Invalid email");
    if (industryIds.length === 0)
      return showToast("error", "Select at least one industry");
    if (signalIds.length === 0)
      return showToast("error", "Select at least one signal");

    setLoading(true);
    try {
      const r = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          industryIds,
          signalIds,
        }),
      });
      const data: { telegramLink?: string; error?: string } = await r.json();
      if (data.error) return showToast("error", data.error);
      if (data.telegramLink) {
        setTelegramLink(data.telegramLink);
        showToast("success", "Registration successful. Connect your Telegram.");
      }
    } catch {
      showToast("error", "Network error");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!telegramLink) return;
    try {
      await navigator.clipboard.writeText(telegramLink);
      setCopyState("ok");
    } catch {
      setCopyState("fail");
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center">
      <Toast type={toast.type} text={toast.text} visible={toast.visible} />

      <div className="w-full max-w-xl p-6">
        <header className="mb-6 text-center">
          <h2 className="text-3xl font-bold text-black">Welcome to Pulse AI</h2>
          <p className="text-gray-500 mt-2 text-sm">
            Please confirm your details to join the private beta.
          </p>
        </header>

        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-black mb-2">
                First Name
              </label>
              <input
                className="w-full bg-white rounded-lg py-2.5 px-4 text-black shadow-[inset_4px_4px_8px_#e6e6e6,inset_-4px_-4px_8px_#ffffff] outline-none transition-shadow duration-300"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First Name"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">
                Last Name
              </label>
              <input
                className="w-full bg-white rounded-lg py-2.5 px-4 text-black shadow-[inset_4px_4px_8px_#e6e6e6,inset_-4px_-4px_8px_#ffffff] outline-none transition-shadow duration-300"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last Name"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-black mb-2">
              Email
            </label>
            <input
              type="email"
              className="w-full bg-white rounded-lg py-2.5 px-4 text-black shadow-[inset_4px_4px_8px_#e6e6e6,inset_-4px_-4px_8px_#ffffff] outline-none transition-shadow duration-300"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@gmail.com"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2" ref={indRef}>
              <label className="block text-sm font-semibold text-black">
                Industries
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenInd(!openInd)}
                  className="w-full bg-white rounded-lg py-2.5 px-4 text-left text-black shadow-[inset_4px_4px_8px_#e6e6e6,inset_-4px_-4px_8px_#ffffff] flex items-center justify-between"
                >
                  <span className="text-gray-500">
                    {industryIds.length
                      ? industryOpts
                          .filter((o) => industryIds.includes(o.id))
                          .map((o) => o.name)
                          .join(", ")
                      : "Select..."}
                  </span>
                  <IoChevronDown
                    className={`w-5 h-5 transition-transform ${openInd ? "rotate-180" : ""}`}
                  />
                </button>
                {openInd && (
                  <div className="absolute mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                    <ul className="py-2 text-sm text-black max-h-60 overflow-auto">
                      {industryOpts.map((opt) => (
                        <li key={opt.id}>
                          <label className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-black"
                              checked={industryIds.includes(opt.id)}
                              onChange={() =>
                                toggle(industryIds, setIndustryIds, opt.id)
                              }
                            />
                            <span>{opt.name}</span>
                          </label>
                        </li>
                      ))}
                      {industryOpts.length === 0 && (
                        <li className="px-4 py-2 text-gray-500">No options</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2" ref={sigRef}>
              <label className="block text-sm font-semibold text-black">
                Signals
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenSig(!openSig)}
                  className="w-full bg-white rounded-lg py-2.5 px-4 text-left text-black shadow-[inset_4px_4px_8px_#e6e6e6,inset_-4px_-4px_8px_#ffffff] flex items-center justify-between"
                >
                  <span className="text-gray-500">
                    {signalIds.length
                      ? signalOpts
                          .filter((o) => signalIds.includes(o.id))
                          .map((o) => o.name)
                          .join(", ")
                      : "Select..."}
                  </span>
                  <IoChevronDown
                    className={`w-5 h-5 transition-transform ${openSig ? "rotate-180" : ""}`}
                  />
                </button>
                {openSig && (
                  <div className="absolute mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                    <ul className="py-2 text-sm text-black max-h-60 overflow-auto">
                      {signalOpts.map((opt) => (
                        <li key={opt.id}>
                          <label className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-black"
                              checked={signalIds.includes(opt.id)}
                              onChange={() =>
                                toggle(signalIds, setSignalIds, opt.id)
                              }
                            />
                            <span>{opt.name}</span>
                          </label>
                        </li>
                      ))}
                      {signalOpts.length === 0 && (
                        <li className="px-4 py-2 text-gray-500">No options</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2 space-y-5">
            <div className="flex items-center gap-3 justify-center">
              {telegramLink ? (
                <>
                  <a
                    href={telegramLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border bg-black text-white font-semibold transition-all duration-300 hover:bg-gray-800"
                  >
                    <BiLogoTelegram className="w-5 h-5" />
                    Open Telegram
                  </a>

                  {/* Fixed-size copy area (no layout shift) */}
                  <div className="w-[120px] h-[44px]">
                    {copyState === "idle" && (
                      <button
                        type="button"
                        className="w-full h-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium hover:bg-gray-100"
                        onClick={copyLink}
                      >
                        <IoCopyOutline className="w-5 h-5" />
                        Copy
                      </button>
                    )}
                    {copyState === "ok" && (
                      <div className="w-full h-full inline-flex items-center justify-center rounded-lg border">
                        <IoCheckmarkCircle className="w-5 h-5" />
                      </div>
                    )}
                    {copyState === "fail" && (
                      <div className="w-full h-full inline-flex items-center justify-center rounded-lg border border-red-500">
                        <IoCloseCircle className="w-5 h-5 text-red-600" />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-black text-white rounded-lg p-3 font-semibold transition-all duration-300 ease-in-out hover:bg-gray-800 disabled:bg-gray-300"
                >
                  <span className="inline-flex items-center gap-2 justify-center">
                    <BiLogoTelegram className="w-5 h-5" />
                    {loading ? "Verifying..." : "Verify & Connect"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
