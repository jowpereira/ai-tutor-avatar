import { logger } from '../../../utils/observability.js';
import type { ChatState, Question } from '../../states/chatState.js';
import type { MainState, PauseRequest, PresenterNote, EndSessionQuestion } from '../../states/mainState.js';

/**
 * Nó: Ingerir nova mensagem do chat
 * Recebe mensagem e adiciona à fila de processamento
 */
export async function ingestChatMessage(state: ChatState, message: { text: string; participantId?: string }): Promise<Partial<ChatState>> {
  const question: Question = {
    id: `q_${Math.random().toString(36).substring(2, 10)}`,
    text: message.text.trim(),
    participantId: message.participantId || 'user',
    timestamp: Date.now(),
  };

  logger.info({
    event: 'chat_message_ingested',
    questionId: question.id,
    text: question.text.substring(0, 100) + '...',
    subgraph: 'chat'
  });

  return {
    pendingQuestions: [...state.pendingQuestions, question],
    chatLogs: [...state.chatLogs, {
      node: 'ingestChatMessage',
      action: 'message_added_to_queue',
      questionId: question.id,
      timestamp: Date.now(),
    }]
  };
}

/**
 * Nó: Julgar/Classificar mensagem
 * Usa IA para determinar qual das 5 ações tomar
 */
export async function judgeMessage(state: ChatState): Promise<Partial<ChatState>> {
  if (state.pendingQuestions.length === 0) {
    return { isClassifying: false };
  }

  const question = state.pendingQuestions[0];
  const remainingQuestions = state.pendingQuestions.slice(1);

  logger.info({
    event: 'chat_judging_message',
    questionId: question.id,
    subgraph: 'chat'
  });

  // 🤖 Aqui integramos com o RAG Agent existente para classificação
  const { ragAgent } = await import('../../../agents/rag.js');
  
  const classification = await ragAgent.classifyQuestion(question.text, {
    currentTopic: state.currentTopicContext || 'unknown',
    futureTopics: state.futureTopicsContext,
  });

  // Mapeia a classificação do RAG para nossas 5 ações
  let finalClassification: 'IGNORE' | 'RESPOND_NOW' | 'CREATE_PAUSE' | 'ADD_NOTE' | 'QUEUE_END';
  
  if (classification.topicRelevance === 'OUT_OF_SCOPE' || classification.topicRelevance === 'FUTURE') {
    finalClassification = 'IGNORE';
  } else if (classification.route === 'CHAT_NOW') {
    finalClassification = 'RESPOND_NOW';
  } else if (classification.route === 'PAUSE') {
    finalClassification = 'CREATE_PAUSE';
  } else if (classification.route === 'END_TOPIC') {
    finalClassification = 'QUEUE_END';
  } else {
    // Para perguntas complexas que precisam de atenção do apresentador
    finalClassification = 'ADD_NOTE';
  }

  const classifiedQuestion = {
    id: `cl_${Math.random().toString(36).substring(2, 8)}`,
    questionId: question.id,
    classification: finalClassification,
    reason: classification.reason,
    confidence: 0.8, // TODO: Extrair do RAG se disponível
    topicRelevance: classification.topicRelevance as 'CURRENT' | 'FUTURE' | 'OUT_OF_SCOPE',
    classifiedAt: Date.now(),
  };

  logger.info({
    event: 'chat_message_classified',
    questionId: question.id,
    classification: finalClassification,
    reason: classification.reason,
    subgraph: 'chat'
  });

  return {
    pendingQuestions: remainingQuestions,
    classifiedQuestions: [...state.classifiedQuestions, classifiedQuestion],
    isClassifying: false,
    chatLogs: [...state.chatLogs, {
      node: 'judgeMessage',
      action: 'message_classified',
      questionId: question.id,
      timestamp: Date.now(),
      details: { classification: finalClassification, reason: classification.reason }
    }]
  };
}

/**
 * Nó: Responder imediatamente no chat
 * Para classificação RESPOND_NOW
 */
export async function respondImmediately(state: ChatState, question: Question): Promise<Partial<ChatState>> {
  logger.info({
    event: 'chat_generating_immediate_response',
    questionId: question.id,
    subgraph: 'chat'
  });

  // 🤖 Gera resposta usando RAG Agent
  const { ragAgent } = await import('../../../agents/rag.js');
  
  const response = await ragAgent.generateDirectAnswer(question.text, {
    context: state.currentTopicContext || '',
  });

  const immediateResponse = {
    id: `res_${Math.random().toString(36).substring(2, 8)}`,
    questionId: question.id,
    response: response.answer,
    generatedAt: Date.now(),
    delivered: false,
  };

  return {
    immediateResponses: [...state.immediateResponses, immediateResponse],
    isGeneratingResponse: false,
    chatLogs: [...state.chatLogs, {
      node: 'respondImmediately',
      action: 'immediate_response_generated',
      questionId: question.id,
      timestamp: Date.now(),
    }]
  };
}

