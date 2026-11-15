import { prisma } from "../../../config/prisma";
import { messageJobId, currentEpoch } from "../../jobs/enqueue";
import { messageQueue } from "../../queues/message/message.queue";
import { notFound } from "../../../utils/errors";
import type { MessageStatus } from "../../../generated/prisma/client";

export const messageService = {
  async getAll(page: number, limit: number) {
    const [total, data] = await Promise.all([
      prisma.message.count(),

      prisma.message.findMany({
        orderBy: { id: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          campaignId: true,
          recipient: true,
          status: true,
          attempts: true,
          providerReference: true,
          sentAt: true,
        },
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async get(id: string) {
    const m = await prisma.message.findUnique({ where: { id } });
    if (!m) throw notFound("Message");
    // Queue-side view is informational only; PostgreSQL status is the source of truth.
    const job = await messageQueue.getJob(
      messageJobId(id, await currentEpoch(m.campaignId)),
    );
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

  // Paginated message list for one campaign (content omitted on purpose).
  async listForCampaign(
    campaignId: string,
    status: MessageStatus | undefined,
    page: number,
    limit: number,
  ) {
    const where = { campaignId, status };
    const [total, data] = await Promise.all([
      prisma.message.count({ where }),
      prisma.message.findMany({
        where,
        orderBy: { id: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          recipient: true,
          status: true,
          attempts: true,
          providerReference: true,
          sentAt: true,
        },
      }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },
};
