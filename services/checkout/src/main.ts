import { startTracing } from "@observability/runtime";

await startTracing("checkout");
const { createRuntimeApp } = await import("./app.js");

const port = Number(process.env.PORT ?? "3000");
const server = createRuntimeApp();
await server.listen({ port, host: "0.0.0.0" });
server.log.info(`checkout listening on ${port}`);
