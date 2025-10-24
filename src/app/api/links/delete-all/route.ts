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

type Body = { scope?: string };

export async function POST(req: Request) {
  let scope = "all";
  try {
    const body = (await req.json()) as Body;
    if (typeof body?.scope === "string") scope = body.scope;
  } catch {}

  const s = (scope || "").toLowerCase().trim();
  const normalized =
    s === "not_allowed" || s === "notallowed"
      ? "not-allowed"
      : s === "allowed" || s === "not-allowed" || s === "all"
        ? s
        : s === ""
          ? "all"
          : "";

  if (!normalized) {
    return NextResponse.json(
      { ok: false, message: "invalid_scope" },
      { status: 400 },
    );
  }

  const supa = sadmin();

  let q = supa.from("linkedin").delete();
  if (normalized === "allowed") q = q.eq("allowed", true);
  else if (normalized === "not-allowed") q = q.eq("allowed", false);
  else q = q.not("id", "is", null);

  const { data, error } = await q.select("id");
  if (error)
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 500 },
    );

  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
