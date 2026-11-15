import {
  CampaignStatus,
  MessageStatus,
  Prisma,
} from "../../generated/prisma/client";
import { prisma } from "../../config/prisma";

export const campaignRepository = {
  findById: (id: string) => prisma.campaign.findUnique({ where: { id } }),

  // Atomic guarded state change: only succeeds if the row is still in one of the `from` states.
  async transition(
    id: string,
    from: CampaignStatus[],
    to: CampaignStatus,
  ): Promise<boolean> {
    const r = await prisma.campaign.updateMany({
      where: { id, status: { in: from } },
      data: { status: to },
    });
    return r.count === 1;
  },

  // Counts come from GROUP BY on the source of truth, never from incremented counters,
  // so concurrent workers cannot overwrite each other's progress.
  async messageCounts(campaignId: string) {
    const rows = await prisma.message.groupBy({
      by: ["status"],
      where: { campaignId },
      _count: { _all: true },
    });
    const counts = { pending: 0, processing: 0, sent: 0, failed: 0 };
    for (const r of rows) {
      if (r.status === MessageStatus.PENDING) counts.pending = r._count._all;
      if (r.status === MessageStatus.PROCESSING)
        counts.processing = r._count._all;
      if (r.status === MessageStatus.SENT) counts.sent = r._count._all;
      if (r.status === MessageStatus.FAILED) counts.failed = r._count._all;
    }
    return counts;
  },

  async list(f: {
    page: number;
    limit: number;
    status?: CampaignStatus;
    organizationId?: string;
    search?: string;
    from?: Date;
    to?: Date;
  }) {
    const where: Prisma.CampaignWhereInput = {
      status: f.status,
      organizationId: f.organizationId,
      name: f.search ? { contains: f.search, mode: "insensitive" } : undefined,
      createdAt: f.from || f.to ? { gte: f.from, lte: f.to } : undefined,
    };
    const [total, data] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (f.page - 1) * f.limit,
        take: f.limit,
      }),
    ]);
    return {
      data,
      meta: {
        page: f.page,
        limit: f.limit,
        total,
        totalPages: Math.ceil(total / f.limit),
      },
    };
  },
};
