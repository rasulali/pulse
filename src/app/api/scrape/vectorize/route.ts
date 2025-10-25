import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export async function POST(req: Request) {
  console.log('[vectorize] Starting batch vectorization');

  const body = await req.json() as any;
  const batchOffset = body.batch_offset || 0;
  const batchSize = body.batch_size || 10;

  console.log(`[vectorize] Batch offset: ${batchOffset}, size: ${batchSize}`);

  const supa = sadmin();

  const { data: job } = await supa
    .from("pipeline_jobs")
    .select("*")
    .eq("status", "vectorizing")
    .order("id", { ascending: false })
    .limit(1)
    .single();

  if (!job) {
    console.error('[vectorize] No vectorizing job found');
    return NextResponse.json({ ok: false, error: 'No vectorizing job' }, { status: 404 });
  }

  const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);

  if (batchOffset === 0) {
    console.log('[vectorize] First batch - deleting all existing vectors');
    try {
      await index.namespace('default').deleteAll();
      console.log('[vectorize] Vectors deleted');
    } catch (error) {
      console.log('[vectorize] No vectors to delete (namespace might be empty):', error);
    }
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: posts } = await supa
    .from("posts")
    .select("*")
    .gte("created_at", oneDayAgo)
    .order("created_at", { ascending: false })
    .range(batchOffset, batchOffset + batchSize - 1);

  if (!posts || posts.length === 0) {
    console.log('[vectorize] No posts to vectorize in this batch');

    const { data: totalCount } = await supa
      .from("posts")
      .select("id", { count: 'exact', head: true })
      .gte("created_at", oneDayAgo);

    const newOffset = batchOffset + batchSize;
    const isDone = newOffset >= (totalCount as any)?.count || 0;

    if (isDone) {
      console.log('[vectorize] All posts vectorized, transitioning to generating');
      await supa
        .from("pipeline_jobs")
        .update({
          status: 'generating',
          current_batch_offset: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }

    return NextResponse.json({ ok: true, vectorized: 0 });
  }

  console.log(`[vectorize] Vectorizing ${posts.length} posts`);

  const texts = posts.map(p => p.text);

  const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
    dimensions: 1536,
  });

  const vectors = posts.map((post, i) => ({
    id: `post-${post.id}`,
    values: embeddingRes.data[i].embedding,
    metadata: {
      // Pinecone only supports list of strings, not list of numbers
      industry_ids: (post.industry_ids || []).map(String),
      text: post.text.substring(0, 40000), // Pinecone metadata limit
    },
  }));

  console.log(`[vectorize] Upserting ${vectors.length} vectors to Pinecone`);
  console.log(`[vectorize] Sample vector structure:`, JSON.stringify({
    id: vectors[0].id,
    values_length: vectors[0].values.length,
    metadata: vectors[0].metadata
  }, null, 2));

  try {
    await index.namespace('default').upsert(vectors);
    console.log(`[vectorize] Successfully upserted ${vectors.length} vectors to Pinecone`);
  } catch (error: any) {
    console.error('[vectorize] ========== PINECONE UPSERT ERROR ==========');
    console.error('[vectorize] Error message:', error?.message);
    console.error('[vectorize] Error name:', error?.name);
    console.error('[vectorize] Error stack:', error?.stack);
    console.error('[vectorize] Full error object:', JSON.stringify(error, null, 2));
    console.error('[vectorize] Sample vector that failed:', JSON.stringify(vectors[0], null, 2));
    console.error('[vectorize] ===========================================');
    throw error;
  }

  const { data: totalCount } = await supa
    .from("posts")
    .select("id", { count: 'exact', head: true })
    .gte("created_at", oneDayAgo);

  const totalPosts = (totalCount as any)?.count || 0;
  const newOffset = batchOffset + batchSize;
  const isDone = newOffset >= totalPosts;

  console.log(`[vectorize] Batch complete. Vectorized: ${posts.length}, Done: ${isDone}`);

  const updateData: any = {
    current_batch_offset: isDone ? 0 : newOffset,
    total_items: totalPosts,
    updated_at: new Date().toISOString(),
  };

  if (isDone) {
    updateData.status = 'generating';
    console.log('[vectorize] All posts vectorized, transitioning to generating');
  }

  await supa
    .from("pipeline_jobs")
    .update(updateData)
    .eq("id", job.id);

  return NextResponse.json({ ok: true, vectorized: posts.length });
}
