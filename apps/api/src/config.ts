import "dotenv/config";
import { z } from "zod";

const webOriginsSchema = z
  .string()
  .default("http://127.0.0.1:5173,http://localhost:5173")
  .transform((origins) => origins.split(",").map((origin) => origin.trim()))
  .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1));

const environmentSchema = z.object({
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGINS: webOriginsSchema,
  OPENAI_API_KEY: z.string().min(1),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017"),
  MONGODB_DB: z.string().min(1).default("rangpt"),
});

export const config = environmentSchema.parse(process.env);
