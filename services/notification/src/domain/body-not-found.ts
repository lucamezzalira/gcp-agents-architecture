export class BodyNotFoundError extends Error {
  readonly bodyRef: string;

  constructor(bodyRef: string) {
    super(`body not found: ${bodyRef}`);
    this.name = "BodyNotFoundError";
    this.bodyRef = bodyRef;
  }
}
