import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

export async function GET() {
  const { data, error } = await supabase
    .from("industries")
    .select("*")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { action: string; id?: number; name?: string; visible?: boolean };
  const { action, id, name, visible } = body;

  if (action === "create") {
    const { data, error } = await supabase
      .from("industries")
      .insert({ name, visible })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === "update") {
    const { data, error } = await supabase
      .from("industries")
      .update({ name, visible })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === "delete") {
    const { data: linkedinRows } = await supabase
      .from("linkedin")
      .select("id, url, industry_ids")
      .contains("industry_ids", [id]);

    if (linkedinRows && linkedinRows.length > 0) {
      const toDelete: number[] = [];
      const toUpdate: Array<{ id: number; industry_ids: number[] }> = [];

      for (const row of linkedinRows) {
        const filtered = (row.industry_ids || []).filter((iid: number) => iid !== id);
        if (filtered.length === 0) {
          toDelete.push(row.id);
        } else {
          toUpdate.push({ id: row.id, industry_ids: filtered });
        }
      }

      if (toDelete.length > 0) {
        await supabase.from("linkedin").delete().in("id", toDelete);
      }

      for (const upd of toUpdate) {
        await supabase
          .from("linkedin")
          .update({ industry_ids: upd.industry_ids })
          .eq("id", upd.id);
      }
    }

    const { error } = await supabase.from("industries").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "toggle-visible") {
    const { data: current } = await supabase
      .from("industries")
      .select("visible")
      .eq("id", id)
      .single();
    const { data, error } = await supabase
      .from("industries")
      .update({ visible: !current?.visible })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