/**
 * Nó: Criar solicitação de pausa
 * Para classificação CREATE_PAUSE - comunica com Presenter via MainState
 */
export async function createPauseRequest(
  state: ChatState, 
  mainState: MainState,
  question: Question,
  classification: { reason: string; confidence: number }
): Promise<{ chatUpdate: Partial<ChatState>; mainUpdate: Partial<MainState> }> {
  
  const pauseRequest: PauseRequest = {
    id: `pause_${Math.random().toString(36).substring(2, 8)}`,
    questionId: question.id,
    question: question.text,
    priority: classification.confidence > 0.8 ? 'HIGH' : 'MEDIUM',
    context: state.currentTopicContext || '',
    requestedAt: Date.now(),
    processed: false,
  };

  logger.info({
    event: 'chat_pause_request_created',
    questionId: question.id,
    pauseRequestId: pauseRequest.id,
    priority: pauseRequest.priority,
    subgraph: 'chat'
  });

  return {
    chatUpdate: {
      chatLogs: [...state.chatLogs, {
        node: 'createPauseRequest',
        action: 'pause_request_sent_to_presenter',
        questionId: question.id,
        timestamp: Date.now(),
        details: { pauseRequestId: pauseRequest.id }
      }]
    },
    mainUpdate: {
      pauseRequests: [...mainState.pauseRequests, pauseRequest],
      logs: [...mainState.logs, {
        subgraph: 'chat',
        node: 'createPauseRequest',
        event: 'pause_request_added',
        timestamp: Date.now(),
        data: { questionId: question.id, priority: pauseRequest.priority }
      }]
    }
  };
}

/**
 * Nó: Adicionar nota para apresentador
 * Para classificação ADD_NOTE - comunica com Presenter via MainState
 */
export async function addPresenterNote(
  state: ChatState,
  mainState: MainState,
  question: Question,
  classification: { reason: string }
): Promise<{ chatUpdate: Partial<ChatState>; mainUpdate: Partial<MainState> }> {

  const presenterNote: PresenterNote = {
    id: `note_${Math.random().toString(36).substring(2, 8)}`,
    questionId: question.id,
    content: `Pergunta: "${question.text}"\nMotivo: ${classification.reason}`,
    topic: state.currentTopicContext || 'unknown',
    addedAt: Date.now(),
  };

  logger.info({
    event: 'chat_presenter_note_created',
    questionId: question.id,
    noteId: presenterNote.id,
    topic: presenterNote.topic,
    subgraph: 'chat'
  });

  return {
    chatUpdate: {
      chatLogs: [...state.chatLogs, {
        node: 'addPresenterNote',
        action: 'note_sent_to_presenter',
        questionId: question.id,
        timestamp: Date.now(),
        details: { noteId: presenterNote.id }
      }]
    },
    mainUpdate: {
      presenterNotes: [...mainState.presenterNotes, presenterNote],
      logs: [...mainState.logs, {
        subgraph: 'chat',
        node: 'addPresenterNote',
        event: 'presenter_note_added',
        timestamp: Date.now(),
        data: { questionId: question.id, topic: presenterNote.topic }
      }]
    }
  };
}

/**
 * Nó: Enfileirar para final da sessão
 * Para classificação QUEUE_END
 */
export async function queueForEndSession(
  state: ChatState,
  mainState: MainState,
  question: Question
): Promise<{ chatUpdate: Partial<ChatState>; mainUpdate: Partial<MainState> }> {

  const endSessionQuestion: EndSessionQuestion = {
    id: `end_${Math.random().toString(36).substring(2, 8)}`,
    question: question.text,
    topic: state.currentTopicContext || 'unknown',
    queuedAt: Date.now(),
  };

  logger.info({
    event: 'chat_question_queued_for_end',
    questionId: question.id,
    endQueueId: endSessionQuestion.id,
    subgraph: 'chat'
  });

  return {
    chatUpdate: {
      chatLogs: [...state.chatLogs, {
        node: 'queueForEndSession',
        action: 'question_queued_for_end',
        questionId: question.id,
        timestamp: Date.now(),
        details: { endQueueId: endSessionQuestion.id }
      }]
    },
    mainUpdate: {
      endSessionQueue: [...mainState.endSessionQueue, endSessionQuestion],
      logs: [...mainState.logs, {
        subgraph: 'chat',
        node: 'queueForEndSession',
        event: 'end_session_question_added',
        timestamp: Date.now(),
        data: { questionId: question.id }
      }]
    }
  };
}
