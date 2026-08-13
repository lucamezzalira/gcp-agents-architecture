import { createRuntimeApp } from "./app.js";
import { listenForInstructions } from "./transport/instruction-subscriber.js";

const port = Number(process.env.PORT ?? "3001");
const runtime = createRuntimeApp();
await runtime.server.listen({ port, host: "0.0.0.0" });
runtime.server.log.info(`notification listening on ${port}`);

const subscription = process.env.SEND_INSTRUCTIONS_SUBSCRIPTION;
if (subscription !== undefined && subscription.length > 0) {
  listenForInstructions(subscription, runtime.handleInstruction);
  runtime.server.log.info(`subscribed to ${subscription}`);
}
