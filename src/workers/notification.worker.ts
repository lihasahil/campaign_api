import { Worker } from "bullmq";
import { env } from "../../config/env";
import { redisConnection } from "../../config/redis";
import { QUEUE_NAMES } from "../queues";
import { notificationService } from "../services/notification.service";
import type { NotificationJob } from "../types/jobs";
import { logger } from "../../utils/logger";

export function createNotificationWorker() {
  const worker = new Worker<NotificationJob>(
    QUEUE_NAMES.notification,
    async (job) => {
      const n = await notificationService.createCampaignSummary(
        job.data.campaignId,
      );
      return { notificationId: n?.id ?? null };
    },
    {
      connection: redisConnection,
      concurrency: env.NOTIFICATION_CONCURRENCY,
      stalledInterval: env.STALLED_INTERVAL_MS,
    },
  );
  worker.on("error", (err) =>
    logger.error({ err, queue: "notification" }, "worker error"),
  );
  worker.on("failed", (job, err) =>
    logger.warn(
      { queue: "notification", jobId: job?.id, err: err.message },
      "job failed",
    ),
  );
  return worker;
}
