import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ApifyItem } from "../links.types";
import { cleanText } from "@/lib/text";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

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
    return cleanText(x?.activityOfUser?.occupation || "");
  }
  return cleanText(x?.author?.occupation || "");
};

const pickName = (x: ApifyItem) => {
  if (x?.isActivity) {
    const fn = cleanText(x?.activityOfUser?.firstName || "");
    const ln = cleanText(x?.activityOfUser?.lastName || "");
    return [fn, ln].filter(Boolean).join(" ").trim();
  }
  const fn = cleanText(x?.author?.firstName || "");
  const ln = cleanText(x?.author?.lastName || "");
  return [fn, ln].filter(Boolean).join(" ").trim();
};

const pickHead = (x: ApifyItem) => {
  if (x?.isActivity) return "";
  return cleanText(x?.authorHeadline || "");
};

export async function POST() {
  const supa = sadmin();
  const { data: cfg } = await supa
    .from("config")
    .select(
      "cookie_default,user_agent,min_delay,max_delay,deep_scrape,raw_data,proxy,memory_mbytes",
    )
    .limit(1)
    .single();
  if (!cfg) return NextResponse.json({ ok: false }, { status: 500 });

  const { data: rows } = await supa.from("linkedin").select("url");
  const urls = (rows || []).map((r: any) => r.url).filter(Boolean);
  if (!urls.length) return NextResponse.json({ ok: true, updated: 0 });

  const payload = {
    cookie: cfg.cookie_default,
    userAgent: cfg.user_agent,
    urls,
    limitPerSource: 1,
    deepScrape: cfg.deep_scrape,
    rawData: cfg.raw_data,
    minDelay: cfg.min_delay,
    maxDelay: cfg.max_delay,
    proxy: cfg.proxy,
  };

  const res = await fetch(
    "https://api.apify.com/v2/acts/curious_coder~linkedin-post-search-scraper/run-sync-get-dataset-items" +
      "?token=" +
      process.env.APIFY_TOKEN +
      `&memory=${cfg.memory_mbytes || 512}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 502 });

  const items = (await res.json()) as ApifyItem[] | unknown;
  if (!Array.isArray(items)) return NextResponse.json({ ok: true, updated: 0 });

  const map: Record<string, { name: string; occ: string; head: string }> = {};
  for (const it of items as ApifyItem[]) {
    const target = norm(
      it?.inputUrl ||
        it?.authorProfileUrl ||
        (it?.author?.publicId
          ? `https://www.linkedin.com/in/${it.author.publicId}`
          : "") ||
        (it?.activityOfUser?.publicId
          ? `https://www.linkedin.com/in/${it.activityOfUser.publicId}`
          : ""),
    );
    if (!target) continue;
    const name = pickName(it);
    const occ = pickOcc(it);
    const head = pickHead(it);
    map[target] = { name, occ, head };
  }

  let updated = 0;
  for (const [u, v] of Object.entries(map)) {
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
      .eq("url", u)
      .select("id");
    if (!error) updated += (data?.length as number | undefined) ?? 0;
  }

  return NextResponse.json({ ok: true, updated });
}
