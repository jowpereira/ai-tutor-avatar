import { z } from 'zod';

// Schemas para comunicação entre subgrafos
export const PauseRequestSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  question: z.string(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  context: z.string(),
  requestedAt: z.number(),
  processed: z.boolean().default(false),
});

export const PresenterNoteSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  content: z.string(),
  topic: z.string(),
  addedAt: z.number(),
});

export const EndSessionQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  topic: z.string(),
  queuedAt: z.number(),
});

export const CourseProgressSchema = z.object({
  currentTopicId: z.string().nullable().default(null),
  currentSubtaskId: z.string().nullable().default(null),
  completedTopics: z.array(z.string()).default([]),
  totalLessons: z.number().default(0),
  completedLessons: z.number().default(0),
});

/**
 * Estado principal compartilhado entre todos os subgrafos
 * Coordena comunicação entre Presenter e Chat
 */
export const MainStateSchema = z.object({
  // Identificação da sessão
  sessionId: z.string().default(() => `sess_${Math.random().toString(36).substring(2, 10)}`),
  
  // Progresso do curso
  courseProgress: CourseProgressSchema.default({}),

  // 🔥 COMUNICAÇÃO ENTRE SUBGRAFOS
  
  // Solicitações de pausa do Chat para o Presenter
  pauseRequests: z.array(PauseRequestSchema).default([]),

  // Notas do Chat para o Presenter
  presenterNotes: z.array(PresenterNoteSchema).default([]),

  // Perguntas para responder no final da sessão
  endSessionQueue: z.array(EndSessionQuestionSchema).default([]),

  // Estado geral do sistema
  done: z.boolean().default(false),

  // Logs para debugging
  logs: z.array(z.object({
    subgraph: z.enum(['main', 'presenter', 'chat']),
    node: z.string(),
    event: z.string(),
    timestamp: z.number(),
    data: z.record(z.unknown()).optional(),
  })).default([]),
});

export type PauseRequest = z.infer<typeof PauseRequestSchema>;
export type PresenterNote = z.infer<typeof PresenterNoteSchema>;
export type EndSessionQuestion = z.infer<typeof EndSessionQuestionSchema>;
export type CourseProgress = z.infer<typeof CourseProgressSchema>;
export type MainState = z.infer<typeof MainStateSchema>;

export const initialMainState: MainState = MainStateSchema.parse({});
