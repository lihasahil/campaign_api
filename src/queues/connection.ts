import type { JobsOptions } from "bullmq";
import { env } from "../../config/env";

// Starting point from the brief, driven by env so tests can shorten the back-off.
export const defaultJobOptions: JobsOptions = {
  attempts: env.RETRY_ATTEMPTS,
  backoff: { type: "exponential", delay: env.RETRY_BACKOFF_MS },
  removeOnComplete: { age: 86400 },
  removeOnFail: false,
};
