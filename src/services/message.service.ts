import { messageRepository } from '../repositories/message.repository';
import { campaignRepository } from '../repositories/campaign.repository';
import { currentEpoch, getMessageJob } from '../queues/producer';
import { notFound } from '../../utils/errors';
import type { MessageStatus } from '../../generated/prisma/client';

export const messageService = {
  async get(orgId: string, id: string) {
    const m = await messageRepository.findById(id);
    const campaign = m ? await campaignRepository.findById(m.campaignId) : null;
    if (!m || campaign?.organizationId !== orgId) throw notFound('Message');
    // Queue-side view is informational only; PostgreSQL status is the source of truth.
    const job = await getMessageJob(id, await currentEpoch(m.campaignId));
    return {
      ...m,
      queueJob: job
        ? {
            id: job.id,
            state: await job.getState(),
            attemptsMade: job.attemptsMade,
            failedReason: job.failedReason ?? null,
          }
        : null,
    };
  },
  listForCampaign: (
    campaignId: string,
    status: MessageStatus | undefined,
    page: number,
    limit: number
  ) => messageRepository.listForCampaign(campaignId, status, page, limit),
};
