import { z } from "zod";

export const idParamSchema = z.object({ id: z.string().uuid() });

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  orgId: z.string().trim().min(1).max(100).optional(), // optional; if sent it must equal the orgId in your token
  content: z.string().min(1).max(1600),
  recipients: z.array(z.string().trim().min(1).max(32)).min(1).max(100000),
  scheduledAt: z.coerce.date().optional(),
  autoStart: z.boolean().default(true), // false => stays PENDING until POST /:id/start
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const listCampaignsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "QUEUED", "PROCESSING", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
  search: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const listMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(["PENDING", "PROCESSING", "SENT", "FAILED"]).optional(),
});
