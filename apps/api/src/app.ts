import cors from "@fastify/cors";
import Fastify from "fastify";
import { config } from "./config.js";
import { z } from "zod";
import { answerMessage } from "./services/chat-service.js";

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: config.WEB_ORIGINS,
    methods: ["GET", "POST"],
  });

  app.get("/health", async () => {
    return { status: "ok" as const };
  });

  app.post("/chat", async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid request",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join(","),
          message: issue.message,
        })),
      });
    }

    try {
      const answer = await answerMessage(parsed.data.message);
      return { answer };
    } catch (error) {
      request.log.error({ err: error }, "OpenAI request failed");

      return reply.code(502).send({
        error: "The assistant could not answer right now",
      });
    }
  });

  return app;
}
