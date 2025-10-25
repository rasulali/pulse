import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

export async function POST() {
  console.log("[verify-and-run] Starting async Apify scrape");

  const supa = sadmin();

  const { data: cfg } = await supa
    .from("config")
    .select(
      "cookie_default,user_agent,min_delay,max_delay,deep_scrape,raw_data,proxy,limit_per_source",
    )
    .limit(1)
    .single();

  if (!cfg) {
    console.error("[verify-and-run] Config not found");
    return NextResponse.json(
      { ok: false, error: "Config not found" },
      { status: 500 },
    );
  }

  const { data: rows } = await supa
    .from("linkedin")
    .select("url")
    .eq("allowed", true);

  const urls = (rows || []).map((r: any) => r.url).filter(Boolean);

  if (!urls.length) {
    console.log("[verify-and-run] No allowed URLs found");
    return NextResponse.json(
      { ok: false, error: "No allowed URLs" },
      { status: 400 },
    );
  }

  console.log(`[verify-and-run] Found ${urls.length} allowed URLs`);

  const payload = {
    cookie: cfg.cookie_default,
    userAgent: cfg.user_agent,
    urls,
    limitPerSource: cfg.limit_per_source || 2,
    deepScrape: cfg.deep_scrape,
    rawData: cfg.raw_data,
    minDelay: cfg.min_delay,
    maxDelay: cfg.max_delay,
    proxy: cfg.proxy,
  };

  const res = await fetch(
    `https://api.apify.com/v2/acts/curious_coder~linkedin-post-search-scraper/runs?token=${process.env.APIFY_TOKEN}&memory=${process.env.APIFY_MEMORY_MBYTES}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    console.error("[verify-and-run] Apify API error:", res.status);
    return NextResponse.json(
      { ok: false, error: "Apify API error" },
      { status: 502 },
    );
  }

  const runData = (await res.json()) as any;
  const apifyRunId = runData.data?.id;

  if (!apifyRunId) {
    console.error("[verify-and-run] No run ID returned from Apify");
    return NextResponse.json(
      { ok: false, error: "No run ID" },
      { status: 502 },
    );
  }

  console.log(`[verify-and-run] Apify run started: ${apifyRunId}`);

  const { data: job, error } = await supa
    .from("pipeline_jobs")
    .insert({
      status: "scraping",
      apify_run_id: apifyRunId,
      current_batch_offset: 0,
      total_items: 0,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("[verify-and-run] Failed to create pipeline_jobs:", error);
    return NextResponse.json(
      { ok: false, error: "Database error" },
      { status: 500 },
    );
  }

  console.log(`[verify-and-run] Pipeline job created: ${job.id}`);

  return NextResponse.json({ ok: true, apify_run_id: apifyRunId });
}
