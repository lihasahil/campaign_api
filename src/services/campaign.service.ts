import { CampaignStatus, NotificationType } from "../../generated/prisma/client";
import { campaignRepository as repo } from "../repositories/campaign.repository";
import { messageRepository } from "../repositories/message.repository";
import { addCampaignJob, campaignJobId, currentEpoch, nextEpoch, promoteCampaignJob, purgeCampaignJobs } from "../queues/producer";
import { redis } from "../../config/redis-client";
import { notificationService } from "./notification.service";
import { AppError, conflict, notFound } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { CreateCampaignInput } from "../validators/campaign.validator";

const S = CampaignStatus;

// Tenant guard: another organization's campaign is reported as "not found" (existence is never leaked).
async function owned(id: string, orgId: string) {
  const c = await repo.findById(id);
  if (!c || c.organizationId !== orgId) throw notFound("Campaign");
  return c;
}

export const campaignService = {
  async create(orgId: string, input: CreateCampaignInput, idempotencyKey?: string) {
    if (input.orgId && input.orgId !== orgId) throw new AppError(403, "orgId does not match the authenticated organization", "FORBIDDEN");
    if (input.scheduledAt && input.scheduledAt.getTime() <= Date.now()) throw new AppError(400, "scheduledAt must be in the future", "VALIDATION");

    // Duplicate "create" requests with the same Idempotency-Key return the first campaign.
    const idemKey = idempotencyKey ? `idem:campaign:${orgId}:${idempotencyKey}` : null;
    if (idemKey) {
      const first = await redis.set(idemKey, "pending", "EX", 86400, "NX");
      if (first !== "OK") {
        const existing = await redis.get(idemKey);
        if (existing && existing !== "pending") return { campaign: await repo.findById(existing), duplicate: true as const };
        throw conflict("A request with this Idempotency-Key is still being processed");
      }
    }

    const recipients = [...new Set(input.recipients)];
    const campaign = await repo.createWithRecipients({ name: input.name, organizationId: orgId, scheduledAt: input.scheduledAt, content: input.content, recipients });
    if (idemKey) await redis.set(idemKey, campaign.id, "EX", 86400);
    await notificationService.record(campaign.organizationId, campaign.id, NotificationType.CAMPAIGN_CREATED, `Campaign "${campaign.name}" created with ${recipients.length} recipients.`);

    let jobId: string | undefined;
    if (input.autoStart) jobId = (await this.dispatch(campaign.id)).jobId;
    return { campaign: await repo.findById(campaign.id), jobId, duplicate: false as const };
  },

  // PENDING -> QUEUED and enqueue the campaign job (delayed if scheduledAt is in the future).
  async dispatch(id: string) {
    const c = await repo.findById(id);
    if (!c) throw notFound("Campaign");
    if (!(await repo.transition(id, [S.PENDING], S.QUEUED))) {
      // Duplicate start: idempotent if already started; a scheduled campaign is promoted to "now".
      if (c.status === S.QUEUED) return { jobId: (await promoteCampaignJob(id)) ?? campaignJobId(id, 0), alreadyStarted: true };
      if (c.status === S.PROCESSING || c.status === S.PAUSED) return { jobId: campaignJobId(id, await currentEpoch(id)), alreadyStarted: true };
      throw conflict(`Campaign is ${c.status} and cannot be started`);
    }
    const delayMs = c.scheduledAt ? c.scheduledAt.getTime() - Date.now() : 0;
    const job = await addCampaignJob(id, c.organizationId, c.totalMessages, { delayMs });
    if (delayMs > 0) await notificationService.record(c.organizationId, id, NotificationType.CAMPAIGN_SCHEDULED, `Campaign "${c.name}" scheduled for ${c.scheduledAt!.toISOString()}.`);
    return { jobId: job.id, alreadyStarted: false };
  },

  async start(orgId: string, id: string) {
    await owned(id, orgId);
    const r = await this.dispatch(id);
    return { campaign: await repo.findById(id), ...r };
  },

  async pause(orgId: string, id: string) {
    await owned(id, orgId);
    const c = await repo.findById(id);
    if (!c) throw notFound("Campaign");
    if (c.status === S.PAUSED) return c;
    if (!(await repo.transition(id, [S.QUEUED, S.PROCESSING], S.PAUSED))) throw conflict(`Campaign is ${c.status} and cannot be paused`);
    // Campaign-scoped: only this campaign's jobs are touched; the shared queue is never paused.
    purgeCampaignJobs(id).catch((e) => logger.error({ err: e, campaignId: id }, "purge failed"));
    return repo.findById(id);
  },

  async resume(orgId: string, id: string) {
    await owned(id, orgId);
    const c = await repo.findById(id);
    if (!c) throw notFound("Campaign");
    if (c.status !== S.PAUSED) throw conflict(`Campaign is ${c.status}; only PAUSED campaigns can be resumed`);
    const future = !!c.scheduledAt && c.scheduledAt.getTime() > Date.now();
    if (!(await repo.transition(id, [S.PAUSED], future ? S.QUEUED : S.PROCESSING))) throw conflict("Campaign state changed, retry");
    const epoch = await nextEpoch(id); // fresh job ids so previously skipped jobs can be re-added
    await addCampaignJob(id, c.organizationId, c.totalMessages, { epoch, delayMs: future ? c.scheduledAt!.getTime() - Date.now() : 0 });
    return repo.findById(id);
  },

  async cancel(orgId: string, id: string) {
    await owned(id, orgId);
    const c = await repo.findById(id);
    if (!c) throw notFound("Campaign");
    if (c.status === S.CANCELLED) return c;
    if (!(await repo.transition(id, [S.PENDING, S.QUEUED, S.PROCESSING, S.PAUSED], S.CANCELLED))) throw conflict(`Campaign is ${c.status} and cannot be cancelled`);
    purgeCampaignJobs(id).catch((e) => logger.error({ err: e, campaignId: id }, "purge failed"));
    return repo.findById(id);
  },

  async get(orgId: string, id: string) {
    await owned(id, orgId);
    const c = await repo.findById(id);
    if (!c) throw notFound("Campaign");
    return { ...c, progress: await this.progress(orgId, id) };
  },

  async progress(orgId: string, id: string) {
    await owned(id, orgId);
    const c = await repo.findById(id);
    if (!c) throw notFound("Campaign");
    const counts = await messageRepository.countsByStatus(id);
    const done = counts.sent + counts.failed;
    return {
      campaignId: id,
      status: c.status,
      total: c.totalMessages,
      ...counts,
      percentComplete: c.totalMessages ? Math.round((done / c.totalMessages) * 1000) / 10 : 0,
      scheduledAt: c.scheduledAt,
    };
  },

  list: (orgId: string, f: Omit<Parameters<typeof repo.list>[0], "organizationId">) => repo.list({ ...f, organizationId: orgId }),
  assertOwned: owned,
};
