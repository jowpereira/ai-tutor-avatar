/// <reference types="node" />
import { z } from 'zod';
import dotenv from 'dotenv';

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(10, 'OPENAI_API_KEY ausente ou inválida').optional(),
  RAG_ENABLED: z.string().transform((v) => v !== 'false'),
  NODE_ENV: z.string().default('development'),
  MODEL_NAME: z.string().default('gpt-5-nano'),
  SPEECH_KEY: z.string().min(10, 'SPEECH_KEY ausente ou inválida').optional(),
  SPEECH_REGION: z.string().min(2, 'SPEECH_REGION ausente ou inválida').optional(),
  AVATAR_MODE: z.enum(['auto','tts','webrtc']).default('auto').optional(),
  SPEECH_PRIVATE_ENDPOINT: z.string().url('SPEECH_PRIVATE_ENDPOINT inválido').optional(),
  AVATAR_CHARACTER: z.string().min(1).default('lisa').optional(),
  AVATAR_STYLE: z.string().min(1).default('casual-sitting').optional(),
  AVATAR_BG_COLOR: z.string().regex(/^#?[0-9A-Fa-f]{6,8}$/,'AVATAR_BG_COLOR inválido').optional(),
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
  if ((data.SPEECH_KEY && !data.SPEECH_REGION) || (data.SPEECH_REGION && !data.SPEECH_KEY)) {
    throw new Error('Defina SPEECH_KEY e SPEECH_REGION juntas ou nenhuma');
  }
  // Validação adicional WebRTC: se modo webrtc explícito requer SPEECH_KEY/REGION
  if (data.AVATAR_MODE === 'webrtc' && (!data.SPEECH_KEY || !data.SPEECH_REGION)) {
    throw new Error('AVATAR_MODE=webrtc requer SPEECH_KEY e SPEECH_REGION definidos');
  }
  // Private endpoint: deve coexistir com SPEECH_KEY
  if (data.SPEECH_PRIVATE_ENDPOINT && (!data.SPEECH_KEY || !data.SPEECH_REGION)) {
    throw new Error('SPEECH_PRIVATE_ENDPOINT exige SPEECH_KEY/REGION para fallback de token');
  }
  cached = data;
  return cached;
}
