import { createRuntimeApp } from "./app.js";

const port = Number(process.env.PORT ?? "3002");
const server = createRuntimeApp();
await server.listen({ port, host: "0.0.0.0" });
server.log.info(`inventory listening on ${port}`);
