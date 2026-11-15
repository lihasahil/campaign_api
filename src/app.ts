import express from "express";
import { campaignRoutes } from "./modules/campaign/campaign.routes";
import { queueRoutes } from "./modules/campaign/queue-stats.routes";
import { messageRoutes } from "./modules/message/message.routes";
import { notificationRoutes } from "./modules/notification/notification.routes";
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
} from "./middleware/error";

export const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(requestLogger);

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/campaigns", campaignRoutes);
app.use("/api/queues", queueRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
