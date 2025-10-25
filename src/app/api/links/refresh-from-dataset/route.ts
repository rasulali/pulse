import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ApifyItem } from "../links.types";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

type Body = { datasetUrl?: string };

const rx = /[A-Za-z\u00C0-\u024F\u0400-\u04FF]/u;
const norm = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname.replace(/\/+$/, "")}`;
  } catch {
    return u;
  }
};

const pickOcc = (x: ApifyItem) => {
  if (x?.isActivity) {
    return (x?.activityOfUser?.occupation || "").trim();
  }
  return (x?.author?.occupation || "").trim();
};

const pickName = (x: ApifyItem) => {
  if (x?.isActivity) {
    const fn = (x?.activityOfUser?.firstName || "").trim();
    const ln = (x?.activityOfUser?.lastName || "").trim();
    return [fn, ln].filter(Boolean).join(" ").trim();
  }
  const fn = (x?.author?.firstName || "").trim();
  const ln = (x?.author?.lastName || "").trim();
  return [fn, ln].filter(Boolean).join(" ").trim();
};

const pickHead = (x: ApifyItem) => {
  if (x?.isActivity) return "";
  return (x?.authorHeadline || "").trim();
};

export async function POST(req: Request) {
  const { datasetUrl } = (await req.json()) as Body;
  if (!datasetUrl) return NextResponse.json({ ok: false }, { status: 400 });
  const token = process.env.APIFY_TOKEN || "";
  if (!token) return NextResponse.json({ ok: false }, { status: 500 });

  const u = new URL(datasetUrl);
  if (!u.searchParams.get("token")) u.searchParams.set("token", token);

  const res = await fetch(u.toString(), { method: "GET", cache: "no-store" });
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 502 });

  const items = (await res.json()) as ApifyItem[] | unknown;
  if (!Array.isArray(items)) return NextResponse.json({ ok: true, updated: 0 });

  const supa = sadmin();
  const map: Record<string, { name: string; occ: string; head: string }> = {};
  for (const raw of items as ApifyItem[]) {
    const target = norm(
      raw?.inputUrl ||
        raw?.authorProfileUrl ||
        (raw?.author?.publicId
          ? `https://www.linkedin.com/in/${raw.author.publicId}`
          : "") ||
        (raw?.activityOfUser?.publicId
          ? `https://www.linkedin.com/in/${raw.activityOfUser.publicId}`
          : ""),
    );
    if (!target) continue;
    const name = pickName(raw);
    const occ = pickOcc(raw);
    const head = pickHead(raw);
    map[target] = { name, occ, head };
  }

  let updated = 0;
  for (const [u2, v] of Object.entries(map)) {
    const validOcc = !!(v.occ && rx.test(v.occ));
    const validHead = !validOcc && !!(v.head && rx.test(v.head));
    const allowed = validOcc || validHead;
    const { data, error } = await supa
      .from("linkedin")
      .update({
        name: v.name || null,
        occupation: validOcc ? v.occ : null,
        headline: validHead ? v.head : null,
        allowed,
      })
      .eq("url", u2)
      .select("id");
    if (!error) updated += (data?.length as number | undefined) ?? 0;
  }

  return NextResponse.json({ ok: true, updated });
}
