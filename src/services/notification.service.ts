import { NotificationType } from "../../generated/prisma/client";
import { campaignRepository } from "../repositories/campaign.repository";
import { messageRepository } from "../repositories/message.repository";
import { notificationRepository } from "../repositories/notification.repository";
import { logger } from "../../utils/logger";

// Mock notification channel (stands in for email / webhook / Slack).
async function mockChannelSend(organizationId: string, message: string) {
  logger.info({ organizationId, channel: "mock-webhook", message }, "notification delivered");
}

export const notificationService = {
  async record(organizationId: string, campaignId: string, type: NotificationType, message: string) {
    const n = await notificationRepository.create({ organizationId, campaignId, type, message });
    await mockChannelSend(organizationId, message);
    return n;
  },

  // Idempotent: a re-run (duplicate / retried job) never creates a second summary.
  async createCampaignSummary(campaignId: string) {
    const campaign = await campaignRepository.findById(campaignId);
    if (!campaign) return null;
    const existing = await notificationRepository.findSummary(campaignId);
    if (existing) return existing;
    const c = await messageRepository.countsByStatus(campaignId);
    const type = campaign.status === "FAILED" ? NotificationType.CAMPAIGN_FAILED : NotificationType.CAMPAIGN_COMPLETED;
    const msg = `Campaign "${campaign.name}" ${campaign.status.toLowerCase()}: ${c.sent} sent, ${c.failed} failed of ${campaign.totalMessages}.`;
    return this.record(campaign.organizationId, campaignId, type, msg);
  },

  list: (organizationId?: string, campaignId?: string) => notificationRepository.list(organizationId, campaignId),
};
