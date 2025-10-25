import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );

async function notifyAdmins(job: any, errorMessage: string) {
  if (!job.admin_chat_ids || job.admin_chat_ids.length === 0) {
    console.log('[advance] No admin chat IDs configured');
    return;
  }

  const message = `⚠️ Pipeline Failed\n\nStatus: ${job.status}\nError: ${errorMessage}\nRetries: ${job.retry_count}/${job.max_retries}`;

  for (const chatId of job.admin_chat_ids) {
    try {
      await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
          }),
        }
      );
      console.log(`[advance] Notified admin ${chatId}`);
    } catch (error) {
      console.error(`[advance] Failed to notify admin ${chatId}:`, error);
    }
  }
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken) {
    console.error('[advance] CRON_SECRET not configured');
    return NextResponse.json({ ok: false, error: 'Server misconfigured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${expectedToken}`) {
    console.error('[advance] Unauthorized request');
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[advance] Cron advance started');

  const supa = sadmin();

  const { data: jobs } = await supa
    .from("pipeline_jobs")
    .select("*")
    .not("status", "in", "(completed,failed)")
    .order("id", { ascending: false })
    .limit(1);

  let job = jobs?.[0];

  if (!job) {
    const currentHour = new Date().getUTCHours();
    console.log(`[advance] No active job. Current hour: ${currentHour}`);

    if (currentHour === 4) {
      console.log('[advance] Creating new pipeline job at 04:00 UTC');

      const { data: newJob } = await supa
        .from("pipeline_jobs")
        .insert({
          status: 'idle',
          current_batch_offset: 0,
          total_items: 0,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      job = newJob;

      if (newJob) {
        console.log('[advance] New job created, triggering immediate processing');
        const url = new URL(req.url);
        const baseUrl = `${url.protocol}//${url.host}`;
        fetch(`${baseUrl}/api/cron/advance`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'authorization': req.headers.get('authorization') || '',
          },
        }).catch(err => console.error('[advance] Self-trigger failed:', err));
        return NextResponse.json({ ok: true, message: 'New job created and started' });
      }
    } else {
      console.log('[advance] Not time to create new job (waiting for 04:00 UTC)');
      return NextResponse.json({ ok: true, message: 'No active job, waiting for 04:00 UTC' });
    }
  }

  if (!job) {
    console.error('[advance] Failed to create job');
    return NextResponse.json({ ok: false, error: 'Failed to create job' }, { status: 500 });
  }

  console.log(`[advance] Processing job ${job.id} with status: ${job.status}`);

  const url = new URL(req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  console.log(`[advance] Using baseUrl: ${baseUrl}`);

  try {
    let res: Response | null = null;

    switch (job.status) {
      case 'idle':
        console.log('[advance] Calling verify-and-run');
        res = await fetch(`${baseUrl}/api/scrape/verify-and-run`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        });
        break;

      case 'scraping':
        console.log('[advance] Calling check-apify');
        res = await fetch(`${baseUrl}/api/scrape/check-apify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        });
        break;

      case 'processing':
        console.log('[advance] Calling process-posts');
        res = await fetch(`${baseUrl}/api/scrape/process-posts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            batch_offset: job.current_batch_offset,
            batch_size: 10,
          }),
        });
        break;

      case 'vectorizing':
        console.log('[advance] Calling vectorize');
        res = await fetch(`${baseUrl}/api/scrape/vectorize`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            batch_offset: job.current_batch_offset,
            batch_size: 10,
          }),
        });
        break;

      case 'generating':
        console.log('[advance] Calling signals/generate');
        res = await fetch(`${baseUrl}/api/signals/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            batch_offset: job.current_batch_offset,
          }),
        });
        break;

      case 'sending':
        console.log('[advance] Calling telegram/send-batch');
        res = await fetch(`${baseUrl}/api/telegram/send-batch`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            batch_offset: job.current_batch_offset,
            batch_size: 10,
          }),
        });
        break;

      default:
        console.log(`[advance] Unknown status: ${job.status}`);
        return NextResponse.json({ ok: true, current_status: job.status, message: 'Unknown status' });
    }

    if (!res) {
      return NextResponse.json({ ok: true, current_status: job.status });
    }

    if (!res.ok) {
      throw new Error(`Endpoint returned ${res.status}`);
    }

    const result = await res.json() as any;
    console.log(`[advance] Endpoint result:`, result);

    const { data: updatedJob } = await supa
      .from("pipeline_jobs")
      .select("*")
      .eq("id", job.id)
      .single();

    const progress = `${updatedJob?.current_batch_offset || 0}/${updatedJob?.total_items || 0}`;

    console.log(`[advance] Job updated. Status: ${updatedJob?.status}, Progress: ${progress}`);

    const shouldContinue =
      (updatedJob?.status && updatedJob.status !== job.status && updatedJob.status !== 'completed' && updatedJob.status !== 'failed') ||
      (updatedJob?.status === job.status && ['processing', 'vectorizing', 'sending'].includes(updatedJob.status) &&
       updatedJob.current_batch_offset < updatedJob.total_items);

    if (shouldContinue) {
      console.log(`[advance] Triggering immediate next check`);
      fetch(`${baseUrl}/api/cron/advance`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': req.headers.get('authorization') || '',
        },
      }).catch(err => console.error('[advance] Self-trigger failed:', err));
    }

    return NextResponse.json({
      ok: true,
      current_status: updatedJob?.status || job.status,
      progress,
    });

  } catch (error) {
    console.error('[advance] Error:', error);

    const newRetryCount = (job.retry_count || 0) + 1;
    const maxRetries = job.max_retries || 3;
    const errorMessage = error instanceof Error ? error.message : String(error);

    const updateData: any = {
      retry_count: newRetryCount,
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    };

    if (newRetryCount >= maxRetries) {
      updateData.status = 'failed';
      console.error(`[advance] Max retries reached (${newRetryCount}/${maxRetries}), marking as failed`);

      await supa
        .from("pipeline_jobs")
        .update(updateData)
        .eq("id", job.id);

      await notifyAdmins(job, errorMessage);

      return NextResponse.json({
        ok: false,
        error: 'Max retries exceeded',
        current_status: 'failed',
        retry_count: newRetryCount,
      }, { status: 500 });
    }

    console.log(`[advance] Retry ${newRetryCount}/${maxRetries}`);

    await supa
      .from("pipeline_jobs")
      .update(updateData)
      .eq("id", job.id);

    return NextResponse.json({
      ok: false,
      error: errorMessage,
      current_status: job.status,
      retry_count: newRetryCount,
    }, { status: 500 });
  }
}
