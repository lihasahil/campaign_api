import { Worker, type Job } from "bullmq";
import { env } from "../../config/env";
import { redisConnection } from "../../config/redis";
import { QUEUE_NAMES } from "../queues";
import { addMessageJobs } from "../queues/producer";
import { campaignRepository } from "../repositories/campaign.repository";
import { messageRepository } from "../repositories/message.repository";
import {
  CampaignStatus,
  NotificationType,
} from "../../generated/prisma/client";
import { maybeCompleteCampaign } from "../services/campaign-progress.service";
import { notificationService } from "../services/notification.service";
import type { CampaignJob } from "../types/jobs";
import { logger } from "../../utils/logger";

// Expands one campaign into one message job per PENDING message, in batches.
// Safe to re-run: jobIds are deterministic and only PENDING messages are enqueued, so a retry after a
// partial enqueue failure adds only what is missing. Status is re-checked every batch (pause/cancel).
async function processCampaign(job: Job<CampaignJob>) {
  const { campaignId, epoch } = job.data;
  const log = logger.child({ queue: "campaign", jobId: job.id, campaignId });
  const campaign = await campaignRepository.findById(campaignId);
  if (!campaign) return { skipped: "not_found" };
  if (campaign.status === CampaignStatus.QUEUED) {
    if (
      await campaignRepository.transition(
        campaignId,
        [CampaignStatus.QUEUED],
        CampaignStatus.PROCESSING,
      )
    ) {
      await notificationService.record(
        campaign.organizationId,
        campaignId,
        NotificationType.CAMPAIGN_STARTED,
        `Campaign "${campaign.name}" started processing.`,
      );
    }
  } else if (campaign.status !== CampaignStatus.PROCESSING) {
    log.info({ status: campaign.status }, "campaign not runnable, skipping");
    return { skipped: campaign.status };
  }

  let lastId = "";
  let enqueued = 0;
  for (;;) {
    const status = (await campaignRepository.findById(campaignId))?.status;
    if (status !== CampaignStatus.PROCESSING) {
      log.info({ status, enqueued }, "expansion stopped (paused/cancelled)");
      return { stopped: status, enqueued };
    }
    const batch = await messageRepository.pendingBatch(
      campaignId,
      lastId,
      env.EXPAND_BATCH_SIZE,
    );
    if (!batch.length) break;
    await addMessageJobs(
      batch.map((m) => ({
        campaignId,
        messageId: m.id,
        recipient: m.recipient,
        content: m.content,
        organizationId: campaign.organizationId,
      })),
      epoch,
      campaign.totalMessages,
    );
    enqueued += batch.length;
    lastId = batch[batch.length - 1].id;
    await job.updateProgress({ enqueued });
  }
  log.info({ enqueued }, "campaign expanded");
  await maybeCompleteCampaign(campaignId); // covers campaigns whose messages were already all terminal
  return { enqueued };
}

export function createCampaignWorker() {
  const worker = new Worker<CampaignJob>(
    QUEUE_NAMES.campaign,
    processCampaign,
    {
      connection: redisConnection,
      concurrency: env.CAMPAIGN_CONCURRENCY,
      stalledInterval: env.STALLED_INTERVAL_MS,
    },
  );
  worker.on("error", (err) =>
    logger.error({ err, queue: "campaign" }, "worker error"),
  );
  worker.on("completed", (job, result) =>
    logger.info({ queue: "campaign", jobId: job.id, result }, "job completed"),
  );
  worker.on("failed", async (job, err) => {
    logger.warn(
      {
        queue: "campaign",
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        err: err.message,
      },
      "job failed",
    );
    // Retries exhausted while expanding: mark FAILED so the campaign is not left in limbo.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      if (
        await campaignRepository.transition(
          job.data.campaignId,
          [CampaignStatus.QUEUED, CampaignStatus.PROCESSING],
          CampaignStatus.FAILED,
        )
      ) {
        await notificationService.record(
          job.data.organizationId,
          job.data.campaignId,
          NotificationType.CAMPAIGN_FAILED,
          "Campaign failed: could not enqueue all messages.",
        );
      }
    }
  });
  return worker;
}
