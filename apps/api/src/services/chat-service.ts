import OpenAI from "openai";
import { config } from "../config.js";

const client = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  timeout: 30_000,
  maxRetries: 2,
});

export async function answerMessage(message: string): Promise<string> {
  const response = await client.responses.create({
    model: "gpt-6-luna",
    input: message,
    reasoning: { effort: "none" },
    max_output_tokens: 512,
    store: false,
  });

  const answer = response.output_text.trim();

  if (!answer) {
    throw new Error("the model returned no text");
  }

  return answer;
}
