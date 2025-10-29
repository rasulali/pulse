import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ApifyItem } from "../../links/links.types";
import { cleanText } from "@/lib/text";

const sadmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

const norm = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname.replace(/\/+$/, "")}`;
  } catch {
    return u;
  }
};

const rx = /[A-Za-z\u00C0-\u024F\u0400-\u04FF]/u;

export async function POST(req: Request) {
  console.log("[process-posts] Starting batch processing");

  const body: any = await req.json();
  const batchOffset = body.batch_offset || 0;
  const batchSize = body.batch_size || 10;

  console.log(
    `[process-posts] Batch offset: ${batchOffset}, size: ${batchSize}`,
  );

  const supa = sadmin();

  const { data: job } = await supa
    .from("pipeline_jobs")
    .select("*")
    .eq("status", "processing")
    .order("id", { ascending: false })
    .limit(1)
    .single();

  if (!job) {
    console.error("[process-posts] No processing job found");
    return NextResponse.json(
      { ok: false, error: "No processing job" },
      { status: 404 },
    );
  }

  if (!job.apify_run_id) {
    console.error("[process-posts] Job has no apify_run_id");
    return NextResponse.json(
      { ok: false, error: "No run ID" },
      { status: 400 },
    );
  }

  const runRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${job.apify_run_id}?token=${process.env.APIFY_TOKEN}`,
    { cache: "no-store" },
  );

  if (!runRes.ok) {
    console.error("[process-posts] Failed to fetch run info");
    return NextResponse.json(
      { ok: false, error: "Run fetch failed" },
      { status: 502 },
    );
  }

  const runInfo = (await runRes.json()) as any;
  const datasetId = runInfo.data?.defaultDatasetId;

  if (!datasetId) {
    console.error("[process-posts] No dataset ID");
    return NextResponse.json(
      { ok: false, error: "No dataset" },
      { status: 502 },
    );
  }

  const datasetRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?offset=${batchOffset}&limit=${batchSize}&token=${process.env.APIFY_TOKEN}`,
    { cache: "no-store" },
  );

  if (!datasetRes.ok) {
    console.error("[process-posts] Failed to fetch dataset items");
    return NextResponse.json(
      { ok: false, error: "Dataset fetch failed" },
      { status: 502 },
    );
  }

  const items = (await datasetRes.json()) as ApifyItem[];

  console.log(`[process-posts] Fetched ${items.length} items from dataset`);

  let inserted = 0;
  let skipped = 0;

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  for (const item of items) {
    const profileUrl = norm(
      item?.authorProfileUrl ||
        (item?.author?.publicId
          ? `https://www.linkedin.com/in/${item.author.publicId}`
          : "") ||
        item?.inputUrl ||
        (item?.activityOfUser?.publicId
          ? `https://www.linkedin.com/in/${item.activityOfUser.publicId}`
          : ""),
    );

    if (!profileUrl) {
      console.log("[process-posts] Skipping: no profile URL");
      skipped++;
      continue;
    }

    const { data: profile } = await supa
      .from("linkedin")
      .select("*")
      .eq("url", profileUrl)
      .single();

    if (!profile) {
      console.log(
        `[process-posts] Skipping: profile not found for ${profileUrl}`,
      );
      skipped++;
      continue;
    }

    let name = "";
    let occupation = "";
    let headline = "";

    if (item.isActivity) {
      const fn = (item.activityOfUser?.firstName || "").trim();
      const ln = (item.activityOfUser?.lastName || "").trim();
      name = [fn, ln].filter(Boolean).join(" ").trim();
      occupation = (item.activityOfUser?.occupation || "").trim();
    } else {
      const fn = (item.author?.firstName || "").trim();
      const ln = (item.author?.lastName || "").trim();
      name = [fn, ln].filter(Boolean).join(" ").trim();
      occupation = (item.author?.occupation || "").trim();
      headline = (item.authorHeadline || "").trim();
    }

    const validOcc = !!(occupation && rx.test(occupation));
    const validHead = !!(headline && rx.test(headline));

    if (profile.occupation && validOcc && profile.occupation !== occupation) {
      console.log(
        `[process-posts] Occupation mismatch for ${profileUrl}: "${profile.occupation}" != "${occupation}"`,
      );
      await supa
        .from("linkedin")
        .update({ allowed: false })
        .eq("id", profile.id);
      skipped++;
      continue;
    }

    if (profile.headline && validHead && profile.headline !== headline) {
      console.log(
        `[process-posts] Headline mismatch for ${profileUrl}: "${profile.headline}" != "${headline}"`,
      );
      await supa
        .from("linkedin")
        .update({ allowed: false })
        .eq("id", profile.id);
      skipped++;
      continue;
    }

    if (!item.urn) {
      console.log("[process-posts] Skipping: no URN");
      skipped++;
      continue;
    }

    const { data: existing } = await supa
      .from("posts")
      .select("id")
      .eq("urn", item.urn)
      .single();

    if (existing) {
      console.log(`[process-posts] Skipping: URN already exists ${item.urn}`);
      skipped++;
      continue;
    }

    if (!item.postedAtTimestamp || item.postedAtTimestamp < oneDayAgo) {
      console.log(`[process-posts] Skipping: post older than 24h`);
      skipped++;
      continue;
    }

    const text = cleanText(item.text || "");

    if (!text) {
      console.log("[process-posts] Skipping: no text after cleaning");
      skipped++;
      continue;
    }

    const industryIds = profile.industry_ids || [];
    const sourceUrl = item.url || "";
    const authorUrl = item.inputUrl || profileUrl;

    const { error } = await supa.from("posts").insert({
      urn: item.urn,
      name: name || null,
      occupation: validOcc ? occupation : null,
      headline: validHead ? headline : null,
      text,
      posted_at: new Date(item.postedAtTimestamp).toISOString(),
      industry_ids: industryIds,
      source_url: sourceUrl,
      author_url: authorUrl,
    });

    if (error) {
      console.error(`[process-posts] Insert failed for ${item.urn}:`, error);
      skipped++;
    } else {
      console.log(`[process-posts] Inserted post: ${item.urn}`);
      inserted++;
    }
  }

  const newOffset = batchOffset + batchSize;
  const isDone = newOffset >= job.total_items;

  console.log(
    `[process-posts] Batch complete. Inserted: ${inserted}, Skipped: ${skipped}, Done: ${isDone}`,
  );

  const updateData: any = {
    current_batch_offset: isDone ? 0 : newOffset,
    updated_at: new Date().toISOString(),
  };

  if (isDone) {
    updateData.status = "vectorizing";
    console.log(
      "[process-posts] All posts processed, transitioning to vectorizing",
    );
  }

  await supa.from("pipeline_jobs").update(updateData).eq("id", job.id);

  return NextResponse.json({ ok: true, inserted, skipped });
}
