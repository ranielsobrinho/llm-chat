import cors from "@fastify/cors";
import Fastify from "fastify";
import { config } from "./config.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: config.WEB_ORIGIN,
    methods: ["GET"],
  });

  app.get("/health", async () => {
    return { status: "ok" as const };
  });

  return app;
}
