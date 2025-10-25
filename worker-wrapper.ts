// @ts-expect-error: Will be resolved by wrangler build
import worker from "./.open-next/worker.js";

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    return worker.fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext) {
    const url = env.CLOUDFLARE_WORKER_URL || "https://ai.alee.az";

    if (!env.CRON_SECRET) {
      console.error("[scheduled] CRON_SECRET not configured");
      throw new Error("CRON_SECRET not configured");
    }

    try {
      const response = await fetch(`${url}/api/cron/advance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.CRON_SECRET}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Cron endpoint returned ${response.status}`);
      }

      const result = await response.json();
      console.log("[scheduled] Cron completed:", result);
    } catch (error) {
      console.error("[scheduled] Cron failed:", error);
      throw error;
    }
  },
};

// @ts-expect-error: Will be resolved by wrangler build
export { DOQueueHandler } from "./.open-next/.build/durable-objects/queue.js";
// @ts-expect-error: Will be resolved by wrangler build
export { DOShardedTagCache } from "./.open-next/.build/durable-objects/sharded-tag-cache.js";
// @ts-expect-error: Will be resolved by wrangler build
export { BucketCachePurge } from "./.open-next/.build/durable-objects/bucket-cache-purge.js";
