import { CampaignStatus } from "../../generated/prisma/client";
import { campaignRepository } from "../repositories/campaign.repository";
import { messageRepository } from "../repositories/message.repository";
import { addNotificationJob } from "../queues/producer";
import { logger } from "../../utils/logger";

// Called after every terminal message (and at the end of expansion). When no message is
// PENDING/PROCESSING the campaign is finished. The guarded PROCESSING -> final update is atomic,
// so with N workers racing exactly one wins and enqueues the single notification job.
export async function maybeCompleteCampaign(
  campaignId: string,
): Promise<boolean> {
  const c = await messageRepository.countsByStatus(campaignId);
  if (c.pending + c.processing > 0) return false;
  const final = c.sent > 0 ? CampaignStatus.COMPLETED : CampaignStatus.FAILED;
  if (
    !(await campaignRepository.transition(
      campaignId,
      [CampaignStatus.PROCESSING],
      final,
    ))
  )
    return false;
  const camp = await campaignRepository.findById(campaignId);
  if (camp) await addNotificationJob(campaignId, camp.organizationId);
  logger.info({ campaignId, final, ...c }, "campaign reached terminal state");
  return true;
}
