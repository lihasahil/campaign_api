import { Router } from "express";
import { z } from "zod";
import { messageService } from "./message.service";

export const messageRoutes = Router();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

// GET /messages?page=1&limit=10
messageRoutes.get("/", async (req, res) => {
  const { page, limit } = paginationSchema.parse(req.query);

  res.json(await messageService.getAll(page, limit));
});

// GET /messages/:id
messageRoutes.get("/:id", async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

  res.json(await messageService.get(id));
});
