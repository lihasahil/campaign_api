import { Redis } from "ioredis";
import { redisConnection } from "./redis";
import { logger } from "../utils/logger";

// Plain ioredis client for small non-BullMQ keys (job epoch, API idempotency keys, mock-provider state).
export const redis = new Redis({ ...(redisConnection as object), maxRetriesPerRequest: null, lazyConnect: false });
redis.on("error", (err) => logger.error({ err: err.message }, "redis client error"));
redis.on("reconnecting", () => logger.warn("redis client reconnecting"));
redis.on("ready", () => logger.info("redis client ready"));
