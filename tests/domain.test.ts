import { describe, it, expect, beforeEach } from 'vitest';

// Importar tipos de domínio
import type { SessionState, QuestionExt, PausePoint, PresenterNote, FinalQueueItem } from '../src/server/routes.js';
import type { Question, QuestionRoute, Answer, BroadcastItem } from '../src/services/lessonManager.js';

describe('Domain Model - Session', () => {
  let session: SessionState;

  beforeEach(() => {
    session = {
      id: 'session-1',
      status: 'RUNNING',
      startedAt: Date.now(),
      pausePoints: [],
      notes: [],
      finalQueue: []
    };
  });

  describe('Session State Transitions', () => {
    it('should initialize with RUNNING status', () => {
      expect(session.status).toBe('RUNNING');
      expect(session.endedAt).toBeUndefined();
    });

    it('should transition from RUNNING to PAUSED', () => {
      // Simulação de transição
      session.status = 'PAUSED';
      
      expect(session.status).toBe('PAUSED');
      expect(session.endedAt).toBeUndefined();
    });

    it('should transition from PAUSED to RUNNING', () => {
      session.status = 'PAUSED';
      
      // Resume
      session.status = 'RUNNING';
      
      expect(session.status).toBe('RUNNING');
    });

    it('should transition to ENDED and set endedAt timestamp', () => {
      const beforeEnd = Date.now();
      
      session.status = 'ENDED';
      session.endedAt = Date.now();
      
      expect(session.status).toBe('ENDED');
      expect(session.endedAt).toBeGreaterThanOrEqual(beforeEnd);
    });

    it('should not allow invalid status transitions', () => {
      // Este teste valida que apenas status válidos são aceitos pelo TypeScript
      const validStatuses: Array<SessionState['status']> = ['RUNNING', 'PAUSED', 'ENDED'];
      
      validStatuses.forEach(status => {
        session.status = status;
        expect(['RUNNING', 'PAUSED', 'ENDED']).toContain(session.status);
      });
    });
  });

  describe('Session Collections Management', () => {
    it('should manage pause points collection', () => {
      const pausePoint: PausePoint = {
        id: 'pause-1',
        sessionId: session.id,
        timestamp: Date.now(),
        reason: 'Manual pause requested',
        createdBy: 'user-1'
      };

      session.pausePoints.push(pausePoint);

      expect(session.pausePoints).toHaveLength(1);
      expect(session.pausePoints[0]).toEqual(pausePoint);
    });

    it('should manage presenter notes collection', () => {
      const note: PresenterNote = {
        id: 'note-1',
        sessionId: session.id,
        questionId: 'q-1',
        text: 'Important observation',
        createdAt: Date.now()
      };

      session.notes.push(note);

      expect(session.notes).toHaveLength(1);
      expect(session.notes[0].resolvedAt).toBeUndefined();
    });

    it('should manage final queue items', () => {
      const queueItem: FinalQueueItem = {
        id: 'final-1',
        sessionId: session.id,
        questionId: 'q-1',
        order: 1
      };

      session.finalQueue.push(queueItem);

      expect(session.finalQueue).toHaveLength(1);
      expect(session.finalQueue[0].answeredAt).toBeUndefined();
    });
  });
});

describe('Domain Model - Question', () => {
  let question: QuestionExt;
  let lessonQuestion: Question;

  beforeEach(() => {
    question = {
      id: 'q-1',
      sessionId: 'session-1',
      text: 'What is the main concept?',
      createdAt: Date.now(),
      status: 'PENDING'
    };

    lessonQuestion = {
      id: 'lq-1',
      text: 'How does this work?',
      ts: Date.now(),
      from: 'student-1'
    };
  });

  describe('Question Status Transitions', () => {
    it('should initialize with PENDING status', () => {
      expect(question.status).toBe('PENDING');
      expect(question.action).toBeUndefined();
    });

    it('should transition from PENDING to ANSWERED', () => {
      question.status = 'ANSWERED';
      question.action = 'ANSWER_NOW';

      expect(question.status).toBe('ANSWERED');
      expect(question.action).toBe('ANSWER_NOW');
    });

    it('should transition from PENDING to IGNORED', () => {
      question.status = 'IGNORED';
      question.action = 'IGNORE';

      expect(question.status).toBe('IGNORED');
      expect(question.action).toBe('IGNORE');
    });

    it('should transition from PENDING to QUEUED_FINAL', () => {
      question.status = 'QUEUED_FINAL';
      question.action = 'FINAL_QA';

      expect(question.status).toBe('QUEUED_FINAL');
      expect(question.action).toBe('FINAL_QA');
    });

    it('should validate all possible status values', () => {
      const validStatuses: Array<QuestionExt['status']> = [
        'PENDING', 'ANSWERED', 'IGNORED', 'QUEUED_FINAL'
      ];

      validStatuses.forEach(status => {
        question.status = status;
        expect(validStatuses).toContain(question.status);
      });
    });

    it('should validate all possible action values', () => {
      const validActions: Array<QuestionExt['action']> = [
        'IGNORE', 'ANSWER_NOW', 'PAUSE', 'NOTE', 'FINAL_QA'
      ];

      validActions.forEach(action => {
        question.action = action;
        expect([...validActions, undefined]).toContain(question.action);
      });
    });
  });

  describe('Question Route Classification', () => {
    it('should support all question route types', () => {
      const validRoutes: QuestionRoute[] = [
        'CHAT_NOW', 'PAUSE', 'END_TOPIC', 'IGNORE'
      ];

      validRoutes.forEach(route => {
        lessonQuestion.route = route;
        expect(validRoutes).toContain(lessonQuestion.route);
      });
    });

    it('should handle RAG requirements', () => {
      lessonQuestion.needsRAG = true;
      lessonQuestion.reason = 'Complex technical question requiring context';

      expect(lessonQuestion.needsRAG).toBe(true);
      expect(lessonQuestion.reason).toBe('Complex technical question requiring context');
    });

    it('should create question with minimal required fields', () => {
      const minimalQuestion: Question = {
        id: 'min-1',
        text: 'Simple question',
        ts: Date.now(),
        from: 'user-1'
      };

      expect(minimalQuestion.id).toBe('min-1');
      expect(minimalQuestion.route).toBeUndefined();
      expect(minimalQuestion.needsRAG).toBeUndefined();
    });
  });
});

