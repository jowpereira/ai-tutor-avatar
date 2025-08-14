import { z } from 'zod';
import { PauseRequestSchema, PresenterNoteSchema } from './mainState.js';

/**
 * Estado específico do Presenter Subgraph
 * Gerencia a geração de conteúdo e pausas programadas
 */
export const PresenterStateSchema = z.object({
  // Posição atual no curso
  currentTopic: z.string().nullable().default(null),
  currentSubtask: z.string().nullable().default(null),
  currentLesson: z.string().optional(),

  // Pausas solicitadas pelo Chat que precisam ser processadas
  pendingPauseRequests: z.array(PauseRequestSchema).default([]),
  
  // Notas recebidas do Chat para incorporar nas lições
  activePresenterNotes: z.array(PresenterNoteSchema).default([]),

  // Conteúdo sendo trabalhado
  contentToGenerate: z.string().optional(),
  pauseContent: z.string().optional(), // Conteúdo especial para pausas
  
  // Estado de processamento
  isProcessingPause: z.boolean().default(false),
  
  // Logs específicos do presenter
  presenterLogs: z.array(z.object({
    node: z.string(),
    action: z.string(),
    timestamp: z.number(),
    details: z.record(z.unknown()).optional(),
  })).default([]),
});

export type PresenterState = z.infer<typeof PresenterStateSchema>;

export const initialPresenterState: PresenterState = PresenterStateSchema.parse({});
