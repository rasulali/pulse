import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

type ToggleBody = { id: number; next: boolean };

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<ToggleBody>;
  if (!Number.isFinite(body.id as number) || typeof body.next !== "boolean") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const supa = sadmin();
  const { error } = await supa
    .from("linkedin")
    .update({ allowed: body.next })
    .eq("id", body.id as number);
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
