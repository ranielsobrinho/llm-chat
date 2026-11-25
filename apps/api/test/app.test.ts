import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import {
  type Conversation,
  type ConversationMessage,
  type ConversationStore,
  hashSessionToken,
} from "../src/services/conversation-store.js";

const token = randomUUID();
const ownerHeader = { "x-session-token": token };

class MemoryConversationStore implements ConversationStore {
  conversations = new Map<string, Conversation>();

  async create(ownerHash: string) {
    const now = new Date();
    const conversation: Conversation = {
      id: randomUUID(),
      ownerHash,
      title: "New chat",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  async list(ownerHash: string) {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.ownerHash === ownerHash)
      .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }));
  }

  async get(ownerHash: string, id: string) {
    const conversation = this.conversations.get(id);
    return conversation?.ownerHash === ownerHash ? conversation : null;
  }

  async append(ownerHash: string, id: string, message: ConversationMessage) {
    const conversation = await this.get(ownerHash, id);
    if (!conversation) return false;
    conversation.messages.push(message);
    conversation.updatedAt = message.createdAt;
    if (message.role === "user") conversation.title = message.content.slice(0, 72);
    return true;
  }

  async delete(ownerHash: string, id: string) {
    if (!(await this.get(ownerHash, id))) return false;
    return this.conversations.delete(id);
  }
}

describe("conversation API", () => {
  let store: MemoryConversationStore;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    store = new MemoryConversationStore();
    app = buildApp({ store });
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires a valid anonymous session token", async () => {
    const response = await app.inject({ method: "GET", url: "/conversations" });
    expect(response.statusCode).toBe(401);
  });

  it("creates, lists, and loads a conversation only for its owner", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: ownerHeader,
      payload: {},
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<{ id: string }>();

    const listed = await app.inject({ method: "GET", url: "/conversations", headers: ownerHeader });
    expect(listed.json()).toHaveLength(1);

    const anotherOwner = await app.inject({
      method: "GET",
      url: `/conversations/${id}`,
      headers: { "x-session-token": randomUUID() },
    });
    expect(anotherOwner.statusCode).toBe(404);
  });

  it("rejects empty and oversized chat messages", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: ownerHeader,
      payload: {},
    });
    const { id } = created.json<{ id: string }>();

    const empty = await app.inject({
      method: "POST",
      url: "/chat",
      headers: ownerHeader,
      payload: { conversationId: id, message: "   " },
    });
    const oversized = await app.inject({
      method: "POST",
      url: "/chat",
      headers: ownerHeader,
      payload: { conversationId: id, message: "x".repeat(4001) },
    });
    expect(empty.statusCode).toBe(400);
    expect(oversized.statusCode).toBe(400);
  });

  it("persists both sides of a streamed chat and reuses conversation context", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: ownerHeader,
      payload: {},
    });
    const { id } = created.json<{ id: string }>();
    const stream = vi.fn(async function* (
      messages: Array<{ role: "user" | "assistant"; content: string }>,
    ) {
      const content = messages.map((message) => message.content);
      if (content.length === 1) {
        expect(content).toEqual(["Hello"]);
        yield { type: "response.output_text.delta", delta: "Hi" };
        yield { type: "response.output_text.delta", delta: " there" };
      } else {
        expect(content).toEqual(["Hello", "Hi there", "How are you?"]);
        yield { type: "response.output_text.delta", delta: "Great" };
      }
    });
    await app.close();
    app = buildApp({ store, stream });

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      headers: ownerHeader,
      payload: { conversationId: id, message: "Hello" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('{"type":"delta","text":"Hi"}');
    expect(response.body).toContain('{"type":"done"}');

    const followUp = await app.inject({
      method: "POST",
      url: "/chat",
      headers: ownerHeader,
      payload: { conversationId: id, message: "How are you?" },
    });
    expect(followUp.statusCode).toBe(200);
    expect(stream).toHaveBeenCalledTimes(2);

    expect((await store.get(hashSessionToken(token), id))?.messages).toMatchObject([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
      { role: "user", content: "How are you?" },
      { role: "assistant", content: "Great" },
    ]);
  });

  it("does not let a different session delete a conversation", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: ownerHeader,
      payload: {},
    });
    const { id } = created.json<{ id: string }>();
    const response = await app.inject({
      method: "DELETE",
      url: `/conversations/${id}`,
      headers: { "x-session-token": randomUUID() },
    });
    expect(response.statusCode).toBe(404);
  });

  it("rate limits chat requests per client IP", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: ownerHeader,
      payload: {},
    });
    const { id } = created.json<{ id: string }>();
    await app.close();
    app = buildApp({
      store,
      stream: async function* () {
        yield { type: "response.output_text.delta", delta: "ok" };
      },
    });

    const responses = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(
        await app.inject({
          method: "POST",
          url: "/chat",
          headers: ownerHeader,
          payload: { conversationId: id, message: `Message ${attempt}` },
        }),
      );
    }

    expect(responses.slice(0, 10).every((response) => response.statusCode === 200)).toBe(true);
    expect(
      responses[10].statusCode,
      JSON.stringify(responses.map((response) => response.headers)),
    ).toBe(429);
  });
});
