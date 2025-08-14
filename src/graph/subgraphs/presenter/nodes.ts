import { logger } from '../../../utils/observability.js';
import type { PresenterState } from '../../states/presenterState.js';
import type { MainState, PauseRequest, PresenterNote } from '../../states/mainState.js';

/**
 * Nó: Escolher próximo tópico/subtarefa
 * Continua o fluxo normal de geração de conteúdo
 */
export async function pickNextContent(
  state: PresenterState,
  mainState: MainState
): Promise<{ presenterUpdate: Partial<PresenterState>; mainUpdate: Partial<MainState> }> {
  
  // 🔥 PRIORIDADE: Primeiro verifica se há pausas pendentes
  const unprocessedPauses = mainState.pauseRequests.filter(r => !r.processed);
  
  if (unprocessedPauses.length > 0) {
    // Há pausas pendentes - pausa a geração normal e processa
    logger.info({
      event: 'presenter_pause_requests_detected',
      count: unprocessedPauses.length,
      subgraph: 'presenter'
    });

    return {
      presenterUpdate: {
        pendingPauseRequests: unprocessedPauses,
        isProcessingPause: true,
        presenterLogs: [...state.presenterLogs, {
          node: 'pickNextContent',
          action: 'pause_requests_detected',
          timestamp: Date.now(),
          details: { count: unprocessedPauses.length }
        }]
      },
      mainUpdate: {}
    };
  }

  // 🔄 Continua fluxo normal - integra com lessonManager existente
  const { lessonManager } = await import('../../../services/lessonManager.js');
  const currentState = lessonManager.getState();
  
  // Se não há tópico atual, pega o próximo
  let nextTopic = state.currentTopic;
  let nextSubtask = state.currentSubtask;

  if (!nextTopic && currentState.todo.length > 0) {
    nextTopic = currentState.todo[0].id;
    nextSubtask = currentState.todo[0].subtasks[0]?.id;
  } else if (nextTopic) {
    // Continua no tópico atual ou avança
    const currentTopicData = currentState.todo.find(t => t.id === nextTopic);
    if (currentTopicData) {
      const currentSubtaskIndex = currentTopicData.subtasks.findIndex(s => s.id === nextSubtask);
      if (currentSubtaskIndex < currentTopicData.subtasks.length - 1) {
        nextSubtask = currentTopicData.subtasks[currentSubtaskIndex + 1]?.id;
      } else {
        // Tópico concluído, vai para o próximo
        const currentTopicIndex = currentState.todo.findIndex(t => t.id === nextTopic);
        if (currentTopicIndex < currentState.todo.length - 1) {
          nextTopic = currentState.todo[currentTopicIndex + 1].id;
          nextSubtask = currentState.todo[currentTopicIndex + 1].subtasks[0]?.id;
        } else {
          // Curso terminado
          return {
            presenterUpdate: {
              presenterLogs: [...state.presenterLogs, {
                node: 'pickNextContent',
                action: 'course_completed',
                timestamp: Date.now(),
              }]
            },
            mainUpdate: {
              done: true,
              logs: [...mainState.logs, {
                subgraph: 'presenter',
                node: 'pickNextContent',
                event: 'course_completed',
                timestamp: Date.now(),
              }]
            }
          };
        }
      }
    }
  }

  logger.info({
    event: 'presenter_next_content_selected',
    topic: nextTopic,
    subtask: nextSubtask,
    subgraph: 'presenter'
  });

  return {
    presenterUpdate: {
      currentTopic: nextTopic,
      currentSubtask: nextSubtask,
      isProcessingPause: false,
      presenterLogs: [...state.presenterLogs, {
        node: 'pickNextContent',
        action: 'content_selected',
        timestamp: Date.now(),
        details: { topic: nextTopic, subtask: nextSubtask }
      }]
    },
    mainUpdate: {
      courseProgress: {
        ...mainState.courseProgress,
        currentTopicId: nextTopic,
        currentSubtaskId: nextSubtask,
      },
      logs: [...mainState.logs, {
        subgraph: 'presenter',
        node: 'pickNextContent',
        event: 'content_selected',
        timestamp: Date.now(),
        data: { topic: nextTopic, subtask: nextSubtask }
      }]
    }
  };
}

