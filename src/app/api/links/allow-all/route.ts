import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

export async function POST() {
  const supa = sadmin();
  const { data, error } = await supa
    .from("linkedin")
    .update({ allowed: true })
    .eq("allowed", false)
    .select("id");
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, updated: data?.length || 0 });
}
