import { createCampaignWorker } from "./campaign.worker";
import { createMessageWorker } from "./message.worker";
import { createNotificationWorker } from "./notification.worker";
import { campaignQueue } from "../queues/campaign/campaign.queue";
import { messageQueue } from "../queues/message/message.queue";
import { notificationQueue } from "../queues/notification/notification.queue";
import { prisma } from "../../config/prisma";
import { logger } from "../../utils/logger";

// Worker process entrypoint: `npm run worker`. Runs independently of the API process.
const workers = [
  createCampaignWorker(),
  createMessageWorker(),
  createNotificationWorker(),
];
logger.info("workers started: campaign, message, notification");

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, "graceful shutdown: letting active jobs finish");
  // close() stops taking new jobs and waits for in-flight ones. Anything unfinished is recovered via stalled-job handling.
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(
    [campaignQueue, messageQueue, notificationQueue].map((q) => q.close()),
  );
  await prisma.$disconnect();
  logger.info("shutdown complete");
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
