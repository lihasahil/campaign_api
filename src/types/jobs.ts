export interface MessageJob {
  campaignId: string;
  messageId: string;
  recipient: string;
  content: string;
  organizationId: string;
}
export interface CampaignJob {
  campaignId: string;
  organizationId: string;
  epoch: number;
}
export interface NotificationJob {
  campaignId: string;
  organizationId: string;
}
