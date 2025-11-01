declare module "./.open-next/worker.js" {
  const worker: {
    fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response>;
  };

  export default worker;
}

declare module "./.open-next/.build/durable-objects/queue.js" {
  export const DOQueueHandler: any;
}

declare module "./.open-next/.build/durable-objects/sharded-tag-cache.js" {
  export const DOShardedTagCache: any;
}

declare module "./.open-next/.build/durable-objects/bucket-cache-purge.js" {
  export const BucketCachePurge: any;
}
