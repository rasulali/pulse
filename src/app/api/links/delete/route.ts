import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

type Body = { id: number };

export async function POST(req: Request) {
  const { id } = (await req.json()) as Partial<Body>;
  if (!Number.isFinite(id as number))
    return NextResponse.json({ ok: false }, { status: 400 });

  const supa = sadmin();
  const { data, error } = await supa
    .from("linkedin")
    .delete()
    .eq("id", id as number)
    .select("id");
  if (error) return NextResponse.json({ ok: false }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
