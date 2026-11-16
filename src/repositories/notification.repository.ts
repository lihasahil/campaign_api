import { prisma } from "../../config/prisma";
import { NotificationType } from "../../generated/prisma/client";

export const notificationRepository = {
  create: (data: {
    organizationId: string;
    campaignId: string;
    type: NotificationType;
    message: string;
  }) => prisma.notification.create({ data }),
  findSummary: (campaignId: string) =>
    prisma.notification.findFirst({
      where: {
        campaignId,
        type: {
          in: [
            NotificationType.CAMPAIGN_COMPLETED,
            NotificationType.CAMPAIGN_FAILED,
          ],
        },
      },
    }),
  list: (organizationId?: string, campaignId?: string) =>
    prisma.notification.findMany({
      where: { organizationId, campaignId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
};
