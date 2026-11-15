import { app } from "./app";
import { config } from "../config";
import { campaignQueue } from "./queues/campaign/campaign.queue";
import { messageQueue } from "./queues/message/message.queue";
import { notificationQueue } from "./queues/notification/notification.queue";
import { prisma } from "../config/prisma";
import { logger } from "../utils/logger";

async function main() {
  const server = app.listen(config.port, () =>
    console.log(`Backend Server listening on http://localhost:${config.port}`),
  );

  // Graceful shutdown: stop accepting requests, then release queue/DB connections.
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "api shutting down");
    server.close();
    await Promise.all(
      [campaignQueue, messageQueue, notificationQueue].map((q) => q.close()),
    );
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
