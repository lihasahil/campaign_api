import pino from "pino";
import { env } from "../config/env";

// Never log message content. Phone numbers are masked via maskPhone().
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: [
    "content",
    "*.content",
    "recipient",
    "*.recipient",
    "phoneNumber",
    "*.phoneNumber",
  ],
});

export const maskPhone = (p: string) =>
  p.length <= 4 ? "****" : `${"*".repeat(p.length - 4)}${p.slice(-4)}`;
