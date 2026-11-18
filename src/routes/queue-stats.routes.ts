import { Router } from 'express';
import type { Queue } from 'bullmq';
import { campaignQueue, messageQueue, notificationQueue } from '../queues';

export const queueRoutes = Router();

const stats = async (q: Queue) => ({
  name: q.name,
  paused: await q.isPaused(),
  counts: await q.getJobCounts(
    'waiting',
    'prioritized',
    'active',
    'delayed',
    'completed',
    'failed'
  ),
});

queueRoutes.get('/stats', async (_req, res) => {
  const queues = await Promise.all(
    [campaignQueue, messageQueue, notificationQueue].map(stats)
  );
  res.json({ timestamp: new Date().toISOString(), queues });
});
