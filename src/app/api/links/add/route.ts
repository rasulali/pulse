import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

const normalize = (raw: string): string => {
  const s = (raw || "").trim();
  if (!s) return "";
  const prefixed = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(prefixed);
    if (
      !/linkedin\.com$/i.test(u.hostname) &&
      !/\.linkedin\.com$/i.test(u.hostname)
    )
      return "";
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
};

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") || "";
  let url = "";
  if (ct.includes("application/json")) {
    try {
      const body = (await req.json()) as { url?: string };
      url = body?.url || "";
    } catch {}
  } else {
    url = await req.text();
  }
  const u = normalize(url);
  if (!u)
    return NextResponse.json(
      { ok: false, message: "invalid_url" },
      { status: 400 },
    );
  const supa = sadmin();
  const { error } = await supa
    .from("linkedin")
    .upsert([{ url: u }], { onConflict: "url", ignoreDuplicates: true });
  if (error)
    return NextResponse.json(
      { ok: false, message: "upsert_failed" },
      { status: 500 },
    );
  return NextResponse.json({ ok: true });
}
