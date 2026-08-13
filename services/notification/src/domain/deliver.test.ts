import { describe, expect, it } from "vitest";
import { InMemoryBodyStore } from "../infrastructure/in-memory-body-store.js";
import { InMemoryDeliveryStore } from "../infrastructure/in-memory-delivery-store.js";
import { InMemoryEmailProvider } from "../infrastructure/in-memory-email-provider.js";
import { BodyNotFoundError } from "./body-not-found.js";
import { deliver } from "./deliver.js";
import type { EmailMessage, EmailProvider } from "./email-provider.js";
import { silentLogger } from "./logger.js";
import type { SendInstruction } from "./send-instruction.js";

const instruction: SendInstruction = {
  messageId: "msg-1",
  to: "buyer@example.com",
  subject: "Your order",
  bodyRef: "bodies/order-1.html",
};

const storedBody = "<p>ships within 48 hours</p>";

class SlowEmailProvider implements EmailProvider {
  readonly calls: EmailMessage[] = [];
  private readonly waitMs: number;

  constructor(waitMs: number) {
    this.waitMs = waitMs;
  }

  async send(message: EmailMessage): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.waitMs));
    this.calls.push(message);
  }
}

function setup(): {
  bodyStore: InMemoryBodyStore;
  deliveryStore: InMemoryDeliveryStore;
  emailProvider: InMemoryEmailProvider;
  logger: ReturnType<typeof silentLogger>;
} {
  return {
    bodyStore: new InMemoryBodyStore(),
    deliveryStore: new InMemoryDeliveryStore(),
    emailProvider: new InMemoryEmailProvider(),
    logger: silentLogger(),
  };
}

describe("deliver", () => {
  it("sends exactly once for a valid instruction", async () => {
    const deps = setup();
    deps.bodyStore.put(instruction.bodyRef, storedBody);

    const result = await deliver(instruction, deps);

    expect(result).toEqual({ status: "sent" });
    expect(deps.emailProvider.calls).toHaveLength(1);
    expect(deps.emailProvider.calls[0]).toEqual({
      to: instruction.to,
      subject: instruction.subject,
      html: storedBody,
    });
  });

  it("does not call the provider again for the same messageId", async () => {
    const deps = setup();
    deps.bodyStore.put(instruction.bodyRef, storedBody);

    await deliver(instruction, deps);
    const second = await deliver(instruction, deps);

    expect(second).toEqual({ status: "duplicate" });
    expect(deps.emailProvider.calls).toHaveLength(1);
  });

  it("claims before send so overlapping deliveries only send once", async () => {
    const bodyStore = new InMemoryBodyStore();
    const deliveryStore = new InMemoryDeliveryStore();
    const emailProvider = new SlowEmailProvider(30);
    bodyStore.put(instruction.bodyRef, storedBody);

    const logger = silentLogger();
    const [first, second] = await Promise.all([
      deliver(instruction, { bodyStore, deliveryStore, emailProvider, logger }),
      deliver(instruction, { bodyStore, deliveryStore, emailProvider, logger }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["duplicate", "sent"]);
    expect(emailProvider.calls).toHaveLength(1);
  });

  it("fails without claiming when the body is missing", async () => {
    const deps = setup();

    await expect(deliver(instruction, deps)).rejects.toBeInstanceOf(
      BodyNotFoundError,
    );
    expect(deps.emailProvider.calls).toHaveLength(0);
    expect(deps.deliveryStore.hasClaimed(instruction.messageId)).toBe(false);
  });
});
