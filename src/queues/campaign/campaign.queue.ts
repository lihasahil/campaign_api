import { Queue } from "bullmq";
import { redisConnection } from "../../../config/redis";
import { defaultJobOptions } from "../connection";
import type { CampaignJob } from "../../jobs/types";

export const CAMPAIGN_QUEUE = "campaign-queue";
export const campaignQueue = new Queue<CampaignJob>(CAMPAIGN_QUEUE, {
  connection: redisConnection,
  defaultJobOptions,
});
