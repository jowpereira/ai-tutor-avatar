/// <reference types="node" />
import { z } from 'zod';
import dotenv from 'dotenv';

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(10, 'OPENAI_API_KEY ausente ou inválida').optional(),
  RAG_ENABLED: z.string().transform((v) => v !== 'false'),
  NODE_ENV: z.string().default('development'),
  MODEL_NAME: z.string().default('gpt-5-nano'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  dotenv.config();
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Falha ao validar variáveis de ambiente');
  }
  const data = parsed.data;
  if (data.RAG_ENABLED && !data.OPENAI_API_KEY) {
    throw new Error('RAG_ENABLED=true requer OPENAI_API_KEY definida');
  }
  cached = data;
  return cached;
}
