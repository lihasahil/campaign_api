import { campaignQueue } from "../queues/campaign/campaign.queue";
import { messageQueue } from "../queues/message/message.queue";
import { notificationQueue } from "../queues/notification/notification.queue";
import type { MessageJob } from "./types";
import { logger } from "../../utils/logger";
import { redis } from "../../config/redis-client";

// Deterministic job ids are the first layer of duplicate prevention: BullMQ ignores an add()
// whose jobId already exists. (The second layer is the atomic claim in the message worker.)
export const campaignJobId = (id: string, epoch: number) =>
  `campaign-${id}-${epoch}`;
export const messageJobId = (id: string, epoch: number) =>
  `message-${id}-${epoch}`;
export const notificationJobId = (campaignId: string) =>
  `notification-${campaignId}`;

// Smaller campaigns jump ahead of huge ones (lower number = higher priority in BullMQ).
export const priorityFor = (total: number) =>
  total <= 100 ? 1 : total <= 1000 ? 5 : 10;

const epochKey = (id: string) => `campaign:epoch:${id}`;
export async function currentEpoch(id: string): Promise<number> {
  const v = await redis.get(epochKey(id));
  return v ? Number(v) : 0;
}
export async function nextEpoch(id: string): Promise<number> {
  return redis.incr(epochKey(id));
}

export async function enqueueCampaign(
  campaignId: string,
  organizationId: string,
  total: number,
  opts: { epoch?: number; delayMs?: number } = {},
) {
  const epoch = opts.epoch ?? 0;
  const job = await campaignQueue.add(
    "expand-campaign",
    { campaignId, organizationId, epoch },
    {
      jobId: campaignJobId(campaignId, epoch),
      delay: opts.delayMs && opts.delayMs > 0 ? opts.delayMs : undefined,
      priority: priorityFor(total),
    },
  );
  logger.info(
    { campaignId, jobId: job.id, delayMs: opts.delayMs ?? 0 },
    "campaign job enqueued",
  );
  return job;
}

export async function enqueueMessages(
  batch: MessageJob[],
  epoch: number,
  total: number,
) {
  const priority = priorityFor(total);
  return messageQueue.addBulk(
    batch.map((data) => ({
      name: "send-message",
      data,
      opts: { jobId: messageJobId(data.messageId, epoch), priority },
    })),
  );
}

export async function enqueueNotification(
  campaignId: string,
  organizationId: string,
) {
  return notificationQueue.add(
    "campaign-finished",
    { campaignId, organizationId },
    { jobId: notificationJobId(campaignId) },
  );
}

// Best-effort removal of not-yet-started jobs for one campaign (pause/cancel). The workers also
// re-check campaign status before sending, so this only keeps the queue tidy.
export async function purgeCampaignJobs(campaignId: string, cap = 50000) {
  const queued = await campaignQueue.getJobs([
    "delayed",
    "waiting",
    "prioritized",
  ]);
  await Promise.all(
    queued
      .filter((j) => j.data.campaignId === campaignId)
      .map((j) => j.remove().catch(() => undefined)),
  );
  let removed = 0;
  for (let start = 0; start < cap; start += 1000) {
    const jobs = await messageQueue.getJobs(
      ["waiting", "prioritized", "delayed"],
      start,
      start + 999,
    );
    if (!jobs.length) break;
    const mine = jobs.filter((j) => j.data.campaignId === campaignId);
    await Promise.all(mine.map((j) => j.remove().catch(() => undefined)));
    removed += mine.length;
  }
  logger.info({ campaignId, removed }, "purged queued jobs");
}
