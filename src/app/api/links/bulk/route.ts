import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { persistSession: false },
    },
  );

const norm = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname.replace(/\/+$/, "")}`;
  } catch {
    return u;
  }
};

export async function POST(req: Request) {
  const supa = sadmin();
  const url = new URL(req.url);
  const rawIds = (url.searchParams.get("industry_ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n));

  if (rawIds.length === 0)
    return NextResponse.json(
      { ok: false, message: "industry_required" },
      { status: 400 },
    );

  const { data: valid } = await supa
    .from("industries")
    .select("id")
    .in("id", rawIds);
  const allow = new Set((valid || []).map((r: any) => Number(r.id)));
  const ids = rawIds.filter((id) => allow.has(id));
  if (ids.length === 0)
    return NextResponse.json(
      { ok: false, message: "industry_invalid" },
      { status: 400 },
    );

  const text = await req.text();
  const urls = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(norm);

  if (!urls.length) return NextResponse.json({ ok: true, inserted: 0 });

  const { data: existing } = await supa
    .from("linkedin")
    .select("url, industry_ids, allowed")
    .in("url", urls);

  const existingMap = new Map<string, { industry_ids: number[]; allowed: boolean }>();
  if (existing) {
    for (const row of existing) {
      existingMap.set(row.url, {
        industry_ids: row.industry_ids || [],
        allowed: row.allowed
      });
    }
  }

  const rows = urls.map((u) => {
    const existing = existingMap.get(u);
    const existingIds = existing?.industry_ids || [];
    const mergedIds = Array.from(new Set([...existingIds, ...ids]));
    const allowed = existing?.allowed ?? false;
    return { url: u, allowed, industry_ids: mergedIds };
  });

  const { error, data } = await supa
    .from("linkedin")
    .upsert(rows, { onConflict: "url", ignoreDuplicates: false })
    .select("id");

  if (error)
    return NextResponse.json(
      { ok: false, message: "upsert_failed" },
      { status: 400 },
    );
  return NextResponse.json({ ok: true, inserted: data.length });
}
