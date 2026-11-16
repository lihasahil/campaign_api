import { Router } from "express";
import { messageController } from "../controllers/message.controller";

export const messageRoutes = Router();
messageRoutes.get("/:id", messageController.get);
