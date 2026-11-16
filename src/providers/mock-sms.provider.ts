import { randomUUID } from "node:crypto";
import { redis } from "../../config/redis-client";
import { env } from "../../config/env";
import { PermanentProviderError, TransientProviderError } from "../../utils/errors";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mock SMS provider with idempotency-key support (like Twilio/MessageBird style APIs).
 * Calling it twice with the same key returns the original reference and does NOT "send" again.
 * That is what makes "provider sent, worker crashed before saving" safe to retry.
 *
 * Deterministic test hooks (by recipient suffix):
 *   ...9999  always fails (transient)           -> exhausts retries -> FAILED
 *   ...8888  fails the first 2 calls, then OK   -> proves retry + backoff
 *   ...7777  provider succeeds, then the "worker crashes" once -> proves idempotent recovery
 * Otherwise PROVIDER_FAILURE_RATE gives random transient failures.
 */
export async function sendSms(p: { idempotencyKey: string; to: string; body: string }): Promise<{ reference: string; deduplicated: boolean }> {
  const key = `mock-provider:sent:${p.idempotencyKey}`;
  const prior = await redis.get(key);
  if (prior) return { reference: prior, deduplicated: true };

  const work = (async () => {
    await sleep(env.PROVIDER_LATENCY_MS);
    const calls = await redis.incr(`mock-provider:calls:${p.idempotencyKey}`);
    if (p.to.endsWith("9999")) throw new TransientProviderError("provider 503");
    if (p.to.endsWith("8888") && calls <= 2) throw new TransientProviderError("provider 503 (flaky)");
    if (env.PROVIDER_FAILURE_RATE > 0 && Math.random() < env.PROVIDER_FAILURE_RATE) throw new TransientProviderError("provider 503 (random)");
    const reference = `mock_${randomUUID()}`;
    await redis.set(key, reference, "EX", 7 * 86400);
    if (p.to.endsWith("7777") && calls === 1) throw new TransientProviderError("simulated worker crash after provider accepted");
    return { reference, deduplicated: false };
  })();
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new TransientProviderError("provider timeout")), env.PROVIDER_TIMEOUT_MS));
  return Promise.race([work, timeout]);
}

export const PHONE_RE = /^\+?[1-9]\d{7,14}$/;
export function assertValidPhone(to: string) {
  if (!PHONE_RE.test(to)) throw new PermanentProviderError("invalid recipient format");
}
