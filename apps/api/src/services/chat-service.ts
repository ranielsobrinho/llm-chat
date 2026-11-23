import OpenAI from "openai";
import { config } from "../config.js";

const client = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  timeout: 30_000,
  maxRetries: 2,
});

export function streamAnswer(message: string, signal: AbortSignal) {
  return client.responses.create(
    {
      model: "gpt-6-luna",
      input: message,
      reasoning: { effort: "none" },
      max_output_tokens: 512,
      store: false,
      stream: true,
    },
    { signal },
  );
}
