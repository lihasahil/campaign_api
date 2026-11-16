import { prisma } from '../../config/prisma';
import { CampaignStatus, Prisma } from '../../generated/prisma/client';

const chunk = <T>(a: T[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) =>
    a.slice(i * n, i * n + n)
  );

export const campaignRepository = {
  findById: (id: string) => prisma.campaign.findUnique({ where: { id } }),

  // Campaign + recipients + one PENDING message per recipient, in a single transaction.
  createWithRecipients(d: {
    name: string;
    organizationId: string;
    scheduledAt?: Date;
    content: string;
    recipients: string[];
  }) {
    return prisma.$transaction(
      async tx => {
        const c = await tx.campaign.create({
          data: {
            name: d.name,
            organizationId: d.organizationId,
            scheduledAt: d.scheduledAt,
            totalMessages: d.recipients.length,
          },
        });
        for (const part of chunk(d.recipients, 2000)) {
          await tx.campaignRecipient.createMany({
            data: part.map(phoneNumber => ({
              campaignId: c.id,
              phoneNumber,
            })),
          });
          await tx.message.createMany({
            data: part.map(recipient => ({
              campaignId: c.id,
              recipient,
              content: d.content,
            })),
          });
        }
        return c;
      },
      { timeout: 60000 }
    );
  },

  // Atomic guarded state change: only succeeds if the row is still in one of the `from` states.
  async transition(
    id: string,
    from: CampaignStatus[],
    to: CampaignStatus
  ): Promise<boolean> {
    const r = await prisma.campaign.updateMany({
      where: { id, status: { in: from } },
      data: { status: to },
    });
    return r.count === 1;
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
      name: f.search ? { contains: f.search, mode: 'insensitive' } : undefined,
      createdAt: f.from || f.to ? { gte: f.from, lte: f.to } : undefined,
    };
    const [total, data] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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
