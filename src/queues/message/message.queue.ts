import { Queue } from "bullmq";
import { redisConnection } from "../../../config/redis";
import { defaultJobOptions } from "../connection";
import type { MessageJob } from "../../jobs/types";

export const MESSAGE_QUEUE = "message-queue";
export const messageQueue = new Queue<MessageJob>(MESSAGE_QUEUE, {
  connection: redisConnection,
  defaultJobOptions,
});
