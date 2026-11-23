import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.url({ protocol: /^https?$/ }).default("http://127.0.0.1:5173"),
  OPENAI_API_KEY: z.string().min(1),
});

export const config = environmentSchema.parse(process.env);
