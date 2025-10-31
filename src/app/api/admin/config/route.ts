import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

export async function GET() {
  const { data, error } = await supabase
    .from("config")
    .select("*")
    .eq("singleton", true)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    limit_per_source?: number;
    cookie_default?: any;
    memory_mbytes?: number;
    debug?: boolean;
  };

  const updateData: Record<string, unknown> = {};
  if (body.limit_per_source !== undefined) {
    updateData.limit_per_source = body.limit_per_source;
  }
  if (body.cookie_default !== undefined) {
    updateData.cookie_default = body.cookie_default;
  }
  if (body.memory_mbytes !== undefined) {
    updateData.memory_mbytes = body.memory_mbytes;
  }
  if (body.debug !== undefined) {
    updateData.debug = body.debug;
  }

  const { data, error } = await supabase
    .from("config")
    .update(updateData)
    .eq("singleton", true)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
