import { startTracing } from "@observability/runtime";

await startTracing("audit");
const { createRuntimeApp } = await import("./app.js");

const port = Number(process.env.PORT ?? "3003");
const server = createRuntimeApp();
await server.listen({ port, host: "0.0.0.0" });
server.log.info(`audit listening on ${port}`);
