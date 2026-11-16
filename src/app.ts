import express from "express";
import swaggerUi from "swagger-ui-express";
import { apiRouter } from "./routes";
import { openApiSpec } from "./docs/openapi";
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
} from "./middleware/error";

export const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(requestLogger);

app.get("/health", (_req, res) => res.json({ status: "ok" }));
// API docs are public (no token needed to read them; "Try it out" calls still need one).
app.get("/api/docs.json", (_req, res) => res.json(openApiSpec));
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: "Campaign Engine API",
    swaggerOptions: { persistAuthorization: true },
  }),
);
app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
