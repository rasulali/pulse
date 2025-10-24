import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Payload = {
  email: string;
  firstName?: string;
  lastName?: string;
  industryIds: number[];
  signalIds: number[];
};

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Payload;
    const email = (b.email || "").toLowerCase().trim();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "invalid email" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );

    const { data: existing, error: findErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .limit(1);

    if (findErr) {
      return NextResponse.json({ error: findErr.message }, { status: 400 });
    }
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "This user already exists" },
        { status: 409 },
      );
    }

    const token = crypto.randomUUID();
    const { error: insErr } = await supabase.from("users").insert([
      {
        email,
        first_name: b.firstName ?? null,
        last_name: b.lastName ?? null,
        industry_ids: b.industryIds,
        signal_ids: b.signalIds,
        telegram_start_token: token,
      },
    ]);

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    const link = `https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}?start=${token}`;
    return NextResponse.json({ telegramLink: link });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 400 },
    );
  }
}
