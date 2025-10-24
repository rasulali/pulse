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

const readLines = async (req: Request): Promise<string[]> => {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      const body = await req.json();
      if (typeof body === "string") return body.split(/\r?\n/);
    } catch {}
  }
  const text = await req.text();
  return text ? text.split(/\r?\n/) : [];
};

export async function POST(req: Request) {
  const supa = sadmin();
  const raw = await readLines(req);
  const rows = Array.from(new Set(raw.map(normalize)))
    .filter(Boolean)
    .map((url) => ({ url }));
  if (!rows.length)
    return NextResponse.json(
      { ok: false, message: "no_valid_urls" },
      { status: 400 },
    );
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supa
      .from("linkedin")
      .upsert(chunk, { onConflict: "url", ignoreDuplicates: true });
    if (error)
      return NextResponse.json(
        { ok: false, message: "upsert_failed" },
        { status: 500 },
      );
  }
  return NextResponse.json({ ok: true, added: rows.length });
}
