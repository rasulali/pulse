import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

export async function GET() {
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });

  return NextResponse.json(users || []);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { action: string; id: number };
  const { action, id } = body;

  if (action === "delete") {
    const { error } = await supabase.from("users").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "toggle-admin") {
    const { data: user } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", id)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const newIsAdmin = !user.is_admin;

    const { error } = await supabase
      .from("users")
      .update({ is_admin: newIsAdmin })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, is_admin: newIsAdmin });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
