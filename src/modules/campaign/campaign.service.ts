import { prisma } from "../../../config/prisma";
import {
  CampaignStatus,
  NotificationType,
} from "../../../generated/prisma/client";
import { campaignRepository as repo } from "../../repositiories/campaign.repository";
import { campaignQueue } from "../../queues/campaign/campaign.queue";
import { redis } from "../../../config/redis-client";
import {
  campaignJobId,
  currentEpoch,
  enqueueCampaign,
  nextEpoch,
  purgeCampaignJobs,
} from "../../jobs/enqueue";
import { notificationService } from "../notification/notification.service";
import { AppError, conflict, notFound } from "../../../utils/errors";
import { logger } from "../../../utils/logger";
import type { z } from "zod";
import type { createCampaignSchema } from "./campaign.validation";

const S = CampaignStatus;
const chunk = <T>(a: T[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) =>
    a.slice(i * n, i * n + n),
  );

export const campaignService = {
  async create(
    input: z.infer<typeof createCampaignSchema>,
    idempotencyKey?: string,
  ) {
    if (input.scheduledAt && input.scheduledAt.getTime() <= Date.now())
      throw new AppError(
        400,
        "scheduledAt must be in the future",
        "VALIDATION",
      );

    // Duplicate "create" requests with the same Idempotency-Key return the first campaign.

    const idemKey = idempotencyKey
      ? `idem:campaign:${input.organizationId}:${idempotencyKey}`
      : null;
    if (idemKey) {
      const first = await redis.set(idemKey, "pending", "EX", 86400, "NX");
      if (first !== "OK") {
        const existing = await redis.get(idemKey);
        if (existing && existing !== "pending")
          return {
            campaign: await repo.findById(existing),
            duplicate: true as const,
          };
        throw conflict(
          "A request with this Idempotency-Key is still being processed",
        );
      }
    }

    const recipients = [...new Set(input.recipients)];
    const campaign = await prisma.$transaction(
      async (tx) => {
        const c = await tx.campaign.create({
          data: {
            name: input.name,
            organizationId: input.organizationId,
            scheduledAt: input.scheduledAt,
            totalMessages: recipients.length,
          },
        });
        for (const part of chunk(recipients, 2000)) {
          await tx.campaignRecipient.createMany({
            data: part.map((phoneNumber) => ({
              campaignId: c.id,
              phoneNumber,
            })),
          });
          await tx.message.createMany({
            data: part.map((recipient) => ({
              campaignId: c.id,
              recipient,
              content: input.content,
            })),
          });
        }
        return c;
      },
      { timeout: 60000 },
    );
    if (idemKey) await redis.set(idemKey, campaign.id, "EX", 86400);
    await notificationService.record(
      campaign.organizationId,
      campaign.id,
      NotificationType.CAMPAIGN_CREATED,
      `Campaign "${campaign.name}" created with ${recipients.length} recipients.`,
    );

    let jobId: string | undefined;
    if (input.autoStart) jobId = (await this.dispatch(campaign.id)).jobId;
    return {
      campaign: await repo.findById(campaign.id),
      jobId,
      duplicate: false as const,
    };
  },

  // PENDING -> QUEUED and enqueue the campaign job (delayed if scheduledAt is in the future).
  async dispatch(id: string) {
    const c = await repo.findById(id);
    if (!c) throw notFound("Campaign");
    if (!(await repo.transition(id, [S.PENDING], S.QUEUED))) {
      // Duplicate start: idempotent if already started; a scheduled campaign is promoted to "now".
      if (c.status === S.QUEUED) {
        const job = await campaignQueue.getJob(campaignJobId(id, 0));
        if (job && (await job.isDelayed())) await job.promote();
        return { jobId: job?.id, alreadyStarted: true };
      }
      if ([S.PROCESSING, S.PAUSED].includes(c.status as any))
        return {
          jobId: campaignJobId(id, await currentEpoch(id)),
          alreadyStarted: true,
        };
      throw conflict(`Campaign is ${c.status} and cannot be started`);
    }
    const delayMs = c.scheduledAt ? c.scheduledAt.getTime() - Date.now() : 0;
    const job = await enqueueCampaign(id, c.organizationId, c.totalMessages, {
      delayMs,
    });
    if (delayMs > 0)
      await notificationService.record(
        c.organizationId,
        id,
        NotificationType.CAMPAIGN_SCHEDULED,
        `Campaign "${c.name}" scheduled for ${c.scheduledAt!.toISOString()}.`,
      );
    return { jobId: job.id, alreadyStarted: false };
  },

  async start(id: string) {
    const r = await this.dispatch(id);
    return { campaign: await repo.findById(id), ...r };
  },

  async pause(id: string) {
    const c = await repo.findById(id);
    if (!c) throw notFound("Campaign");
    if (c.status === S.PAUSED) return c;
    if (!(await repo.transition(id, [S.QUEUED, S.PROCESSING], S.PAUSED)))
      throw conflict(`Campaign is ${c.status} and cannot be paused`);
    // Campaign-scoped: only this campaign's jobs are touched; the shared queue is never paused.
    purgeCampaignJobs(id).catch((e) =>
      logger.error({ err: e, campaignId: id }, "purge failed"),
    );
    return repo.findById(id);
  },

  async resume(id: string) {
    const c = await repo.findById(id);
    if (!c) throw notFound("Campaign");
    if (c.status !== S.PAUSED)
      throw conflict(
        `Campaign is ${c.status}; only PAUSED campaigns can be resumed`,
      );
    const future = c.scheduledAt && c.scheduledAt.getTime() > Date.now();
    if (
      !(await repo.transition(id, [S.PAUSED], future ? S.QUEUED : S.PROCESSING))
    )
      throw conflict("Campaign state changed, retry");
    const epoch = await nextEpoch(id); // fresh job ids so previously skipped jobs can be re-added
    await enqueueCampaign(id, c.organizationId, c.totalMessages, {
      epoch,
      delayMs: future ? c.scheduledAt!.getTime() - Date.now() : 0,
    });
    return repo.findById(id);
  },

  async cancel(id: string) {
    const c = await repo.findById(id);
    if (!c) throw notFound("Campaign");
    if (c.status === S.CANCELLED) return c;
    if (
      !(await repo.transition(
        id,
        [S.PENDING, S.QUEUED, S.PROCESSING, S.PAUSED],
        S.CANCELLED,
      ))
    )
      throw conflict(`Campaign is ${c.status} and cannot be cancelled`);
    purgeCampaignJobs(id).catch((e) =>
      logger.error({ err: e, campaignId: id }, "purge failed"),
    );
    return repo.findById(id);
  },

  async get(id: string) {
    const c = await repo.findById(id);
    if (!c) throw notFound("Campaign");
    return { ...c, progress: await this.progress(id) };
  },

  async progress(id: string) {
    const c = await repo.findById(id);
    if (!c) throw notFound("Campaign");
    const counts = await repo.messageCounts(id);
    const done = counts.sent + counts.failed;
    return {
      campaignId: id,
      status: c.status,
      total: c.totalMessages,
      ...counts,
      percentComplete: c.totalMessages
        ? Math.round((done / c.totalMessages) * 1000) / 10
        : 0,
      scheduledAt: c.scheduledAt,
    };
  },

  list: repo.list,
};
