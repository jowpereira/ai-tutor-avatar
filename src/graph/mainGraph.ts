import { StateGraph, END } from "@langchain/langgraph";
import { logger } from '../../utils/observability';
import { MainState, MainStateSchema } from '../states/mainState';
import { PresenterState, PresenterStateSchema } from '../states/presenterState';
import { ChatState, ChatStateSchema } from '../states/chatState';

// Import subgraph nodes
import * as presenterNodes from '../subgraphs/presenter/nodes';
import * as chatNodes from '../subgraphs/chat/nodes';

/**
 * 🏗️ MAIN GRAPH COORDINATOR
 * Orquestra os subgrafos Presenter e Chat com coordenação por estado compartilhado
 * 
 * FLUXO:
 * 1. START → coordinator
 * 2. coordinator → decide qual subgrafo ativar
 * 3. Subgrafos processam independentemente
 * 4. coordinator → sincroniza estados
 * 5. LOOP até conclusão do curso
 */

interface CoordinatorState {
  main: MainState;
  presenter: PresenterState;
  chat: ChatState;
  activeSubgraph?: 'presenter' | 'chat' | 'both';
  needsSync: boolean;
}

/**
 * Nó Coordenador: Decide qual subgrafo deve ser executado
 */
async function coordinator(state: CoordinatorState): Promise<Partial<CoordinatorState>> {
  logger.info({
    event: 'main_coordinator_decision',
    pauseRequestsCount: state.main.pauseRequests.length,
    pendingQuestionsCount: state.chat.pendingQuestions.length,
    presenterProcessingPause: state.presenter.isProcessingPause,
    subgraph: 'main'
  });

  // 🔥 PRIORIDADE 1: Mensagens do chat que precisam ser processadas
  const hasUnprocessedQuestions = state.chat.pendingQuestions.length > 0;
  
  // 🔥 PRIORIDADE 2: Pausas pendentes que o presenter deve processar  
  const hasUnprocessedPauses = state.main.pauseRequests.filter(r => !r.processed).length > 0;
  const presenterNeedsProcessing = hasUnprocessedPauses || state.presenter.isProcessingPause;

  // 🔄 PRIORIDADE 3: Geração normal de conteúdo
  const presenterCanContinue = !state.presenter.isProcessingPause && !hasUnprocessedPauses;

  let activeSubgraph: 'presenter' | 'chat' | 'both' = 'presenter';

  if (hasUnprocessedQuestions && presenterNeedsProcessing) {
    // Ambos têm trabalho - processo paralelo
    activeSubgraph = 'both';
  } else if (hasUnprocessedQuestions) {
    // Apenas chat tem trabalho
    activeSubgraph = 'chat';
  } else if (presenterNeedsProcessing || presenterCanContinue) {
    // Presenter tem trabalho (pausas ou conteúdo normal)
    activeSubgraph = 'presenter';
  }

  logger.info({
    event: 'coordinator_decision_made',
    activeSubgraph,
    reasoning: {
      hasUnprocessedQuestions,
      hasUnprocessedPauses,
      presenterNeedsProcessing,
      presenterCanContinue
    },
    subgraph: 'main'
  });

  return {
    activeSubgraph,
    main: {
      ...state.main,
      logs: [...state.main.logs, {
        subgraph: 'main',
        node: 'coordinator',
        event: 'subgraph_decision',
        timestamp: Date.now(),
        data: { activeSubgraph }
      }]
    }
  };
}

/**
 * Nó Presenter Proxy: Executa os nós do subgrafo Presenter
 */
