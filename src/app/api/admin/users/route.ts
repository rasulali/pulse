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
  const body = await req.json() as {
    action: string;
    id: number;
    industryIds?: number[];
    signalIds?: number[];
    languages?: string[];
    isAdmin?: boolean;
  };
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

  if (action === "update") {
    const updateData: {
      industry_ids?: number[];
      signal_ids?: number[];
      languages?: string[];
      is_admin?: boolean;
    } = {};

    if (body.industryIds !== undefined) {
      updateData.industry_ids = body.industryIds;
    }

    if (body.signalIds !== undefined) {
      updateData.signal_ids = body.signalIds;
    }

    if (body.languages !== undefined) {
      if (body.languages.length > 0) {
        updateData.languages = body.languages;
      } else {
        updateData.languages = ["en"];
      }
    }

    if (body.isAdmin !== undefined) {
      updateData.is_admin = body.isAdmin;
    }

    const { error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
