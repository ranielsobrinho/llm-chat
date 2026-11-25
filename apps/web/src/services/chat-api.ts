const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000";
const SESSION_KEY = "rangpt-session-token";

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredMessage = { role: "assistant" | "user"; content: string };

export type StoredConversation = ConversationSummary & { messages: StoredMessage[] };

function sessionToken() {
  let token = window.localStorage.getItem(SESSION_KEY);
  if (!token) {
    token = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, token);
  }
  return token;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Session-Token": sessionToken(),
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function listConversations() {
  return apiRequest<ConversationSummary[]>("/conversations");
}

export function createConversation() {
  return apiRequest<StoredConversation>("/conversations", { method: "POST", body: "{}" });
}

export function getConversation(id: string) {
  return apiRequest<StoredConversation>(`/conversations/${id}`);
}

export function deleteConversation(id: string) {
  return apiRequest<void>(`/conversations/${id}`, { method: "DELETE" });
}

function readEventLine(line: string, onDelta: (text: string) => void): boolean {
  const event: unknown = JSON.parse(line);

  if (
    typeof event !== "object" ||
    event === null ||
    !("type" in event) ||
    typeof event.type !== "string"
  ) {
    throw new Error("Invalid stream event");
  }

  if (event.type === "delta") {
    if (!("text" in event) || typeof event.text !== "string") {
      throw new Error("Invalid text event");
    }

    onDelta(event.text);
    return false;
  }

  if (event.type === "error") {
    throw new Error("The assistant could not answer right now");
  }

  if (event.type === "done") {
    return true;
  }

  throw new Error("Unknown stream event");
}

export async function streamChatMessage(
  conversationId: string,
  message: string,
  onDelta: (text: string) => void,
): Promise<void> {
  const response = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Session-Token": sessionToken() },
    body: JSON.stringify({ conversationId, message }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed (${response.status})`);
  }

  if (!response.body) {
    throw new Error("The browser did not receive a response stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim()) {
          completed = readEventLine(line, onDelta) || completed;
        }
      }

      if (done) break;
    }

    if (buffer.trim()) {
      completed = readEventLine(buffer, onDelta) || completed;
    }

    if (!completed) {
      throw new Error("The assistant stream ended unexpectedly");
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
