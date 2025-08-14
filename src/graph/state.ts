import { z } from 'zod';

export const TodoItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  subtasks: z.array(z.object({ id: z.string(), title: z.string(), done: z.boolean().default(false) })).default([]),
  done: z.boolean().default(false),
});

export const QuestionSchema = z.object({
  id: z.string(),
  participantId: z.string(),
  content: z.string(),
  needsRAG: z.boolean().default(false),
  priority: z.number().default(0),
  createdAt: z.number(),
  route: z.string().optional(),
  reason: z.string().optional(),
});

export const LessonSectionSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  subtaskId: z.string().optional(),
  outline: z.string().optional(),
  draft: z.string().optional(),
  grounded: z.string().optional(),
  verified: z.boolean().default(false),
  finalized: z.boolean().default(false),
});

export const TrainingStateSchema = z.object({
  todo: z.array(TodoItemSchema).default([]),
  currentTopicId: z.string().nullable().default(null),
  lessons: z.array(LessonSectionSchema).default([]),
  questionsQueue: z.array(QuestionSchema).default([]),
  pendingQuestions: z.array(QuestionSchema).default([]),
  broadcastQueue: z.array(QuestionSchema).default([]),
  answered: z.array(z.string()).default([]),
  participants: z.array(z.string()).default([]),
  route: z.string().nullable().default(null),
  logs: z.array(z.any()).default([]),
});

export type TrainingState = z.infer<typeof TrainingStateSchema>;

export const initialState: TrainingState = TrainingStateSchema.parse({});

// Helper para aplicar patch imutável com enforcement de limites
export function applyPatch(state: TrainingState, patch: Partial<TrainingState>): TrainingState {
  const next: TrainingState = { ...state, ...patch } as TrainingState;
  // Limites (MVP)
  if (next.questionsQueue.length > 500) next.questionsQueue = next.questionsQueue.slice(-500);
  if (next.broadcastQueue.length > 200) next.broadcastQueue = next.broadcastQueue.slice(0, 200);
  if (next.logs.length > 1000) next.logs = next.logs.slice(-1000);
  return next;
}
