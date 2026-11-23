import cors from "@fastify/cors";
import Fastify from "fastify";
import { Readable } from "node:stream";
import { z } from "zod";
import { config } from "./config.js";
import { streamAnswer } from "./services/chat-service.js";

const encodeEvent = (event: unknown) => `${JSON.stringify(event)}\n`;

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
      });
    }

    const controller = new AbortController();

    reply.raw.once("close", () => {
      if (!reply.raw.writableFinished) {
        controller.abort();
      }
    });

    try {
      const upstream = await streamAnswer(
        parsed.data.message,
        controller.signal,
      );

      const output = Readable.from(
        (async function* () {
          try {
            for await (const event of upstream) {
              if (event.type === "response.output_text.delta") {
                yield encodeEvent({ type: "delta", text: event.delta });
              } else if (
                event.type === "response.failed" ||
                event.type === "error"
              ) {
                throw new Error("OpenAI stream failed");
              }
            }

            yield encodeEvent({ type: "done" });
          } catch (error) {
            if (controller.signal.aborted) return;

            request.log.error({ err: error }, "OpenAI stream failed");
            yield encodeEvent({
              type: "error",
              message: "The assistant could not answer right now",
            });
          }
        })(),
      );

      return reply
        .type("application/x-ndjson; charset=utf-8")
        .header("Cache_control", "no-cache, no-transform")
        .header("X-Accel-Buffering", "no")
        .send(output);
    } catch (error) {
      if (controller.signal.aborted) return;

      request.log.error({ err: error }, "OpenAI stream failed to start");

      return reply.code(502).send({
        error: "The assistant could not answer right now",
      });
    }
  });

  return app;
}