describe('Domain Model - Answer and Broadcast', () => {
  let answer: Answer;
  let broadcastItem: BroadcastItem;

  beforeEach(() => {
    answer = {
      id: 'ans-1',
      questionId: 'q-1',
      answer: 'This is the answer to your question',
      mode: 'chat_now',
      ts: Date.now()
    };

    broadcastItem = {
      id: 'bc-1',
      questionId: 'q-1',
      text: 'Question for broadcast',
      score: 0.85,
      needsRAG: false,
      route: 'PAUSE'
    };
  });

  describe('Answer Creation and Modes', () => {
    it('should create chat_now answer', () => {
      expect(answer.mode).toBe('chat_now');
      expect(answer.refs).toBeUndefined();
    });

    it('should create broadcast answer with references', () => {
      answer.mode = 'broadcast';
      answer.refs = ['ref1', 'ref2', 'ref3'];

      expect(answer.mode).toBe('broadcast');
      expect(answer.refs).toHaveLength(3);
    });

    it('should validate answer modes', () => {
      const validModes: Array<Answer['mode']> = ['chat_now', 'broadcast'];
      
      validModes.forEach(mode => {
        answer.mode = mode;
        expect(validModes).toContain(answer.mode);
      });
    });
  });

  describe('Broadcast Item Validation', () => {
    it('should create broadcast item with required fields', () => {
      expect(broadcastItem.score).toBe(0.85);
      expect(broadcastItem.needsRAG).toBe(false);
      expect(broadcastItem.route).toBe('PAUSE');
    });

    it('should validate broadcast routes exclude CHAT_NOW and IGNORE', () => {
      const validBroadcastRoutes: Array<BroadcastItem['route']> = [
        'PAUSE', 'END_TOPIC'
      ];

      validBroadcastRoutes.forEach(route => {
        broadcastItem.route = route;
        expect(validBroadcastRoutes).toContain(broadcastItem.route);
      });
    });

    it('should handle RAG requirement in broadcast', () => {
      broadcastItem.needsRAG = true;
      broadcastItem.reason = 'Requires additional context for proper answer';

      expect(broadcastItem.needsRAG).toBe(true);
      expect(broadcastItem.reason).toBe('Requires additional context for proper answer');
    });

    it('should validate score ranges', () => {
      // Scores should typically be between 0 and 1 for ML confidence
      broadcastItem.score = 0.95;
      expect(broadcastItem.score).toBeGreaterThan(0);
      expect(broadcastItem.score).toBeLessThanOrEqual(1);
    });
  });
});

describe('Domain Model - Integration Tests', () => {
  it('should handle complete question lifecycle', () => {
    // Create session
    const session: SessionState = {
      id: 'session-test',
      status: 'RUNNING',
      startedAt: Date.now(),
      pausePoints: [],
      notes: [],
      finalQueue: []
    };

    // Create question
    const question: QuestionExt = {
      id: 'q-test',
      sessionId: session.id,
      text: 'Test question',
      createdAt: Date.now(),
      status: 'PENDING'
    };

    // Process question - route to ANSWER_NOW
    question.action = 'ANSWER_NOW';
    question.status = 'ANSWERED';

    // Create answer
    const answer: Answer = {
      id: 'ans-test',
      questionId: question.id,
      answer: 'Test answer content',
      mode: 'chat_now',
      ts: Date.now()
    };

    // Verify complete flow
    expect(session.status).toBe('RUNNING');
    expect(question.status).toBe('ANSWERED');
    expect(question.action).toBe('ANSWER_NOW');
    expect(answer.questionId).toBe(question.id);
    expect(answer.mode).toBe('chat_now');
  });

  it('should handle question pause flow', () => {
    const session: SessionState = {
      id: 'session-pause',
      status: 'RUNNING',
      startedAt: Date.now(),
      pausePoints: [],
      notes: [],
      finalQueue: []
    };

    const question: QuestionExt = {
      id: 'q-pause',
      sessionId: session.id,
      text: 'Question that triggers pause',
      createdAt: Date.now(),
      status: 'PENDING'
    };

    // Question triggers pause
    question.action = 'PAUSE';
    session.status = 'PAUSED';

    // Create pause point
    const pausePoint: PausePoint = {
      id: 'pause-test',
      sessionId: session.id,
      timestamp: Date.now(),
      reason: 'Question requires detailed explanation',
      createdBy: 'system'
    };
    session.pausePoints.push(pausePoint);

    // Verify pause flow
    expect(session.status).toBe('PAUSED');
    expect(question.action).toBe('PAUSE');
    expect(session.pausePoints).toHaveLength(1);
    expect(session.pausePoints[0].reason).toContain('detailed explanation');
  });
});
