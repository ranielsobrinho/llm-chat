import { Readable } from "node:stream";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import { streamConversation } from "./services/chat-service.js";
import {
  type ConversationMessage,
  type ConversationStore,
  hashSessionToken,
  MongoConversationStore,
} from "./services/conversation-store.js";

const encodeEvent = (event: unknown) => `${JSON.stringify(event)}\n`;
const sessionTokenSchema = z.string().uuid();
const conversationIdSchema = z.string().uuid();
const chatRequestSchema = z.object({
  conversationId: conversationIdSchema,
  message: z.string().trim().min(1).max(4000),
});

type ChatStream = (
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  signal: AbortSignal,
) =>
  | AsyncIterable<{ type: string; delta?: string }>
  | Promise<AsyncIterable<{ type: string; delta?: string }>>;

type AppDependencies = {
  store?: ConversationStore;
  stream?: ChatStream;
};

export function buildApp(dependencies: AppDependencies = {}) {
  const store =
    dependencies.store ?? new MongoConversationStore(config.MONGODB_URI, config.MONGODB_DB);
  const stream = dependencies.stream ?? streamConversation;
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", bodyLimit: 16 * 1024 });

  app.register(helmet);
  app.register(cors, {
    origin: config.WEB_ORIGINS,
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["content-type", "x-session-token"],
  });
  app.register(rateLimit, { max: 100, timeWindow: "15 minutes" });

  app.addHook("onReady", async () => {
    await store.connect?.();
  });
  app.addHook("onClose", async () => {
    await store.close?.();
  });

  function getOwnerHash(request: { headers: Record<string, string | string[] | undefined> }) {
    const parsed = sessionTokenSchema.safeParse(request.headers["x-session-token"]);
    return parsed.success ? hashSessionToken(parsed.data) : null;
  }

  app.register(async (routes) => {
    routes.get("/health", async () => ({ status: "ok" as const }));

    routes.get("/conversations", async (request, reply) => {
      const ownerHash = getOwnerHash(request);
      if (!ownerHash) return reply.code(401).send({ error: "A valid session token is required" });
      return store.list(ownerHash);
    });

    routes.post("/conversations", async (request, reply) => {
      const ownerHash = getOwnerHash(request);
      if (!ownerHash) return reply.code(401).send({ error: "A valid session token is required" });
      return reply.code(201).send(await store.create(ownerHash));
    });

    routes.get<{ Params: { id: string } }>("/conversations/:id", async (request, reply) => {
      const ownerHash = getOwnerHash(request);
      const id = conversationIdSchema.safeParse(request.params.id);
      if (!ownerHash) return reply.code(401).send({ error: "A valid session token is required" });
      if (!id.success) return reply.code(400).send({ error: "Invalid conversation ID" });

      const conversation = await store.get(ownerHash, id.data);
      if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
      return conversation;
    });

    routes.delete<{ Params: { id: string } }>("/conversations/:id", async (request, reply) => {
      const ownerHash = getOwnerHash(request);
      const id = conversationIdSchema.safeParse(request.params.id);
      if (!ownerHash) return reply.code(401).send({ error: "A valid session token is required" });
      if (!id.success) return reply.code(400).send({ error: "Invalid conversation ID" });

      const deleted = await store.delete(ownerHash, id.data);
      if (!deleted) return reply.code(404).send({ error: "Conversation not found" });
      return reply.code(204).send();
    });

    routes.post(
      "/chat",
      {
        config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      },
      async (request, reply) => {
        const ownerHash = getOwnerHash(request);
        const parsed = chatRequestSchema.safeParse(request.body);

        if (!ownerHash) return reply.code(401).send({ error: "A valid session token is required" });
        if (!parsed.success) return reply.code(400).send({ error: "Invalid request" });

        const conversation = await store.get(ownerHash, parsed.data.conversationId);
        if (!conversation) return reply.code(404).send({ error: "Conversation not found" });

        const userMessage: ConversationMessage = {
          role: "user",
          content: parsed.data.message,
          createdAt: new Date(),
        };
        const messages = [...conversation.messages.slice(-39), userMessage].map(
          ({ role, content }) => ({ role, content }),
        );
        await store.append(ownerHash, conversation.id, userMessage);

        const controller = new AbortController();
        reply.raw.once("close", () => {
          if (!reply.raw.writableFinished) controller.abort();
        });

        try {
          const upstream = await stream(messages, controller.signal);
          const output = Readable.from(
            (async function* () {
              let assistantText = "";
              try {
                for await (const event of upstream) {
                  if (event.type === "response.output_text.delta" && event.delta) {
                    assistantText += event.delta;
                    yield encodeEvent({ type: "delta", text: event.delta });
                  } else if (event.type === "response.failed" || event.type === "error") {
                    throw new Error("OpenAI stream failed");
                  }
                }

                if (assistantText) {
                  await store.append(ownerHash, conversation.id, {
                    role: "assistant",
                    content: assistantText,
                    createdAt: new Date(),
                  });
                }
                yield encodeEvent({ type: "done" });
              } catch (error) {
                if (controller.signal.aborted) return;
                request.log.error({ err: error }, "Chat stream failed");
                yield encodeEvent({
                  type: "error",
                  message: "The assistant could not answer right now",
                });
              }
            })(),
          );

          return reply
            .type("application/x-ndjson; charset=utf-8")
            .header("Cache-Control", "no-cache, no-transform")
            .header("X-Accel-Buffering", "no")
            .send(output);
        } catch (error) {
          if (controller.signal.aborted) return;
          request.log.error({ err: error }, "Chat stream failed to start");
          return reply.code(502).send({ error: "The assistant could not answer right now" });
        }
      },
    );
  });

  return app;
}
