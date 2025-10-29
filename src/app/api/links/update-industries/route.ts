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

export async function POST(req: Request) {
  const { id, industry_ids } = (await req.json()) as {
    id: number;
    industry_ids: number[];
  };

  if (!id || typeof id !== "number")
    return NextResponse.json(
      { ok: false, message: "id_required" },
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

  const { error } = await supa
    .from("linkedin")
    .update({ industry_ids: ids })
    .eq("id", id);

  if (error)
    return NextResponse.json(
      { ok: false, message: "update_failed" },
      { status: 400 },
    );

  return NextResponse.json({ ok: true });
}