async function executePresenterSubgraph(state: CoordinatorState): Promise<Partial<CoordinatorState>> {
  logger.info({
    event: 'executing_presenter_subgraph',
    currentTopic: state.presenter.currentTopic,
    isProcessingPause: state.presenter.isProcessingPause,
    subgraph: 'main'
  });

  let presenterUpdate: Partial<PresenterState> = {};
  let mainUpdate: Partial<MainState> = {};

  try {
    // Executa a cadeia de nós do presenter baseado no estado atual
    if (state.presenter.isProcessingPause && state.presenter.pendingPauseRequests.length > 0) {
      // Processa pausas primeiro
      const result = await presenterNodes.processPauseRequests(state.presenter, state.main);
      presenterUpdate = result.presenterUpdate;
      mainUpdate = result.mainUpdate;
      
    } else if (state.main.presenterNotes.length > 0) {
      // Incorpora notas dos participantes
      const result = await presenterNodes.incorporatePresenterNotes(state.presenter, state.main);
      presenterUpdate = result.presenterUpdate;
      mainUpdate = result.mainUpdate;
      
    } else {
      // Fluxo normal: escolhe próximo conteúdo
      const contentResult = await presenterNodes.pickNextContent(state.presenter, state.main);
      presenterUpdate = contentResult.presenterUpdate;
      mainUpdate = contentResult.mainUpdate;

      // Se não está concluído, gera o conteúdo
      if (!mainUpdate.done) {
        const generationResult = await presenterNodes.generateLessonContent(
          { ...state.presenter, ...presenterUpdate }, 
          { ...state.main, ...mainUpdate }
        );
        
        presenterUpdate = { ...presenterUpdate, ...generationResult.presenterUpdate };
        mainUpdate = { ...mainUpdate, ...generationResult.mainUpdate };
      }
    }

  } catch (error) {
    logger.error({
      event: 'presenter_subgraph_error',
      error: error instanceof Error ? error.message : String(error),
      subgraph: 'main'
    });

    presenterUpdate = {
      presenterLogs: [...state.presenter.presenterLogs, {
        node: 'presenter_proxy',
        action: 'error',
        timestamp: Date.now(),
        details: { error: error instanceof Error ? error.message : String(error) }
      }]
    };
  }

  return {
    presenter: { ...state.presenter, ...presenterUpdate },
    main: { ...state.main, ...mainUpdate },
    needsSync: true
  };
}

/**
 * Nó Chat Proxy: Executa os nós do subgrafo Chat
 */
async function executeChatSubgraph(state: CoordinatorState): Promise<Partial<CoordinatorState>> {
  logger.info({
    event: 'executing_chat_subgraph',
    pendingQuestions: state.chat.pendingQuestions.length,
    subgraph: 'main'
  });

  let chatUpdate: Partial<ChatState> = {};
  let mainUpdate: Partial<MainState> = {};

  try {
    // Executa a cadeia de processamento do chat
    if (state.chat.pendingQuestions.length > 0) {
      // 1. Julga as mensagens
      const judgeResult = await chatNodes.judgeMessage(state.chat, state.main);
      chatUpdate = judgeResult.chatUpdate;
      mainUpdate = judgeResult.mainUpdate;

      const updatedChatState = { ...state.chat, ...chatUpdate };
      const updatedMainState = { ...state.main, ...mainUpdate };

      // 2. Processa ações baseado na classificação
      const classifiedQuestions = updatedChatState.classifiedQuestions || [];
      
      for (const question of classifiedQuestions) {
        let actionResult;

        switch (question.action) {
          case 'RESPOND_NOW':
            actionResult = await chatNodes.respondImmediately(updatedChatState, updatedMainState);
            break;
            
          case 'CREATE_PAUSE':
            actionResult = await chatNodes.createPauseRequest(updatedChatState, updatedMainState);
            break;
            
          case 'ADD_NOTE':
            actionResult = await chatNodes.addPresenterNote(updatedChatState, updatedMainState);
            break;
            
          case 'QUEUE_END':
            actionResult = await chatNodes.queueForEndSession(updatedChatState, updatedMainState);
            break;
            
          case 'IGNORE':
          default:
            // Não faz nada para IGNORE
            continue;
        }

        if (actionResult) {
          chatUpdate = { ...chatUpdate, ...actionResult.chatUpdate };
          mainUpdate = { ...mainUpdate, ...actionResult.mainUpdate };
        }
      }
    }

  } catch (error) {
    logger.error({
      event: 'chat_subgraph_error',
      error: error instanceof Error ? error.message : String(error),
      subgraph: 'main'
    });

    chatUpdate = {
      chatLogs: [...state.chat.chatLogs, {
        node: 'chat_proxy',
        action: 'error',
        timestamp: Date.now(),
        details: { error: error instanceof Error ? error.message : String(error) }
      }]
    };
  }

  return {
    chat: { ...state.chat, ...chatUpdate },
    main: { ...state.main, ...mainUpdate },
    needsSync: true
  };
}

/**
 * Nó de Sincronização: Garante que os estados estão atualizados
 */