/**
 * Nó: Processar solicitações de pausa do Chat
 * Gera conteúdo específico para responder dúvidas
 */
export async function processPauseRequests(
  state: PresenterState,
  mainState: MainState
): Promise<{ presenterUpdate: Partial<PresenterState>; mainUpdate: Partial<MainState> }> {

  if (state.pendingPauseRequests.length === 0) {
    return {
      presenterUpdate: { isProcessingPause: false },
      mainUpdate: {}
    };
  }

  // Processa a primeira pausa da fila (prioridade alta primeiro)
  const sortedPauses = [...state.pendingPauseRequests].sort((a, b) => {
    const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });

  const pauseToProcess = sortedPauses[0];
  const remainingPauses = state.pendingPauseRequests.filter(p => p.id !== pauseToProcess.id);

  logger.info({
    event: 'presenter_processing_pause_request',
    pauseId: pauseToProcess.id,
    question: pauseToProcess.question.substring(0, 100) + '...',
    priority: pauseToProcess.priority,
    subgraph: 'presenter'
  });

  // 🤖 Gera conteúdo específico para a pausa usando RAG
  const { ragAgent } = await import('../../../agents/rag.js');
  
  const pauseContent = await ragAgent.answerWithCitations(pauseToProcess.question, pauseToProcess.context);

  // Marca a pausa como processada no MainState
  const updatedPauseRequests = mainState.pauseRequests.map(pr => 
    pr.id === pauseToProcess.id 
      ? { ...pr, processed: true }
      : pr
  );

  return {
    presenterUpdate: {
      pendingPauseRequests: remainingPauses,
      pauseContent: pauseContent,
      isProcessingPause: remainingPauses.length > 0,
      presenterLogs: [...state.presenterLogs, {
        node: 'processPauseRequests',
        action: 'pause_content_generated',
        timestamp: Date.now(),
        details: { 
          pauseId: pauseToProcess.id,
          contentLength: pauseContent.length,
          priority: pauseToProcess.priority
        }
      }]
    },
    mainUpdate: {
      pauseRequests: updatedPauseRequests,
      logs: [...mainState.logs, {
        subgraph: 'presenter',
        node: 'processPauseRequests',
        event: 'pause_request_processed',
        timestamp: Date.now(),
        data: { 
          pauseId: pauseToProcess.id, 
          questionId: pauseToProcess.questionId,
          priority: pauseToProcess.priority
        }
      }]
    }
  };
}

/**
 * Nó: Incorporar notas do Chat nas lições
 * Adiciona contexto das perguntas dos participantes no conteúdo
 */
export async function incorporatePresenterNotes(
  state: PresenterState,
  mainState: MainState
): Promise<{ presenterUpdate: Partial<PresenterState>; mainUpdate: Partial<MainState> }> {

  const relevantNotes = mainState.presenterNotes.filter(note => 
    !state.activePresenterNotes.some(active => active.id === note.id) &&
    (note.topic === state.currentTopic || note.topic === 'unknown')
  );

  if (relevantNotes.length === 0) {
    return {
      presenterUpdate: {},
      mainUpdate: {}
    };
  }

  logger.info({
    event: 'presenter_incorporating_notes',
    count: relevantNotes.length,
    currentTopic: state.currentTopic,
    subgraph: 'presenter'
  });

  // Adiciona as notas relevantes ao estado ativo
  const updatedActiveNotes = [...state.activePresenterNotes, ...relevantNotes];

  // Cria prompt com as notas para incorporar no próximo conteúdo
  const notesContext = relevantNotes
    .map(note => `- ${note.content}`)
    .join('\n');

  const contentToGenerate = state.contentToGenerate || '';
  const enhancedContent = contentToGenerate + 
    (contentToGenerate ? '\n\n' : '') +
    `📝 Dúvidas dos participantes para abordar:\n${notesContext}`;

  return {
    presenterUpdate: {
      activePresenterNotes: updatedActiveNotes,
      contentToGenerate: enhancedContent,
      presenterLogs: [...state.presenterLogs, {
        node: 'incorporatePresenterNotes',
        action: 'notes_incorporated',
        timestamp: Date.now(),
        details: { notesCount: relevantNotes.length }
      }]
    },
    mainUpdate: {
      logs: [...mainState.logs, {
        subgraph: 'presenter',
        node: 'incorporatePresenterNotes',
        event: 'notes_incorporated_to_content',
        timestamp: Date.now(),
        data: { notesCount: relevantNotes.length, topic: state.currentTopic }
      }]
    }
  };
}

