import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

async function notifyAdmins(
  supa: ReturnType<typeof sadmin>,
  errorMessage: string,
) {
  const { data: adminUsers } = await supa
    .from("users")
    .select("telegram_chat_id")
    .eq("is_admin", true)
    .not("telegram_chat_id", "is", null);

  const adminChatIds = (adminUsers || [])
    .map((u: any) => u.telegram_chat_id)
    .filter(Boolean);

  if (adminChatIds.length === 0) {
    console.log("[verify-and-run] No admin chat IDs configured");
    return;
  }

  const message = `⚠️ Pipeline Start Failed\n\nError: ${errorMessage}`;

  for (const chatId of adminChatIds) {
    try {
      await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: "HTML",
          }),
        },
      );
      console.log(`[verify-and-run] Notified admin ${chatId}`);
    } catch (error) {
      console.error(
        `[verify-and-run] Failed to notify admin ${chatId}:`,
        error,
      );
    }
  }
}

export async function POST() {
  console.log("[verify-and-run] Starting async Apify scrape");

  const supa = sadmin();

  const { data: cfg } = await supa
    .from("config")
    .select(
      "cookie_default,user_agent,min_delay,max_delay,deep_scrape,raw_data,proxy,limit_per_source,memory_mbytes",
    )
    .limit(1)
    .single();

  if (!cfg) {
    const errorMsg = "Config not found";
    console.error("[verify-and-run]", errorMsg);
    await notifyAdmins(supa, errorMsg);
    return NextResponse.json(
      { ok: false, error: "Config not found" },
      { status: 500 },
    );
  }

  const { data: visibleIndustries } = await supa
    .from("industries")
    .select("id")
    .eq("visible", true);

  const visibleIndustryIds = new Set<number>(
    (visibleIndustries || []).map((row: any) => Number(row.id)).filter(Boolean),
  );

  if (visibleIndustryIds.size === 0) {
    const errorMsg = "No visible industries configured";
    console.error("[verify-and-run]", errorMsg);
    await notifyAdmins(supa, errorMsg);
    return NextResponse.json(
      { ok: false, error: "No visible industries" },
      { status: 400 },
    );
  }

  const { data: rows } = await supa
    .from("linkedin")
    .select("url,industry_ids")
    .eq("allowed", true);

  const allowedVisibleProfiles =
    rows?.filter((row: any) => {
      const industries: number[] = Array.isArray(row.industry_ids)
        ? row.industry_ids.map((id: any) => Number(id))
        : [];
      return (
        industries.length > 0 &&
        industries.some((id) => visibleIndustryIds.has(id))
      );
    }) || [];

  const urls = allowedVisibleProfiles.map((r: any) => r.url).filter(Boolean);

  if (!urls.length) {
    const errorMsg = "No allowed URLs found for visible industries";
    console.log("[verify-and-run]", errorMsg);
    await notifyAdmins(supa, errorMsg);
    return NextResponse.json(
      { ok: false, error: "No allowed URLs for visible industries" },
      { status: 400 },
    );
  }

  console.log(
    `[verify-and-run] Found ${urls.length} allowed URLs across visible industries`,
  );

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
    `https://api.apify.com/v2/acts/curious_coder~linkedin-post-search-scraper/runs?token=${process.env.APIFY_TOKEN}&memory=${cfg.memory_mbytes || 512}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const errorMsg = `Apify API returned ${res.status}`;
    console.error("[verify-and-run]", errorMsg);
    await notifyAdmins(supa, errorMsg);
    return NextResponse.json(
      { ok: false, error: "Apify API error" },
      { status: 502 },
    );
  }

  const runData = (await res.json()) as any;
  const apifyRunId = runData.data?.id;

  if (!apifyRunId) {
    const errorMsg = "No run ID returned from Apify";
    console.error("[verify-and-run]", errorMsg);
    await notifyAdmins(supa, errorMsg);
    return NextResponse.json(
      { ok: false, error: "No run ID" },
      { status: 502 },
    );
  }

  console.log(`[verify-and-run] Apify run started: ${apifyRunId}`);

  const { data: adminUsers } = await supa
    .from("users")
    .select("telegram_chat_id")
    .eq("is_admin", true)
    .not("telegram_chat_id", "is", null);

  const adminChatIds = (adminUsers || [])
    .map((u: any) => u.telegram_chat_id)
    .filter(Boolean);

  console.log(`[verify-and-run] Found ${adminChatIds.length} admin chat IDs`);

  const { data: existingJob } = await supa
    .from("pipeline_jobs")
    .select("*")
    .eq("status", "idle")
    .order("id", { ascending: false })
    .limit(1)
    .single();

  let job;
  let error;

  if (existingJob) {
    console.log(`[verify-and-run] Updating existing idle job ${existingJob.id}`);
    const { data, error: updateError } = await supa
      .from("pipeline_jobs")
      .update({
        status: "scraping",
        apify_run_id: apifyRunId,
        admin_chat_ids: adminChatIds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingJob.id)
      .select()
      .single();
    job = data;
    error = updateError;
  } else {
    console.log(`[verify-and-run] Creating new scraping job`);
    const { data, error: insertError } = await supa
      .from("pipeline_jobs")
      .insert({
        status: "scraping",
        apify_run_id: apifyRunId,
        admin_chat_ids: adminChatIds,
        current_batch_offset: 0,
        total_items: 0,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    job = data;
    error = insertError;
  }

  if (error) {
    const errorMsg = `Failed to create/update pipeline_jobs: ${error.message}`;
    console.error("[verify-and-run]", errorMsg);
    await notifyAdmins(supa, errorMsg);
    return NextResponse.json(
      { ok: false, error: "Database error" },
      { status: 500 },
    );
  }

  console.log(`[verify-and-run] Pipeline job ${existingJob ? 'updated' : 'created'}: ${job.id}`);

  return NextResponse.json({ ok: true, apify_run_id: apifyRunId });
}
