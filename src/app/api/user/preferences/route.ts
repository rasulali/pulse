import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

type PreferencesPayload = {
  telegram_chat_id: number;
  industry_ids?: number[];
  signal_ids?: number[];
  language?: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("telegram_chat_id");

  if (!chatId) {
    return NextResponse.json(
      { error: "telegram_chat_id is required" },
      { status: 400 }
    );
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id, email, industry_ids, signal_ids, languages")
    .eq("telegram_chat_id", parseInt(chatId))
    .single();

  if (error || !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const language = Array.isArray(user.languages) && user.languages.length > 0
    ? user.languages[0]
    : "en";

  return NextResponse.json({
    industry_ids: user.industry_ids,
    signal_ids: user.signal_ids,
    language,
  });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as PreferencesPayload;

  if (!body.telegram_chat_id) {
    return NextResponse.json(
      { error: "telegram_chat_id is required" },
      { status: 400 }
    );
  }

  const { data: user, error: findError } = await supabase
    .from("users")
    .select("id, industry_ids, signal_ids, languages")
    .eq("telegram_chat_id", body.telegram_chat_id)
    .single();

  if (findError || !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updateData: {
    industry_ids?: number[];
    signal_ids?: number[];
    languages?: string[];
  } = {};

  if (body.industry_ids !== undefined) {
    if (body.industry_ids.length === 0) {
      return NextResponse.json(
        { error: "At least one industry must be selected" },
        { status: 400 }
      );
    }
    updateData.industry_ids = body.industry_ids;
  }

  if (body.signal_ids !== undefined) {
    if (body.signal_ids.length === 0) {
      return NextResponse.json(
        { error: "At least one signal must be selected" },
        { status: 400 }
      );
    }
    updateData.signal_ids = body.signal_ids;
  }

  if (body.language !== undefined) {
    const validLanguages = ["en", "az", "ru"];
    if (!validLanguages.includes(body.language)) {
      return NextResponse.json(
        { error: "Invalid language. Must be one of: en, az, ru" },
        { status: 400 }
      );
    }
    updateData.languages = [body.language];
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from("users")
    .update(updateData)
    .eq("telegram_chat_id", body.telegram_chat_id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
