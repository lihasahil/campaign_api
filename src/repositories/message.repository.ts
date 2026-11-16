import { prisma } from "../../config/prisma";
import { MessageStatus } from "../../generated/prisma/client";

const S = MessageStatus;

export const messageRepository = {
  findById: (id: string) => prisma.message.findUnique({ where: { id } }),
  findForProcessing: (id: string) =>
    prisma.message.findUnique({
      where: { id },
      include: { campaign: { select: { status: true } } },
    }),

  // Next batch of unsent messages for the campaign worker (keyset pagination on id).
  pendingBatch: (campaignId: string, afterId: string, take: number) =>
    prisma.message.findMany({
      where: { campaignId, status: S.PENDING, id: { gt: afterId } },
      orderBy: { id: "asc" },
      take,
      select: { id: true, recipient: true, content: true },
    }),

  // Atomic claim. PROCESSING is claimable too: a crashed/stalled run leaves that state behind, and
  // re-sending is safe because of the provider idempotency key.
  async claim(id: string): Promise<boolean> {
    const r = await prisma.message.updateMany({
      where: { id, status: { in: [S.PENDING, S.PROCESSING] } },
      data: { status: S.PROCESSING, attempts: { increment: 1 } },
    });
    return r.count === 1;
  },
  markSent: (id: string, providerReference: string) =>
    prisma.message.update({
      where: { id },
      data: { status: S.SENT, providerReference, sentAt: new Date() },
    }),
  releaseForRetry: (id: string) =>
    prisma.message.updateMany({
      where: { id, status: S.PROCESSING },
      data: { status: S.PENDING },
    }),
  markFailed: (id: string) =>
    prisma.message.updateMany({
      where: { id, status: { in: [S.PENDING, S.PROCESSING] } },
      data: { status: S.FAILED },
    }),

  // GROUP BY on the source of truth, never incremented counters, so concurrent workers cannot overwrite each other.
  async countsByStatus(campaignId: string) {
    const rows = await prisma.message.groupBy({
      by: ["status"],
      where: { campaignId },
      _count: { _all: true },
    });
    const c = { pending: 0, processing: 0, sent: 0, failed: 0 };
    for (const r of rows) {
      if (r.status === S.PENDING) c.pending = r._count._all;
      if (r.status === S.PROCESSING) c.processing = r._count._all;
      if (r.status === S.SENT) c.sent = r._count._all;
      if (r.status === S.FAILED) c.failed = r._count._all;
    }
    return c;
  },

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
