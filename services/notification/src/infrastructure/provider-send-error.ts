export class ProviderSendError extends Error {
  readonly attempts: number;
  readonly cause: unknown;

  constructor(attempts: number, cause: unknown) {
    super(`email provider failed after ${attempts} attempts`);
    this.name = "ProviderSendError";
    this.attempts = attempts;
    this.cause = cause;
  }
}
