import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type TgMessage = { text?: string; chat?: { id: number } };
type TgUpdate = { message?: TgMessage; edited_message?: TgMessage };

const tg = (m: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${m}`;

export async function POST(req: Request) {
  if (
    req.headers.get("x-telegram-bot-api-secret-token") !==
    process.env.TELEGRAM_WEBHOOK_SECRET
  )
    return new NextResponse("forbidden", { status: 403 });

  const update = (await req.json()) as TgUpdate;
  const msg = update.message ?? update.edited_message;
  const text = msg?.text?.trim();
  const chatId = msg?.chat?.id;
  if (!text || !chatId) return NextResponse.json({ ok: true });

  if (!text.startsWith("/start ")) return NextResponse.json({ ok: true });
  const token = text.split(" ")[1];
  if (!token) return NextResponse.json({ ok: true });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  const { data: rows, error: findErr } = await sb
    .from("users")
    .select("id, telegram_chat_id")
    .eq("telegram_start_token", token)
    .limit(1);

  if (findErr || !rows?.length) return NextResponse.json({ ok: true });

  const user = rows[0];

  if (user.telegram_chat_id) return NextResponse.json({ ok: true });

  const { error: updErr } = await sb
    .from("users")
    .update({ telegram_chat_id: chatId })
    .eq("id", user.id);

  if (updErr) return NextResponse.json({ ok: true });

  await fetch(tg("sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "♥ Connected! You’ll start receiving daily reports here.",
    }),
  });

  return NextResponse.json({ ok: true });
}
