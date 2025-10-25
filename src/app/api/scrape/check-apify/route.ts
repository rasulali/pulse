import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );

export async function POST() {
  console.log('[check-apify] Checking Apify run status');

  const supa = sadmin();

  const { data: job } = await supa
    .from("pipeline_jobs")
    .select("*")
    .eq("status", "scraping")
    .order("id", { ascending: false })
    .limit(1)
    .single();

  if (!job) {
    console.log('[check-apify] No scraping job found');
    return NextResponse.json({ ok: false, error: 'No scraping job' }, { status: 404 });
  }

  if (!job.apify_run_id) {
    console.error('[check-apify] Job has no apify_run_id');
    return NextResponse.json({ ok: false, error: 'No run ID' }, { status: 400 });
  }

  console.log(`[check-apify] Checking run: ${job.apify_run_id}`);

  const res = await fetch(
    `https://api.apify.com/v2/actor-runs/${job.apify_run_id}?token=${process.env.APIFY_TOKEN}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    console.error('[check-apify] Apify API error:', res.status);
    return NextResponse.json({ ok: false, error: 'Apify API error' }, { status: 502 });
  }

  const runInfo = await res.json() as any;
  const status = runInfo.data?.status;

  console.log(`[check-apify] Run status: ${status}`);

  if (status === 'SUCCEEDED') {
    const datasetId = runInfo.data?.defaultDatasetId;

    if (!datasetId) {
      console.error('[check-apify] No dataset ID in completed run');
      return NextResponse.json({ ok: false, error: 'No dataset' }, { status: 502 });
    }

    const datasetRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${process.env.APIFY_TOKEN}`,
      { cache: "no-store" }
    );

    if (!datasetRes.ok) {
      console.error('[check-apify] Failed to fetch dataset');
      return NextResponse.json({ ok: false, error: 'Dataset fetch failed' }, { status: 502 });
    }

    const items = await datasetRes.json() as any;
    const totalItems = Array.isArray(items) ? items.length : 0;

    console.log(`[check-apify] Dataset contains ${totalItems} items`);

    const { error } = await supa
      .from("pipeline_jobs")
      .update({
        status: 'processing',
        total_items: totalItems,
        current_batch_offset: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (error) {
      console.error('[check-apify] Failed to update job:', error);
      return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 });
    }

    console.log('[check-apify] Job updated to processing status');
    return NextResponse.json({ ok: true, status: 'SUCCEEDED', total_items: totalItems });
  }

  if (status === 'RUNNING') {
    console.log('[check-apify] Run still running, will check again later');
    return NextResponse.json({ ok: true, status: 'RUNNING' });
  }

  if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
    console.error(`[check-apify] Run failed with status: ${status}`);

    const newRetryCount = (job.retry_count || 0) + 1;
    const maxRetries = job.max_retries || 3;

    const updateData: any = {
      retry_count: newRetryCount,
      error_message: `Apify run ${status}`,
      updated_at: new Date().toISOString(),
    };

    if (newRetryCount >= maxRetries) {
      updateData.status = 'failed';
      console.error(`[check-apify] Max retries reached (${newRetryCount}/${maxRetries})`);
    }

    await supa
      .from("pipeline_jobs")
      .update(updateData)
      .eq("id", job.id);

    return NextResponse.json({
      ok: true,
      status: 'FAILED',
      retry_count: newRetryCount,
      max_retries: maxRetries
    });
  }

  console.log(`[check-apify] Unknown status: ${status}`);
  return NextResponse.json({ ok: true, status: status || 'UNKNOWN' });
}
