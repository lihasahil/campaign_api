import { campaignQueue, messageQueue, notificationQueue } from './index';
import { redis } from '../../config/redis-client';
import type { MessageJob } from '../types/jobs';
import { logger } from '../../utils/logger';

// All job creation lives here. Deterministic jobIds are the first layer of duplicate prevention:
// BullMQ ignores add() when the jobId already exists. (Second layer: atomic claim in the message worker.)
export const campaignJobId = (id: string, epoch: number) =>
  `campaign-${id}-${epoch}`;
export const messageJobId = (id: string, epoch: number) =>
  `message-${id}-${epoch}`;
export const notificationJobId = (campaignId: string) =>
  `notification-${campaignId}`;

// Smaller campaigns jump ahead of huge ones (lower number = higher priority in BullMQ).
export const priorityFor = (total: number) =>
  total <= 100 ? 1 : total <= 1000 ? 5 : 10;

// "Epoch" = how many times a campaign was resumed. It is part of the jobId so that messages skipped
// while paused can be re-added (BullMQ otherwise ignores a jobId it still remembers).
const epochKey = (id: string) => `campaign:epoch:${id}`;
export async function currentEpoch(id: string): Promise<number> {
  const v = await redis.get(epochKey(id));
  return v ? Number(v) : 0;
}
export const nextEpoch = (id: string) => redis.incr(epochKey(id));

export async function addCampaignJob(
  campaignId: string,
  organizationId: string,
  total: number,
  opts: { epoch?: number; delayMs?: number } = {}
) {
  const epoch = opts.epoch ?? 0;
  const job = await campaignQueue.add(
    'expand-campaign',
    { campaignId, organizationId, epoch },
    {
      jobId: campaignJobId(campaignId, epoch),
      delay: opts.delayMs && opts.delayMs > 0 ? opts.delayMs : undefined,
      priority: priorityFor(total),
    }
  );
  logger.info(
    { campaignId, jobId: job.id, delayMs: opts.delayMs ?? 0 },
    'campaign job enqueued'
  );
  return job;
}

// A scheduled campaign has a delayed job: "start now" promotes it.
export async function promoteCampaignJob(campaignId: string, epoch = 0) {
  const job = await campaignQueue.getJob(campaignJobId(campaignId, epoch));
  if (job && (await job.isDelayed())) await job.promote();
  return job?.id;
}

export const addMessageJobs = (
  batch: MessageJob[],
  epoch: number,
  total: number
) => {
  const priority = priorityFor(total);
  return messageQueue.addBulk(
    batch.map(data => ({
      name: 'send-message',
      data,
      opts: { jobId: messageJobId(data.messageId, epoch), priority },
    }))
  );
};

export const addNotificationJob = (
  campaignId: string,
  organizationId: string
) =>
  notificationQueue.add(
    'campaign-finished',
    { campaignId, organizationId },
    { jobId: notificationJobId(campaignId) }
  );

export const getMessageJob = async (messageId: string, epoch: number) =>
  messageQueue.getJob(messageJobId(messageId, epoch));

// Best-effort removal of not-yet-started jobs of ONE campaign (pause/cancel). Workers also re-check the
// campaign status before sending, so this only keeps the queue tidy.
export async function purgeCampaignJobs(campaignId: string, cap = 50000) {
  const queued = await campaignQueue.getJobs([
    'delayed',
    'waiting',
    'prioritized',
  ]);
  await Promise.all(
    queued
      .filter(j => j.data.campaignId === campaignId)
      .map(j => j.remove().catch(() => undefined))
  );
  let removed = 0;
  for (let start = 0; start < cap; start += 1000) {
    const jobs = await messageQueue.getJobs(
      ['waiting', 'prioritized', 'delayed'],
      start,
      start + 999
    );
    if (!jobs.length) break;
    const mine = jobs.filter(j => j.data.campaignId === campaignId);
    await Promise.all(mine.map(j => j.remove().catch(() => undefined)));
    removed += mine.length;
  }
  logger.info({ campaignId, removed }, 'purged queued jobs');
}
