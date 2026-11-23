import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = buildApp();
let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  app.log.info({ signal }, "Shutting down");

  try {
    await app.close();
  } catch (error) {
    app.log.error({ err: error }, "Error while shutting down");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  const address = await app.listen({
    host: config.HOST,
    port: config.PORT,
  });
  app.log.info({ address }, "API server listening");
} catch (error) {
  app.log.error({ err: error }, "API server failed to start");
  process.exitCode = 1;
}
