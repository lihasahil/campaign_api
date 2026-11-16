import type { Queue } from "bullmq";
import { allQueues } from "../queues";

const stats = async (q: Queue) => ({
  name: q.name,
  paused: await q.isPaused(),
  counts: await q.getJobCounts("waiting", "prioritized", "active", "delayed", "completed", "failed"),
});

export const queueService = {
  async stats() {
    return { timestamp: new Date().toISOString(), queues: await Promise.all(allQueues.map(stats)) };
  },
};
