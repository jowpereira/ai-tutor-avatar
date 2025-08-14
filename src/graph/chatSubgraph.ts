import { StateGraph, Annotation, START, END } from '@langchain/langgraph';

import { ragAgent } from '../agents/rag.js';
import { logger } from '../utils/observability.js';

// Shared base types
interface MessageRoute {
  id: string;
  text: string;
  route: 'CHAT_NOW' | 'PAUSE' | 'END_TOPIC' | 'IGNORE';
  needsRAG?: boolean;
  timestamp: number;
}

interface ProcessedAnswer {
  id: string;
  questionId: string;
  answer: string;
  mode: 'chat_now' | 'pause' | 'end_topic';
  timestamp: number;
  refs?: string[];
}

// Chat processing subgraph state
const ChatState = Annotation.Root({
  pendingMessages: Annotation<MessageRoute[]>({
    value: (left, right) => right !== undefined ? right : left,
    default: () => []
  }),
  processedAnswers: Annotation<ProcessedAnswer[]>({
    value: (left, right) => right !== undefined ? [...left, ...right] : left,
    default: () => []
  }),
  currentTopicId: Annotation<string | null>({
    value: (left, right) => right !== undefined ? right : left,
    default: () => null
  }),
  logs: Annotation<Record<string, unknown>[]>({
    value: (left, right) => right !== undefined ? [...left, ...right] : left,
    default: () => []
  })
});

// Chat processing nodes
const processChatNowMessages = async (state: typeof ChatState.State): Promise<Record<string, unknown>> => {
  const chatNowMessages = state.pendingMessages.filter(m => m.route === 'CHAT_NOW');
  if (!chatNowMessages.length) {
    return { logs: [{ node: 'processChatNow', action: 'skip_no_messages' }] };
  }

  const processedAnswers: ProcessedAnswer[] = [];
  
  for (const message of chatNowMessages) {
    try {
      const answer = message.needsRAG 
        ? await ragAgent.answerWithCitations(message.text, state.currentTopicId || undefined)
        : `Resposta rápida: ${message.text.substring(0, 100)}...`;
      
      processedAnswers.push({
        id: `ans_${message.id}`,
        questionId: message.id,
        answer,
        mode: 'chat_now',
        timestamp: Date.now(),
        refs: message.needsRAG ? answer.match(/\[\[ref:\d+:[^\]]+\]\]/g) || [] : undefined
      });
    } catch (error) {
      processedAnswers.push({
        id: `ans_${message.id}`,
        questionId: message.id,
        answer: `Erro ao processar: ${(error as Error).message}`,
        mode: 'chat_now',
        timestamp: Date.now()
      });
    }
  }

  return {
    processedAnswers,
    pendingMessages: state.pendingMessages.filter(m => m.route !== 'CHAT_NOW'),
    logs: [{ 
      node: 'processChatNow', 
      action: 'processed', 
      count: processedAnswers.length,
      timestamp: Date.now()
    }]
  };
};

const processPauseMessages = async (state: typeof ChatState.State): Promise<Record<string, unknown>> => {
  const pauseMessages = state.pendingMessages.filter(m => m.route === 'PAUSE');
  if (!pauseMessages.length) {
    return { logs: [{ node: 'processPause', action: 'skip_no_messages' }] };
  }

  const processedAnswers: ProcessedAnswer[] = [];
  
  for (const message of pauseMessages) {
    try {
      const answer = await ragAgent.answerWithCitations(message.text, state.currentTopicId || undefined);
      processedAnswers.push({
        id: `ans_${message.id}`,
        questionId: message.id,
        answer,
        mode: 'pause',
        timestamp: Date.now(),
        refs: answer.match(/\[\[ref:\d+:[^\]]+\]\]/g) || []
      });
    } catch (error) {
      processedAnswers.push({
        id: `ans_${message.id}`,
        questionId: message.id,
        answer: `Erro ao processar pausa: ${(error as Error).message}`,
        mode: 'pause',
        timestamp: Date.now()
      });
    }
  }

  return {
    processedAnswers,
    pendingMessages: state.pendingMessages.filter(m => m.route !== 'PAUSE'),
    logs: [{ 
      node: 'processPause', 
      action: 'processed', 
      count: processedAnswers.length,
      timestamp: Date.now()
    }]
  };
};

const processEndTopicMessages = async (state: typeof ChatState.State): Promise<Record<string, unknown>> => {
  const endTopicMessages = state.pendingMessages.filter(m => m.route === 'END_TOPIC');
  if (!endTopicMessages.length) {
    return { logs: [{ node: 'processEndTopic', action: 'skip_no_messages' }] };
  }

  // Consolidate multiple END_TOPIC messages into summary
  const consolidatedText = endTopicMessages
    .map(m => m.text)
    .join('\n---\n');

  const consolidatedAnswer = endTopicMessages.length > 1
    ? `Resumo das ${endTopicMessages.length} questões sobre o tópico:\n\n${consolidatedText}`
    : endTopicMessages[0].text;

  try {
    const finalAnswer = await ragAgent.answerWithCitations(consolidatedAnswer, state.currentTopicId || undefined);
    
    const processedAnswers: ProcessedAnswer[] = [{
      id: `consolidated_end_topic_${Date.now()}`,
      questionId: endTopicMessages.map(m => m.id).join(','),
      answer: finalAnswer,
      mode: 'end_topic',
      timestamp: Date.now(),
      refs: finalAnswer.match(/\[\[ref:\d+:[^\]]+\]\]/g) || []
    }];

    return {
      processedAnswers,
      pendingMessages: state.pendingMessages.filter(m => m.route !== 'END_TOPIC'),
      logs: [{ 
        node: 'processEndTopic', 
        action: 'consolidated', 
        originalCount: endTopicMessages.length,
        consolidatedInto: 1,
        timestamp: Date.now()
      }]
    };
  } catch (error) {
    const processedAnswers: ProcessedAnswer[] = [{
      id: `error_end_topic_${Date.now()}`,
      questionId: endTopicMessages.map(m => m.id).join(','),
      answer: `Erro ao consolidar questões finais: ${(error as Error).message}`,
      mode: 'end_topic',
      timestamp: Date.now()
    }];

    return {
      processedAnswers,
      pendingMessages: state.pendingMessages.filter(m => m.route !== 'END_TOPIC'),
      logs: [{ 
        node: 'processEndTopic', 
        action: 'error', 
        error: (error as Error).message,
        count: endTopicMessages.length,
        timestamp: Date.now()
      }]
    };
  }
};

// Build chat processing subgraph
export function buildChatSubgraph() {
  const chatGraph = new StateGraph(ChatState);
  
  chatGraph.addNode('processChatNow', processChatNowMessages);
  chatGraph.addNode('processPause', processPauseMessages);
  chatGraph.addNode('processEndTopic', processEndTopicMessages);
  
  // @ts-expect-error - LangGraph edge constraints
  chatGraph.addEdge(START, 'processChatNow');
  // @ts-expect-error - LangGraph edge constraints
  chatGraph.addEdge('processChatNow', 'processPause');
  // @ts-expect-error - LangGraph edge constraints
  chatGraph.addEdge('processPause', 'processEndTopic');
  // @ts-expect-error - LangGraph edge constraints
  chatGraph.addEdge('processEndTopic', END);

  const compiled = chatGraph.compile();
  logger.info({ event: 'chat_subgraph_compiled', nodes: ['processChatNow', 'processPause', 'processEndTopic'] });
  return compiled;
}

export type ChatSubgraph = ReturnType<typeof buildChatSubgraph>;
export { ChatState, type MessageRoute, type ProcessedAnswer };
