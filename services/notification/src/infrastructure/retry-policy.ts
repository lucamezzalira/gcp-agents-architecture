import { z } from "zod";

export type RetryPolicy = {
  maxAttempts: number;
  initialDelayMs: number;
  factor: number;
  maxDelayMs: number;
};

export const DEFAULT_EMAIL_RETRY_MAX_ATTEMPTS = 3;
export const DEFAULT_EMAIL_RETRY_INITIAL_DELAY_MS = 100;
export const DEFAULT_EMAIL_RETRY_FACTOR = 2;
export const DEFAULT_EMAIL_RETRY_MAX_DELAY_MS = 2000;

const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1),
  initialDelayMs: z.number().min(0),
  factor: z.number().min(1),
  maxDelayMs: z.number().min(0),
});

function readNumber(
  env: Record<string, string | undefined>,
  key: string,
  fallback: number,
): number {
  const raw = env[key];
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }
  return Number(raw);
}

export function retryPolicyFromEnv(
  env: Record<string, string | undefined> = process.env,
): RetryPolicy {
  return retryPolicySchema.parse({
    maxAttempts: readNumber(
      env,
      "EMAIL_RETRY_MAX_ATTEMPTS",
      DEFAULT_EMAIL_RETRY_MAX_ATTEMPTS,
    ),
    initialDelayMs: readNumber(
      env,
      "EMAIL_RETRY_INITIAL_DELAY_MS",
      DEFAULT_EMAIL_RETRY_INITIAL_DELAY_MS,
    ),
    factor: readNumber(env, "EMAIL_RETRY_FACTOR", DEFAULT_EMAIL_RETRY_FACTOR),
    maxDelayMs: readNumber(
      env,
      "EMAIL_RETRY_MAX_DELAY_MS",
      DEFAULT_EMAIL_RETRY_MAX_DELAY_MS,
    ),
  });
}

export function delayForAttempt(policy: RetryPolicy, failedAttempts: number): number {
  const delay = policy.initialDelayMs * policy.factor ** (failedAttempts - 1);
  return Math.min(delay, policy.maxDelayMs);
}
