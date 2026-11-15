import { prisma } from "../../../config/prisma";
import { CampaignStatus } from "../../../generated/prisma/client";
import { campaignRepository } from "../../repositiories/campaign.repository";
import { enqueueNotification } from "../../jobs/enqueue";
import { logger } from "../../../utils/logger";

// Called after every terminal message (and at the end of expansion). When no message is
// PENDING/PROCESSING the campaign is finished. The guarded PROCESSING -> final update is atomic,
// so with N workers racing exactly one wins and enqueues the single notification job.
export async function maybeCompleteCampaign(
  campaignId: string,
): Promise<boolean> {
  const c = await campaignRepository.messageCounts(campaignId);
  if (c.pending + c.processing > 0) return false;
  const final = c.sent > 0 ? CampaignStatus.COMPLETED : CampaignStatus.FAILED;
  const res = await prisma.campaign.updateMany({
    where: { id: campaignId, status: CampaignStatus.PROCESSING },
    data: { status: final },
  });
  if (res.count !== 1) return false;
  const camp = await campaignRepository.findById(campaignId);
  if (camp) await enqueueNotification(campaignId, camp.organizationId);
  logger.info({ campaignId, final, ...c }, "campaign reached terminal state");
  return true;
}
