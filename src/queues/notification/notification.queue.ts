import { Queue } from "bullmq";
import { redisConnection } from "../../../config/redis";
import { defaultJobOptions } from "../connection";
import type { NotificationJob } from "../../jobs/types";

export const NOTIFICATION_QUEUE = "notification-queue";
export const notificationQueue = new Queue<NotificationJob>(NOTIFICATION_QUEUE, { connection: redisConnection, defaultJobOptions });
