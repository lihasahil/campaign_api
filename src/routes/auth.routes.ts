import { Router } from "express";
import { authController as c } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

export const authRoutes = Router();
authRoutes.post("/register", c.register); // public: creates an Organization (unique orgId) + returns a JWT
authRoutes.post("/login", c.login); // public
authRoutes.get("/me", requireAuth, c.me);