async function syncStates(state: CoordinatorState): Promise<Partial<CoordinatorState>> {
  logger.info({
    event: 'syncing_states',
    mainLogsCount: state.main.logs.length,
    presenterLogsCount: state.presenter.presenterLogs.length,
    chatLogsCount: state.chat.chatLogs.length,
    subgraph: 'main'
  });

  // Aqui poderíamos adicionar lógica de persistência/cache se necessário
  return {
    needsSync: false,
    main: {
      ...state.main,
      lastSyncTimestamp: Date.now(),
      logs: [...state.main.logs, {
        subgraph: 'main',
        node: 'syncStates',
        event: 'states_synchronized',
        timestamp: Date.now(),
      }]
    }
  };
}

/**
 * Condição: Verifica se deve continuar ou terminar
 */
function shouldContinue(state: CoordinatorState): "coordinator" | "END" {
  // Termina se o curso está concluído
  if (state.main.done) {
    logger.info({
      event: 'course_completed',
      subgraph: 'main'
    });
    return "END";
  }

  // Termina se há uma condição de parada explícita
  if (state.main.endSessionQueue.length > 0) {
    logger.info({
      event: 'end_session_requested',
      queueLength: state.main.endSessionQueue.length,
      subgraph: 'main'
    });
    return "END";
  }

  // Continua o loop
  return "coordinator";
}

/**
 * 🏗️ MAIN GRAPH CONSTRUCTION
 */
export function createMainGraph() {
  const workflow = new StateGraph<CoordinatorState>({
    channels: {
      main: MainStateSchema,
      presenter: PresenterStateSchema,
      chat: ChatStateSchema,
      activeSubgraph: undefined, // string literal
      needsSync: undefined, // boolean
    }
  });

  // Adiciona os nós
  workflow.addNode("coordinator", coordinator);
  workflow.addNode("presenter_subgraph", executePresenterSubgraph);
  workflow.addNode("chat_subgraph", executeChatSubgraph);
  workflow.addNode("sync", syncStates);

  // Define o ponto de entrada
  workflow.setEntryPoint("coordinator");

  // Condições de roteamento
  workflow.addConditionalEdges(
    "coordinator",
    (state: CoordinatorState) => {
      switch (state.activeSubgraph) {
        case 'presenter':
          return "presenter_subgraph";
        case 'chat':
          return "chat_subgraph";
        case 'both':
          // Para 'both', escolhemos presenter primeiro (chat será processado no próximo ciclo)
          return "presenter_subgraph";
        default:
          return "sync";
      }
    },
    {
      "presenter_subgraph": "presenter_subgraph",
      "chat_subgraph": "chat_subgraph", 
      "sync": "sync"
    }
  );

  // Edges para sincronização
  workflow.addEdge("presenter_subgraph", "sync");
  workflow.addEdge("chat_subgraph", "sync");

  // Condição de continuação
  workflow.addConditionalEdges(
    "sync",
    shouldContinue,
    {
      "coordinator": "coordinator",
      "END": END
    }
  );

  logger.info({
    event: 'main_graph_created',
    subgraph: 'main'
  });

  return workflow.compile();
}

/**
 * 🎯 UTILITY: Cria estado inicial para o MainGraph
 */
export function createInitialState(): CoordinatorState {
  const now = Date.now();
  
  return {
    main: {
      pauseRequests: [],
      presenterNotes: [],
      endSessionQueue: [],
      courseProgress: {
        currentTopicId: '',
        currentSubtaskId: '',
        completedLessons: 0,
        totalLessons: 0
      },
      done: false,
      lastSyncTimestamp: now,
      logs: [{
        subgraph: 'main',
        node: 'initialization',
        event: 'initial_state_created',
        timestamp: now,
      }]
    },
    presenter: {
      currentTopic: null,
      currentSubtask: null,
      currentLesson: null,
      pendingPauseRequests: [],
      activePresenterNotes: [],
      pauseContent: undefined,
      contentToGenerate: undefined,
      isProcessingPause: false,
      presenterLogs: [{
        node: 'initialization',
        action: 'presenter_state_created',
        timestamp: now,
      }]
    },
    chat: {
      pendingQuestions: [],
      classifiedQuestions: [],
      immediateResponses: [],
      chatLogs: [{
        node: 'initialization',
        action: 'chat_state_created',
        timestamp: now,
      }]
    },
    needsSync: false
  };
}
