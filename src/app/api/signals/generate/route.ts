import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export async function POST(req: Request) {
  console.log("[generate] Starting message generation");

  const body = (await req.json()) as any;
  const batchOffset = body.batch_offset || 0;

  console.log(`[generate] Batch offset: ${batchOffset}`);

  const supa = sadmin();

  const { data: configRow } = await supa
    .from("config")
    .select("debug")
    .eq("singleton", true)
    .single();

  const debugMode = !!configRow?.debug;

  console.log(`[generate] Debug mode is ${debugMode ? "ENABLED" : "disabled"}`);

  const { data: job } = await supa
    .from("pipeline_jobs")
    .select("*")
    .eq("status", "generating")
    .order("id", { ascending: false })
    .limit(1)
    .single();

  if (!job) {
    console.error("[generate] No generating job found");
    return NextResponse.json(
      { ok: false, error: "No generating job" },
      { status: 404 },
    );
  }

  const systemPrompt = `You are an AI assistant that analyzes professional business content and generates concise insights with source attribution.

CONTEXT FORMAT
The CONTEXT contains multiple numbered excerpts. Each excerpt is structured as:
---
[N]
TEXT: [post content]
AUTHOR: [name]
AUTHOR_TITLE: [occupation or headline]
AUTHOR_URL: [LinkedIn profile URL]
SOURCE_URL: [LinkedIn post URL]
---

Where [N] is the source number (1, 2, 3, etc.) that you will use for citations.

CORE BEHAVIOR
1) Extract only concrete business-relevant intelligence that matches the QUERY signal type.
2) If multiple excerpts describe the same topic, merge them into one insight instead of repeating.
3) Never invent, infer, guess, speculate, or "soft suggest" anything that is not explicitly present in the CONTEXT.
4) You are allowed to respond with "NO_CONTENT". In fact, this is critical.

CRITICAL FILTERING RULE
Before you generate any output, you MUST decide if the CONTEXT actually contains information that matches the requested signal type.

- If (and only if) there is at least one clearly relevant, explicitly stated detail in the CONTEXT that matches the QUERY signal, then you should generate a formatted message following the QUERY's structure instructions.

- If there is NO relevant information in the CONTEXT for this signal, you MUST respond with exactly:
NO_CONTENT

- "Relevant" means directly stated. Hints, implications, vibes, or things you could infer are NOT allowed.
- If you are even slightly unsure whether the CONTEXT matches the requested signal, respond with NO_CONTENT.
- NEVER fabricate, generalize, or summarize unrelated content just to produce an answer.
- NEVER output any explanation, apology, filler, disclaimers, or alternative summary when returning NO_CONTENT. Only output NO_CONTENT.

FORMAT (Telegram with HTML)
If you *do* find relevant content and you are NOT returning NO_CONTENT:

- Use <b>...</b> for headers, titles, and key findings.
- Use <i>...</i> for clearly stated or clearly implied impact (opportunity, risk, strategic significance).
- Use "- " for bullet points and normal line breaks to separate items.
- Use <a href="AUTHOR_URL">AUTHOR_NAME</a> for clickable author names (use full name from AUTHOR field).
- Use source numbers [N] from the context for citations (e.g., "Source 1", "Source 2").
- Do NOT use Markdown or tables.
- Keep messages short and easy to consume.
- Stay under 4096 characters.

SOURCE ATTRIBUTION
- Each excerpt in CONTEXT has a number [N] at the start.
- At the end of your message, always include a <b>Sources:</b> section:
  <b>Sources:</b>
  <a href="SOURCE_URL_1">Source 1</a>, <a href="SOURCE_URL_2">Source 2</a>, ...
- List only the sources you actually used in your message.
- Use the same numbers [N] from the CONTEXT.

STRUCTURE
Follow the specific structure and requirements provided in the QUERY. The QUERY will tell you exactly what to extract and how to format it.

FINAL REMINDERS
- NEVER invent or guess missing details.
- ALWAYS include source attribution with numbered links.
- Use author names as clickable HTML links: <a href="AUTHOR_URL">AUTHOR_NAME</a>
- If there is nothing relevant to the QUERY signal, output ONLY: NO_CONTENT
`;

  const { data: industries } = await supa
    .from("industries")
    .select("*")
    .eq("visible", true)
    .order("id");

  const { data: signals } = await supa
    .from("signals")
    .select("*")
    .eq("visible", true)
    .order("id");

  const validSignals =
    signals?.filter(
      (s) => s.embedding_query && s.embedding_query.trim() !== "",
    ) || [];

  if (
    !industries ||
    !validSignals ||
    industries.length === 0 ||
    validSignals.length === 0
  ) {
    console.error(
      "[generate] No visible industries or valid signals with embedding_query",
    );
    return NextResponse.json(
      { ok: false, error: "No industries/signals" },
      { status: 400 },
    );
  }

  const totalPairs = industries.length * validSignals.length;

  console.log(
    `[generate] Total pairs: ${totalPairs}, current offset: ${batchOffset}`,
  );

  if (batchOffset === 0) {
    console.log("[generate] First batch - deleting all old messages");
    const { error: deleteError } = await supa
      .from("messages")
      .delete()
      .neq("id", 0);

    if (deleteError) {
      console.error("[generate] Error deleting old messages:", deleteError);
    } else {
      console.log("[generate] Old messages deleted");
    }

    await supa
      .from("pipeline_jobs")
      .update({
        total_items: totalPairs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log(`[generate] Set total_items to ${totalPairs}`);
  }

  if (batchOffset >= totalPairs) {
    console.log("[generate] All messages generated, transitioning to sending");

    let recipientsQuery = supa
      .from("users")
      .select("id", { count: "exact", head: true })
      .not("telegram_chat_id", "is", null);

    if (debugMode) {
      recipientsQuery = recipientsQuery.eq("is_admin", true);
    }

    const { count: recipientCount } = await recipientsQuery;
    const totalRecipients = recipientCount || 0;

    await supa
      .from("pipeline_jobs")
      .update({
        status: "sending",
        current_batch_offset: 0,
        total_items: totalRecipients,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json({ ok: true, generated: 0 });
  }

  const industryIdx = Math.floor(batchOffset / validSignals.length);
  const signalIdx = batchOffset % validSignals.length;
  const industry = industries[industryIdx];
  const signal = validSignals[signalIdx];

  console.log(
    `[generate] Processing industry: ${industry.name}, signal: ${signal.name}`,
  );

  const newOffset = batchOffset + 1;
  await supa
    .from("pipeline_jobs")
    .update({
      current_batch_offset: newOffset,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  console.log(`[generate] Offset updated to ${newOffset} before GPT call`);

  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: signal.embedding_query,
    dimensions: 1536,
  });

  const embedding = embeddingRes.data[0].embedding;

  const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);

  let queryRes: any;
  try {
    queryRes = await index.namespace("default").query({
      vector: embedding,
      topK: 10,
      includeMetadata: true,
      filter: {
        industry_ids: { $in: [String(industry.id)] },
      },
    });
  } catch (error: any) {
    const message = error?.message || "";
    const status = error?.status || error?.code;
    const notFound =
      status === 404 ||
      (typeof message === "string" && /not\s+found/i.test(message));

    if (notFound) {
      console.log(
        `[generate] Pinecone namespace empty for industry ${industry.name}; skipping`,
      );
      return NextResponse.json({
        ok: true,
        generated: 0,
        industry: industry.name,
        signal: signal.name,
      });
    }

    console.error("[generate] Pinecone query failed:", error);
    throw error;
  }

  if (!queryRes.matches || queryRes.matches.length === 0) {
    console.log(
      `[generate] No posts found for industry ${industry.name}, signal ${signal.name}`,
    );

    return NextResponse.json({
      ok: true,
      generated: 0,
      industry: industry.name,
      signal: signal.name,
    });
  }

  console.log(
    `[generate] Found ${queryRes.matches.length} posts after semantic search`,
  );

  const context = queryRes.matches
    .map((m: any, index: number) => {
      const meta = m.metadata as any;
      if (!meta?.text) return null;
      return `---
[${index + 1}]
TEXT: ${meta.text}
AUTHOR: ${meta.name || "Unknown"}
AUTHOR_TITLE: ${meta.title || ""}
AUTHOR_URL: ${meta.author_url || ""}
SOURCE_URL: ${meta.source_url || ""}
---`;
    })
    .filter(Boolean)
    .join("\n\n");

  const userMessage = `CONTEXT:\n${context}\n\nQUERY: ${signal.prompt}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const messageText = completion.choices[0]?.message?.content || "";

  if (!messageText || messageText.trim() === "NO_CONTENT") {
    console.log(
      `[generate] No relevant content found for industry ${industry.name}, signal ${signal.name}`,
    );

    return NextResponse.json({
      ok: true,
      generated: 0,
      industry: industry.name,
      signal: signal.name,
    });
  }

  console.log(`[generate] Generated message (${messageText.length} chars)`);

  await supa.from("messages").insert({
    industry_id: industry.id,
    signal_id: signal.id,
    message_text: messageText,
    delivered_user_ids: [],
  });

  const isDone = newOffset >= totalPairs;

  console.log(`[generate] Message inserted. Done: ${isDone}`);

  if (isDone) {
    const { data: userCount } = await supa
      .from("users")
      .select("id", { count: "exact", head: true })
      .not("telegram_chat_id", "is", null);

    await supa
      .from("pipeline_jobs")
      .update({
        status: "sending",
        current_batch_offset: 0,
        total_items: (userCount as any)?.count || 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log("[generate] All messages generated, transitioning to sending");
  }

  return NextResponse.json({
    ok: true,
    generated: 1,
    industry: industry.name,
    signal: signal.name,
  });
}
