import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
});
