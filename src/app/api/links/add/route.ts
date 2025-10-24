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
  const { url, industry_ids } = (await req.json()) as {
    url: string;
    industry_ids: number[];
  };
  if (!url)
    return NextResponse.json(
      { ok: false, message: "url_required" },
      { status: 400 },
    );
  if (!Array.isArray(industry_ids) || industry_ids.length === 0)
    return NextResponse.json(
      { ok: false, message: "industry_required" },
      { status: 400 },
    );

  const supa = sadmin();
  let ids = industry_ids
    .filter((n: unknown) => Number.isInteger(n as number))
    .map((n: any) => Number(n));

  const { data: valid } = await supa
    .from("industries")
    .select("id")
    .in("id", ids);
  const allow = new Set((valid || []).map((r: any) => Number(r.id)));
  ids = ids.filter((id) => allow.has(id));
  if (ids.length === 0)
    return NextResponse.json(
      { ok: false, message: "industry_invalid" },
      { status: 400 },
    );

  const u = norm(url);
  const { error } = await supa
    .from("linkedin")
    .upsert(
      { url: u, allowed: false, industry_ids: ids },
      { onConflict: "url", ignoreDuplicates: false },
    );

  if (error)
    return NextResponse.json(
      { ok: false, message: "upsert_failed" },
      { status: 400 },
    );
  return NextResponse.json({ ok: true });
}
