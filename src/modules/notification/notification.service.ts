import { prisma } from "../../../config/prisma";
import { NotificationType } from "../../../generated/prisma/client";
import { campaignRepository } from "../../repositiories/campaign.repository";
import { logger } from "../../../utils/logger";

// Mock notification channel (stands in for email / webhook / Slack).
async function mockChannelSend(organizationId: string, message: string) {
  logger.info({ organizationId, channel: "mock-webhook", message }, "notification delivered");
}

export const notificationService = {
  async record(organizationId: string, campaignId: string, type: NotificationType, message: string) {
    const n = await prisma.notification.create({ data: { organizationId, campaignId, type, message } });
    await mockChannelSend(organizationId, message);
    return n;
  },

  // Idempotent: a re-run (duplicate / retried job) never creates a second summary.
  async createCampaignSummary(campaignId: string) {
    const campaign = await campaignRepository.findById(campaignId);
    if (!campaign) return null;
    const existing = await prisma.notification.findFirst({
      where: { campaignId, type: { in: [NotificationType.CAMPAIGN_COMPLETED, NotificationType.CAMPAIGN_FAILED] } },
    });
    if (existing) return existing;
    const c = await campaignRepository.messageCounts(campaignId);
    const type = campaign.status === "FAILED" ? NotificationType.CAMPAIGN_FAILED : NotificationType.CAMPAIGN_COMPLETED;
    const msg = `Campaign "${campaign.name}" ${campaign.status.toLowerCase()}: ${c.sent} sent, ${c.failed} failed of ${campaign.totalMessages}.`;
    return this.record(campaign.organizationId, campaignId, type, msg);
  },

  list: (organizationId: string | undefined, campaignId?: string) =>
    prisma.notification.findMany({ where: { organizationId, campaignId }, orderBy: { createdAt: "desc" }, take: 100 }),
};