/**
 * Nó: Gerar conteúdo da lição
 * Integra com o pipeline existente de geração
 */
export async function generateLessonContent(
  state: PresenterState,
  mainState: MainState
): Promise<{ presenterUpdate: Partial<PresenterState>; mainUpdate: Partial<MainState> }> {

  if (!state.currentTopic || !state.currentSubtask) {
    return {
      presenterUpdate: {},
      mainUpdate: {}
    };
  }

  logger.info({
    event: 'presenter_generating_lesson_content',
    topic: state.currentTopic,
    subtask: state.currentSubtask,
    hasPauseContent: !!state.pauseContent,
    hasNotesContext: state.activePresenterNotes.length > 0,
    subgraph: 'presenter'
  });

  // 🔥 Integra com o lessonManager existente, mas com contexto das notas
  const { lessonManager } = await import('../../../services/lessonManager.js');

  // Se há conteúdo de pausa, processa primeiro
  if (state.pauseContent) {
    // Cria uma "lição especial" para a pausa
    const pauseLesson = {
      id: `pause_${Date.now()}`,
      topicId: state.currentTopic,
      subtaskId: state.currentSubtask,
      content: `🛑 PAUSA PARA DÚVIDAS\n\n${state.pauseContent}\n\n▶️ Continuando com a lição...`,
      citations: []
    };

    return {
      presenterUpdate: {
        pauseContent: undefined, // Limpa o conteúdo de pausa
        presenterLogs: [...state.presenterLogs, {
          node: 'generateLessonContent',
          action: 'pause_content_delivered',
          timestamp: Date.now(),
          details: { topic: state.currentTopic, subtask: state.currentSubtask }
        }]
      },
      mainUpdate: {
        logs: [...mainState.logs, {
          subgraph: 'presenter',
          node: 'generateLessonContent',
          event: 'pause_lesson_generated',
          timestamp: Date.now(),
          data: { lessonId: pauseLesson.id, topic: state.currentTopic }
        }]
      }
    };
  }

  // Gera conteúdo normal integrando com o sistema existente
  const result = await lessonManager.next({ auto: false, maxSteps: 1 });

  return {
    presenterUpdate: {
      currentLesson: result.lessons[result.lessons.length - 1]?.id,
      contentToGenerate: undefined,
      // Limpa notas processadas do tópico atual
      activePresenterNotes: state.activePresenterNotes.filter(note => 
        note.topic !== state.currentTopic
      ),
      presenterLogs: [...state.presenterLogs, {
        node: 'generateLessonContent',
        action: 'lesson_generated',
        timestamp: Date.now(),
        details: { 
          topic: state.currentTopic, 
          subtask: state.currentSubtask,
          lessonCount: result.lessons.length
        }
      }]
    },
    mainUpdate: {
      courseProgress: {
        ...mainState.courseProgress,
        completedLessons: result.lessons.length,
        totalLessons: result.todo.reduce((sum, topic) => sum + topic.subtasks.length, 0)
      },
      logs: [...mainState.logs, {
        subgraph: 'presenter',
        node: 'generateLessonContent',
        event: 'lesson_content_generated',
        timestamp: Date.now(),
        data: { 
          topic: state.currentTopic,
          subtask: state.currentSubtask,
          totalLessons: result.lessons.length
        }
      }]
    }
  };
}
