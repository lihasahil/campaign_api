import { Worker, UnrecoverableError, type Job } from "bullmq";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { redisConnection } from "../../config/redis";
import { MESSAGE_QUEUE } from "../queues/message/message.queue";
import { CampaignStatus, MessageStatus } from "../../generated/prisma/client";
import { maybeCompleteCampaign } from "../modules/campaign/campaign.progress";
import { assertValidPhone, sendSms } from "../modules/message/mock-sms.provider";
import { PermanentProviderError } from "../../utils/errors";
import type { MessageJob } from "../jobs/types";
import { logger, maskPhone } from "../../utils/logger";

const payloadSchema = z.object({ campaignId: z.string(), messageId: z.string(), recipient: z.string(), content: z.string(), organizationId: z.string() });

async function markFailed(messageId: string, campaignId: string) {
  await prisma.message.updateMany({ where: { id: messageId, status: { in: [MessageStatus.PENDING, MessageStatus.PROCESSING] } }, data: { status: MessageStatus.FAILED } });
  await maybeCompleteCampaign(campaignId);
}

async function processMessage(job: Job<MessageJob>) {
  const data = payloadSchema.parse(job.data); // malformed payload -> ZodError (see failure handling below)
  const log = logger.child({ queue: "message", jobId: job.id, messageId: data.messageId, campaignId: data.campaignId });

  // PostgreSQL is the source of truth: re-read the message and its campaign state on every run.
  const msg = await prisma.message.findUnique({ where: { id: data.messageId }, include: { campaign: { select: { status: true } } } });
  if (!msg) throw new UnrecoverableError("message not found");
  if (msg.status === MessageStatus.SENT || msg.status === MessageStatus.FAILED) return { skipped: "already_terminal" }; // duplicate run
  if (msg.campaign.status === CampaignStatus.PAUSED || msg.campaign.status === CampaignStatus.CANCELLED) {
    log.info({ campaignStatus: msg.campaign.status }, "not sending: campaign not active");
    return { skipped: msg.campaign.status }; // stays PENDING; resume re-enqueues it, cancel leaves it unsent
  }

  // Atomic claim. PROCESSING is claimable too, because a stalled/crashed run leaves that state behind;
  // re-sending is safe thanks to the provider idempotency key.
  const claim = await prisma.message.updateMany({
    where: { id: msg.id, status: { in: [MessageStatus.PENDING, MessageStatus.PROCESSING] } },
    data: { status: MessageStatus.PROCESSING, attempts: { increment: 1 } },
  });
  if (claim.count === 0) return { skipped: "lost_claim" };

  const attemptsAllowed = job.opts.attempts ?? 1;
  const isLastAttempt = job.attemptsMade + 1 >= attemptsAllowed;
  try {
    assertValidPhone(msg.recipient);
    const res = await sendSms({ idempotencyKey: msg.id, to: msg.recipient, body: msg.content });
    await prisma.message.update({ where: { id: msg.id }, data: { status: MessageStatus.SENT, providerReference: res.reference, sentAt: new Date() } });
    log.info({ to: maskPhone(msg.recipient), reference: res.reference, deduplicated: res.deduplicated, attempt: job.attemptsMade + 1 }, "message sent");
    await maybeCompleteCampaign(msg.campaignId);
    return { sent: true, deduplicated: res.deduplicated };
  } catch (err) {
    const e = err as Error;
    if (err instanceof PermanentProviderError) {
      log.warn({ to: maskPhone(msg.recipient), err: e.message }, "permanent failure, not retrying");
      await markFailed(msg.id, msg.campaignId);
      throw new UnrecoverableError(e.message); // skips remaining attempts
    }
    if (isLastAttempt) {
      log.error({ err: e.message, attempts: job.attemptsMade + 1 }, "retries exhausted");
      await markFailed(msg.id, msg.campaignId);
      throw err;
    }
    log.warn({ err: e.message, attempt: job.attemptsMade + 1, of: attemptsAllowed }, "transient failure, will retry");
    await prisma.message.updateMany({ where: { id: msg.id, status: MessageStatus.PROCESSING }, data: { status: MessageStatus.PENDING } });
    throw err; // BullMQ re-queues with exponential back-off
  }
}

export function createMessageWorker() {
  const worker = new Worker<MessageJob>(MESSAGE_QUEUE, processMessage, {
    connection: redisConnection,
    concurrency: env.MESSAGE_CONCURRENCY,
    limiter: { max: env.MESSAGE_RATE_MAX, duration: env.MESSAGE_RATE_WINDOW_MS }, // provider rate limit
    stalledInterval: env.STALLED_INTERVAL_MS,
    maxStalledCount: 1,
  });
  worker.on("error", (err) => logger.error({ err, queue: "message" }, "worker error"));
  worker.on("stalled", (jobId) => logger.warn({ queue: "message", jobId }, "job stalled, will be recovered"));
  worker.on("failed", async (job, err) => {
    // Jobs that stalled more than maxStalledCount never reach our catch block: close them out here.
    if (job && /stalled more than allowable limit/i.test(err.message)) {
      logger.error({ queue: "message", jobId: job.id }, "stalled job exhausted, marking FAILED");
      await markFailed(job.data.messageId, job.data.campaignId).catch((e) => logger.error({ err: e }, "markFailed error"));
    }
  });
  return worker;
}
