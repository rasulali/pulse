import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );

export async function POST(req: Request) {
  console.log('[send-batch] Starting message delivery');

  const body = await req.json() as any;
  const batchOffset = body.batch_offset || 0;
  const batchSize = body.batch_size || 10;

  console.log(`[send-batch] Batch offset: ${batchOffset}, size: ${batchSize}`);

  const supa = sadmin();

  const { data: configRow } = await supa
    .from("config")
    .select("debug")
    .eq("singleton", true)
    .single();

  const debugMode = !!configRow?.debug;

  console.log(`[send-batch] Debug mode is ${debugMode ? "ENABLED" : "disabled"}`);

  const { data: job } = await supa
    .from("pipeline_jobs")
    .select("*")
    .eq("status", "sending")
    .order("id", { ascending: false })
    .limit(1)
    .single();

  if (!job) {
    console.error('[send-batch] No sending job found');
    return NextResponse.json({ ok: false, error: 'No sending job' }, { status: 404 });
  }

  const today = new Date().toISOString().split('T')[0];

  const { data: messages } = await supa
    .from("messages")
    .select("*")
    .gte("created_at", today);

  if (!messages || messages.length === 0) {
    console.log('[send-batch] No messages for today, transitioning to completed');
    await supa
      .from("pipeline_jobs")
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return NextResponse.json({ ok: true, sent: 0 });
  }

  console.log(`[send-batch] Found ${messages.length} messages for today`);

  let recipientsCountQuery = supa
    .from("users")
    .select("id", { count: "exact", head: true })
    .not("telegram_chat_id", "is", null);

  if (debugMode) {
    recipientsCountQuery = recipientsCountQuery.eq("is_admin", true);
  }

  const { count: recipientCount } = await recipientsCountQuery;
  const totalRecipients = recipientCount || 0;

  if (job.total_items !== totalRecipients) {
    console.log(`[send-batch] Updating total_items from ${job.total_items} to ${totalRecipients}`);
    await supa
      .from("pipeline_jobs")
      .update({
        total_items: totalRecipients,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }

  if (totalRecipients === 0) {
    console.log('[send-batch] No recipients for current mode, completing job');
    await supa
      .from("pipeline_jobs")
      .update({
        status: 'completed',
        current_batch_offset: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return NextResponse.json({ ok: true, sent: 0 });
  }

  let usersQuery = supa
    .from("users")
    .select("*")
    .not("telegram_chat_id", "is", null);

  if (debugMode) {
    usersQuery = usersQuery.eq("is_admin", true);
  }

  usersQuery = usersQuery.order("id");

  const { data: users } = await usersQuery
    .range(batchOffset, batchOffset + batchSize - 1);

  if (!users || users.length === 0) {
    console.log('[send-batch] No users in this batch');

    const newOffset = Math.min(batchOffset + batchSize, totalRecipients);
    const isDone = newOffset >= totalRecipients;

    if (isDone) {
      console.log('[send-batch] All messages sent, transitioning to completed');
      await supa
        .from("pipeline_jobs")
        .update({
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }

    return NextResponse.json({ ok: true, sent: 0 });
  }

  console.log(`[send-batch] Sending to ${users.length} users`);

  let sent = 0;

  for (const user of users) {
    const userMessages = messages.filter(m => {
      const industryMatch = user.industry_ids.includes(m.industry_id);
      const signalMatch = user.signal_ids.includes(m.signal_id);
      const alreadyDelivered = m.delivered_user_ids && m.delivered_user_ids.includes(user.id);
      return industryMatch && signalMatch && !alreadyDelivered;
    });

    console.log(`[send-batch] User ${user.id} has ${userMessages.length} matching messages`);

    for (const msg of userMessages) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              chat_id: user.telegram_chat_id,
              text: msg.message_text,
              parse_mode: 'HTML',
            }),
          }
        );

        if (res.ok) {
          console.log(`[send-batch] Sent message ${msg.id} to user ${user.id}`);

          const currentDeliveredIds = msg.delivered_user_ids || [];
          await supa
            .from("messages")
            .update({
              delivered_user_ids: [...currentDeliveredIds, user.id],
            })
            .eq("id", msg.id);

          sent++;
        } else {
          console.error(`[send-batch] Failed to send message ${msg.id} to user ${user.id}:`, res.status);
        }
      } catch (error) {
        console.error(`[send-batch] Error sending message ${msg.id} to user ${user.id}:`, error);
      }
    }
  }

  const newOffset = Math.min(batchOffset + batchSize, totalRecipients);
  const isDone = newOffset >= totalRecipients;

  console.log(`[send-batch] Batch complete. Sent: ${sent}, Done: ${isDone}`);

  const updateData: any = {
    current_batch_offset: isDone ? 0 : newOffset,
    updated_at: new Date().toISOString(),
  };

  if (isDone) {
    updateData.status = 'completed';
    console.log('[send-batch] All messages sent, transitioning to completed');
  }

  await supa
    .from("pipeline_jobs")
    .update(updateData)
    .eq("id", job.id);

  return NextResponse.json({ ok: true, sent });
}
