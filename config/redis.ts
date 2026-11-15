import type { ConnectionOptions } from "bullmq";
import { env } from "./env";

const url = new URL(env.REDIS_URL);

// BullMQ creates (and duplicates) its own ioredis connections from these options.
// retryStrategy keeps reconnecting forever with capped back-off, so a Redis restart is survived.
export const redisConnection: ConnectionOptions = {
  host: url.hostname,
  port: Number(url.port) || 6379,
  username: url.username || undefined,
  password: url.password || undefined,
  db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
  tls: url.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => Math.min(times * 200, 5000),
};
