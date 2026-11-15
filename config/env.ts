import "dotenv/config";
import { z } from "zod";

// Tunables for Redis, workers, retries and the mock provider. DATABASE_URL/PORT stay in ../../config.
const schema = z.object({
  REDIS_URL: z.string().default("redis://localhost:6379"),
  LOG_LEVEL: z.string().default("info"),
  CAMPAIGN_CONCURRENCY: z.coerce.number().int().positive().default(2),
  MESSAGE_CONCURRENCY: z.coerce.number().int().positive().default(10),
  NOTIFICATION_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MESSAGE_RATE_MAX: z.coerce.number().int().positive().default(100),
  MESSAGE_RATE_WINDOW_MS: z.coerce.number().int().positive().default(1000),
  RETRY_ATTEMPTS: z.coerce.number().int().min(1).default(3),
  RETRY_BACKOFF_MS: z.coerce.number().int().positive().default(2000),
  EXPAND_BATCH_SIZE: z.coerce.number().int().positive().default(500),
  STALLED_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  PROVIDER_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
  PROVIDER_LATENCY_MS: z.coerce.number().int().min(0).default(30),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

export const env = schema.parse(process.env);
