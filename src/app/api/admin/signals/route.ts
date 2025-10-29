import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

async function processBatch<T>(items: T[], batchSize: number, processor: (batch: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processor(batch);
  }
}

export async function GET() {
  const { data, error } = await supabase
    .from("signals")
    .select("*")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { action: string; id?: number; name?: string; visible?: boolean; prompt?: string; embedding_query?: string };
  const { action, id, name, visible, prompt, embedding_query } = body;

  if (action === "create") {
    const { data, error } = await supabase
      .from("signals")
      .insert({ name, visible, prompt: prompt || "", embedding_query: embedding_query || "" })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === "update") {
    const { data, error } = await supabase
      .from("signals")
      .update({ name, visible, prompt, embedding_query })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === "delete") {
    const { data: userRows } = await supabase
      .from("users")
      .select("id, signal_ids")
      .contains("signal_ids", [id]);

    if (userRows && userRows.length > 0) {
      const updates: Array<{ id: number; signal_ids: number[] }> = [];
      for (const row of userRows) {
        const filtered = (row.signal_ids || []).filter((sid: number) => sid !== id);
        updates.push({ id: row.id, signal_ids: filtered });
      }

      await processBatch(updates, 10, async (batch) => {
        for (const upd of batch) {
          await supabase
            .from("users")
            .update({ signal_ids: upd.signal_ids })
            .eq("id", upd.id);
        }
      });
    }

    const { error } = await supabase.from("signals").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "toggle-visible") {
    const { data: current } = await supabase
      .from("signals")
      .select("visible")
      .eq("id", id)
      .single();
    const { data, error } = await supabase
      .from("signals")
      .update({ visible: !current?.visible })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
