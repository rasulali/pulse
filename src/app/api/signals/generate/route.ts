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

  const systemPrompt = `You are an AI assistant that analyzes professional business content and generates concise insights.

CONTEXT
The CONTEXT is plain text with multiple excerpts from business posts, corporate statements, leadership messages, industry updates, or news-style summaries. Excerpts are separated by blank lines.

CORE BEHAVIOR
1) Extract only concrete business-relevant intelligence: events, strategy shifts, risks, growth signals, opportunities.
2) If multiple excerpts describe the same topic, merge them into one insight instead of repeating.
3) Include specific factual details only if explicitly mentioned (dates, companies, geography, metrics, outcomes).
4) Never invent, infer, guess, speculate, or "soft suggest" anything that is not explicitly present in the CONTEXT.
5) You are allowed to respond with "NO_CONTENT". In fact, this is critical.

CRITICAL FILTERING RULE
Before you generate any output, you MUST decide if the CONTEXT actually contains information that matches the requested signal type.

- If (and only if) there is at least one clearly relevant, explicitly stated detail in the CONTEXT that matches the requested signal (examples: event info for an Events signal; partnership news for a Partnerships signal; investment/expansion info for an Expansion signal), then you should generate a normal formatted message (see FORMAT below).

- If there is NO relevant information in the CONTEXT for this signal, you MUST respond with exactly:
NO_CONTENT

- "Relevant" means directly stated. Hints, implications, vibes, or things you could infer are NOT allowed.
- If you are even slightly unsure whether the CONTEXT matches the requested signal, respond with NO_CONTENT.
- NEVER fabricate, generalize, or summarize unrelated content just to produce an answer.
- NEVER output any explanation, apology, filler, disclaimers, or alternative summary when returning NO_CONTENT. Only output NO_CONTENT.

FORMAT (Telegram)
If you *do* find relevant content and you are NOT returning NO_CONTENT, follow this output format:

- Use <b>...</b> for key findings and section headers.
- Use <i>...</i> for clearly stated or clearly implied impact (opportunity, risk, strategic significance).
- Use "- " for bullet points and normal line breaks to separate items.
- Do NOT use Markdown, tables, or links.
- Keep messages short and easy to consume; prefer a brief intro plus 3–6 focused bullets.
- Stay under 4096 characters.

STRUCTURE (Non-NO_CONTENT case)
1. Start with a header line using <b>...</b> that summarizes the main theme (ex: <b>Partnership / JV activity</b> or <b>Upcoming industry events</b>).
2. Then provide 3–6 bullet points using "- ".
   Each bullet should include:
   - What happened (only if explicitly stated in CONTEXT)
   - Who is involved (company, ministry, delegation, etc.)
   - When / where (date, country, venue) IF explicitly provided
   - The business relevance in <i>...</i> at the end

RULES FOR EVENTS SIGNALS
When the current signal is about professional gatherings (conferences, forums, summits, exhibitions, trade shows, roundtables, workshops, client demos, product showcases), extract only those.
For each event bullet (max ~5), include when available:
- Event: name or description
- Date / Location
- Key participants / delegations
- Purpose (partnership talks, regulatory discussion, product launch, etc.)
- Strategic note if the text clearly states why it matters

If no such professional gathering is present in CONTEXT, you MUST return NO_CONTENT.

FINAL REMINDERS
- NEVER invent or guess missing details (dates, locations, participants, motives).
- NEVER output generic filler like "no events were mentioned..." unless that information is literally in the CONTEXT.
- If there is nothing relevant, output ONLY: NO_CONTENT
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
  }

  if (batchOffset >= totalPairs) {
    console.log("[generate] All messages generated, transitioning to sending");

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

    return NextResponse.json({ ok: true, generated: 0 });
  }

  const industryIdx = Math.floor(batchOffset / validSignals.length);
  const signalIdx = batchOffset % validSignals.length;
  const industry = industries[industryIdx];
  const signal = validSignals[signalIdx];

  console.log(
    `[generate] Processing industry: ${industry.name}, signal: ${signal.name}`,
  );

  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: signal.embedding_query,
    dimensions: 1536,
  });

  const embedding = embeddingRes.data[0].embedding;

  const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);

  // Note: Pinecone Node.js SDK doesn't support rerank parameter yet
  // Using semantic search with top 10 results directly
  const queryRes = await index.namespace("default").query({
    vector: embedding,
    topK: 10,
    includeMetadata: true,
    filter: {
      // industry_ids is stored as array of strings in Pinecone
      industry_ids: { $in: [String(industry.id)] },
    },
  });

  if (!queryRes.matches || queryRes.matches.length === 0) {
    console.log(
      `[generate] No posts found for industry ${industry.name}, signal ${signal.name}`,
    );

    const newOffset = batchOffset + 1;
    await supa
      .from("pipeline_jobs")
      .update({
        current_batch_offset: newOffset,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json({
      ok: true,
      generated: 0,
      industry: industry.name,
      signal: signal.name,
    });
  }

  console.log(
    `[generate] Found ${queryRes.matches.length} posts after reranking`,
  );

  const context = queryRes.matches
    .map((m: any) => (m.metadata as any)?.text)
    .filter(Boolean)
    .join("\n\n");

  const userMessage = `CONTEXT: ${context}\n\nQUERY: ${signal.prompt}`;

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
    const newOffset = batchOffset + 1;
    await supa
      .from("pipeline_jobs")
      .update({
        current_batch_offset: newOffset,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

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
  });

  const newOffset = batchOffset + 1;
  const isDone = newOffset >= totalPairs;

  console.log(`[generate] Message inserted. Done: ${isDone}`);

  const updateData: any = {
    current_batch_offset: isDone ? 0 : newOffset,
    updated_at: new Date().toISOString(),
  };

  if (isDone) {
    const { data: userCount } = await supa
      .from("users")
      .select("id", { count: "exact", head: true })
      .not("telegram_chat_id", "is", null);

    updateData.status = "sending";
    updateData.total_items = (userCount as any)?.count || 0;
    console.log("[generate] All messages generated, transitioning to sending");
  }

  await supa.from("pipeline_jobs").update(updateData).eq("id", job.id);

  return NextResponse.json({
    ok: true,
    generated: 1,
    industry: industry.name,
    signal: signal.name,
  });
}
