import { z } from 'zod';

// Esquemas para o sistema de chat
export const QuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  participantId: z.string().default('user'),
  timestamp: z.number().default(() => Date.now()),
  context: z.string().optional(),
});

export const ClassifiedQuestionSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  classification: z.enum(['IGNORE', 'RESPOND_NOW', 'CREATE_PAUSE', 'ADD_NOTE', 'QUEUE_END']),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  topicRelevance: z.enum(['CURRENT', 'FUTURE', 'OUT_OF_SCOPE']),
  classifiedAt: z.number().default(() => Date.now()),
});

export const ImmediateResponseSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  response: z.string(),
  generatedAt: z.number().default(() => Date.now()),
  delivered: z.boolean().default(false),
});

/**
 * Estado específico do Chat Subgraph
 * Gerencia perguntas, classificação e respostas imediatas
 */
export const ChatStateSchema = z.object({
  // Perguntas recebidas mas ainda não processadas
  pendingQuestions: z.array(QuestionSchema).default([]),
  
  // Perguntas já classificadas
  classifiedQuestions: z.array(ClassifiedQuestionSchema).default([]),
  
  // Respostas imediatas geradas (ação RESPOND_NOW)
  immediateResponses: z.array(ImmediateResponseSchema).default([]),
  
  // Estado de processamento
  isClassifying: z.boolean().default(false),
  isGeneratingResponse: z.boolean().default(false),
  
  // Contexto atual do curso para classificação
  currentTopicContext: z.string().optional(),
  futureTopicsContext: z.array(z.string()).default([]),
  
  // Logs específicos do chat
  chatLogs: z.array(z.object({
    node: z.string(),
    action: z.string(),
    questionId: z.string().optional(),
    timestamp: z.number(),
    details: z.record(z.unknown()).optional(),
  })).default([]),
});

export type Question = z.infer<typeof QuestionSchema>;
export type ClassifiedQuestion = z.infer<typeof ClassifiedQuestionSchema>;
export type ImmediateResponse = z.infer<typeof ImmediateResponseSchema>;
export type ChatState = z.infer<typeof ChatStateSchema>;

export const initialChatState: ChatState = ChatStateSchema.parse({});
