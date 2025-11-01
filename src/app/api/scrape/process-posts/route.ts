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

const pickOcc = (x: ApifyItem) => {
  if (x?.isActivity) {
    return cleanText(x?.activityOfUser?.occupation || "");
  }
  return cleanText(x?.author?.occupation || "");
};

const pickName = (x: ApifyItem) => {
  if (x?.isActivity) {
    const fn = cleanText(x?.activityOfUser?.firstName || "");
    const ln = cleanText(x?.activityOfUser?.lastName || "");
    return [fn, ln].filter(Boolean).join(" ").trim();
  }
  const fn = cleanText(x?.author?.firstName || "");
  const ln = cleanText(x?.author?.lastName || "");
  return [fn, ln].filter(Boolean).join(" ").trim();
};

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
  const runStartedAt = runInfo.data?.startedAt || job.started_at;

  console.log(`[process-posts] Fetched ${items.length} items from dataset`);

  let inserted = 0;
  let skipped = 0;

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  for (const [idx, item] of items.entries()) {
    const globalIndex = batchOffset + idx;
    const profileUrl = norm(
      item?.inputUrl ||
        item?.authorProfileUrl ||
        (item?.author?.publicId
          ? `https://www.linkedin.com/in/${item.author.publicId}`
          : "") ||
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

    const name = pickName(item);
    const occupation = pickOcc(item);

    const profileOccupation = cleanText(profile.occupation || "");

    const validOcc = !!(occupation && rx.test(occupation));

    if (profileOccupation && validOcc && profileOccupation !== occupation) {
      console.log(
        `[process-posts] Occupation mismatch for ${profileUrl}: "${profile.occupation}" != "${occupation}"`,
      );
      const detectedAt = new Date().toISOString();
      const details = {
        stored_value: profile.occupation,
        stored_value_normalized: profileOccupation,
        scraped_value: occupation,
        scraped_value_normalized: occupation,
        pipeline_job_id: job.id,
        apify_run_id: job.apify_run_id,
        apify_run_started_at: runStartedAt,
        dataset_id: datasetId,
        dataset_index: globalIndex,
      };
      await supa
        .from("linkedin")
        .update({
          allowed: false,
          unverified_details: details,
          unverified_at: detectedAt,
        })
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

    const postedAtRaw = item.postedAtTimestamp ?? item.postedAtISO;

    let postedAtMs: number | undefined;

    if (typeof postedAtRaw === "number") {
      postedAtMs = postedAtRaw;
    } else if (typeof postedAtRaw === "string") {
      const numericCandidate = Number(postedAtRaw);
      if (Number.isFinite(numericCandidate)) {
        postedAtMs = numericCandidate;
      } else {
        const parsed = Date.parse(postedAtRaw);
        if (!Number.isNaN(parsed)) {
          postedAtMs = parsed;
        }
      }
    }

    if (postedAtMs === undefined && item.postedAtISO) {
      const isoParsed = Date.parse(item.postedAtISO);
      if (!Number.isNaN(isoParsed)) {
        postedAtMs = isoParsed;
      }
    }

    if (
      postedAtMs === undefined ||
      Number.isNaN(postedAtMs) ||
      postedAtMs < oneDayAgo
    ) {
      const postedAtLog =
        postedAtMs === undefined || Number.isNaN(postedAtMs)
          ? "missing"
          : new Date(postedAtMs).toISOString();
      console.log(
        `[process-posts] Skipping: post older than 24h (postedAt=${postedAtLog}, threshold=${new Date(oneDayAgo).toISOString()})`,
      );
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
    const postedAtIso = new Date(postedAtMs).toISOString();

    const { error } = await supa.from("posts").insert({
      urn: item.urn,
      name: name || null,
      occupation: validOcc ? occupation : null,
      text,
      posted_at: postedAtIso,
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
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: visibleIndustries } = await supa
      .from("industries")
      .select("id")
      .eq("visible", true);

    const visibleIds = (visibleIndustries || [])
      .map((row: any) => Number(row.id))
      .filter((id) => Number.isFinite(id));

    if (visibleIds.length === 0) {
      console.log(
        "[process-posts] No visible industries remain; marking job completed",
      );
      updateData.status = "completed";
      updateData.current_batch_offset = 0;
      updateData.total_items = 0;
    } else {
      const { data: recent } = await supa
        .from("posts")
        .select("id")
        .gte("created_at", cutoff)
        .overlaps("industry_ids", visibleIds);

      const remaining = (recent as any)?.length ?? 0;

      if (remaining === 0) {
        console.log(
          "[process-posts] No eligible posts remain after processing; marking job completed",
        );
        updateData.status = "completed";
        updateData.current_batch_offset = 0;
        updateData.total_items = 0;
      } else {
        updateData.status = "vectorizing";
        updateData.total_items = remaining;
        console.log(
          `[process-posts] Processing complete; ${remaining} posts ready for vectorization`,
        );
      }
    }
  }

  await supa.from("pipeline_jobs").update(updateData).eq("id", job.id);

  return NextResponse.json({ ok: true, inserted, skipped });
}
