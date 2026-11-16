import { Queue, type JobsOptions } from 'bullmq';
import { redisConnection } from '../../config/redis';
import { env } from '../../config/env';
import type { CampaignJob, MessageJob, NotificationJob } from '../types/jobs';

// The three queues live in one file. Everything that adds jobs goes through ./producer.
export const QUEUE_NAMES = {
  campaign: 'campaign-queue',
  message: 'message-queue',
  notification: 'notification-queue',
} as const;

const defaultJobOptions: JobsOptions = {
  attempts: env.RETRY_ATTEMPTS,
  backoff: { type: 'exponential', delay: env.RETRY_BACKOFF_MS },
  removeOnComplete: { age: 86400 },
  removeOnFail: false, // keep failed jobs so they can be inspected
};

export const campaignQueue = new Queue<CampaignJob>(QUEUE_NAMES.campaign, {
  connection: redisConnection,
  defaultJobOptions,
});
export const messageQueue = new Queue<MessageJob>(QUEUE_NAMES.message, {
  connection: redisConnection,
  defaultJobOptions,
});
export const notificationQueue = new Queue<NotificationJob>(
  QUEUE_NAMES.notification,
  { connection: redisConnection, defaultJobOptions }
);

export const allQueues = [campaignQueue, messageQueue, notificationQueue];
export const closeQueues = () => Promise.all(allQueues.map(q => q.close()));
