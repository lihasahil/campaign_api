import type { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { orgOf } from '../middleware/auth';
import { listNotificationsQuerySchema } from '../validators/notification.validator';

export const notificationController = {
  async list(req: Request, res: Response) {
    const q = listNotificationsQuerySchema.parse(req.query);
    res.json({
      data: await notificationService.list(orgOf(req), q.campaignId),
    });
  },
};
