import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

type Body = { id: number };
type ApifyItem = {
  inputUrl?: string;
  authorName?: string;
  authorFullName?: string;
  authorHeadline?: string;
  author?: { occupation?: string; firstName?: string; lastName?: string };
  activityOfUser?: {
    occupation?: string;
    firstName?: string;
    lastName?: string;
  };
  activityDescription?: { occupation?: string };
};

const rx = /[A-Za-z\u00C0-\u024F\u0400-\u04FF]/u;

const pickOcc = (x: ApifyItem) =>
  (
    x?.author?.occupation ||
    x?.activityOfUser?.occupation ||
    x?.activityDescription?.occupation ||
    ""
  ).trim();

const pickName = (x: ApifyItem) => {
  const n = (x?.authorName || x?.authorFullName || "").trim();
  if (n) return n;
  const fn = (x?.author?.firstName || "").trim();
  const ln = (x?.author?.lastName || "").trim();
  const a = [fn, ln].filter(Boolean).join(" ").trim();
  if (a) return a;
  const afn = (x?.activityOfUser?.firstName || "").trim();
  const aln = (x?.activityOfUser?.lastName || "").trim();
  return [afn, aln].filter(Boolean).join(" ").trim();
};

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Body>;
  if (!Number.isFinite(body.id as number))
    return NextResponse.json({ ok: false }, { status: 400 });

  const supa = sadmin();
  const { data: cfg } = await supa
    .from("apify_scraper_options")
    .select(
      "cookie_default,user_agent,min_delay,max_delay,deep_scrape,raw_data,proxy",
    )
    .limit(1)
    .single();
  if (!cfg) return NextResponse.json({ ok: false }, { status: 500 });

  const { data: row } = await supa
    .from("linkedin")
    .select("id,url")
    .eq("id", body.id as number)
    .single();
  if (!row?.url) return NextResponse.json({ ok: false }, { status: 404 });

  const payload = {
    cookie: cfg.cookie_default,
    userAgent: cfg.user_agent,
    urls: [row.url],
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
      "&memory=8192",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 502 });

  const items = (await res.json()) as ApifyItem[] | unknown;
  if (!Array.isArray(items) || !items.length)
    return NextResponse.json({ ok: true, updated: 0 });

  const it = items[0] as ApifyItem;
  const name = pickName(it);
  const occ = pickOcc(it);
  const head = (it?.authorHeadline || "").trim();
  const validOcc = !!(occ && rx.test(occ));
  const validHead = !validOcc && !!(head && rx.test(head));
  const allowed = validOcc || validHead;

  const { data, error } = await supa
    .from("linkedin")
    .update({
      name: name || null,
      occupation: validOcc ? occ : null,
      headline: validHead ? head : null,
      allowed,
    })
    .eq("id", row.id)
    .select("id");
  if (error) return NextResponse.json({ ok: false }, { status: 500 });

  return NextResponse.json({
    ok: true,
    updated: (data?.length ?? 0) > 0 ? 1 : 0,
  });
}
