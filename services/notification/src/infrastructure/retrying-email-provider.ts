import type { EmailMessage, EmailProvider } from "../domain/ports/email-provider.js";
import { ProviderSendError } from "./provider-send-error.js";
import {
  delayForAttempt,
  type RetryPolicy,
} from "./retry-policy.js";

export type WaitFn = (ms: number) => Promise<void>;

export type RetryingEmailProviderOptions = {
  policy: RetryPolicy;
  wait?: WaitFn;
  recordAttempt?: (outcome: "delivered" | "failed", attempts: number) => void;
};

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class RetryingEmailProvider implements EmailProvider {
  private readonly inner: EmailProvider;
  private readonly policy: RetryPolicy;
  private readonly wait: WaitFn;
  private readonly recordAttempt:
    | ((outcome: "delivered" | "failed", attempts: number) => void)
    | undefined;

  constructor(inner: EmailProvider, options: RetryingEmailProviderOptions) {
    this.inner = inner;
    this.policy = options.policy;
    this.wait = options.wait ?? defaultWait;
    this.recordAttempt = options.recordAttempt;
  }

  async send(message: EmailMessage): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.policy.maxAttempts; attempt += 1) {
      try {
        await this.inner.send(message);
        this.recordAttempt?.("delivered", attempt);
        return;
      } catch (error: unknown) {
        lastError = error;
        if (attempt === this.policy.maxAttempts) {
          break;
        }
        await this.wait(delayForAttempt(this.policy, attempt));
      }
    }
    this.recordAttempt?.("failed", this.policy.maxAttempts);
    throw new ProviderSendError(this.policy.maxAttempts, lastError);
  }
}
