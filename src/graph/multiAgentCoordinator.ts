import { ragAgent } from '../agents/rag.js';
import { lessonManager } from '../services/lessonManager.js';
import { logger } from '../utils/observability.js';

export type ChatAction = 'IGNORE' | 'RESPOND_NOW' | 'CREATE_PAUSE' | 'ADD_NOTE' | 'QUEUE_END';

interface ClassifiedQuestion {
  id: string;
  text: string;
  route: string;
  needsRAG: boolean;
  topicRelevance: string;
  reason: string;
}

interface PauseRequest { id: string; questionId: string; createdAt: number; processed: boolean; }
interface PresenterNote { id: string; questionId: string; content: string; createdAt: number; }

interface CoordinatorState {
  questions: ClassifiedQuestion[];
  pauses: PauseRequest[];
  notes: PresenterNote[];
  endQueue: ClassifiedQuestion[];
}

export class MultiAgentCoordinator {
  private state: CoordinatorState = { questions: [], pauses: [], notes: [], endQueue: [] };

  addQuestion(text: string) {
    const id = 'mq_' + Date.now().toString(36);
    this.state.questions.push({ id, text, route: 'UNCLASSIFIED', needsRAG: false, topicRelevance: 'CURRENT', reason: '' });
    return id;
  }

  async classifyAll() {
    for (const q of this.state.questions.filter(q=>q.route==='UNCLASSIFIED')) {
      const c = await ragAgent.classifyQuestion(q.text, { currentTopic: lessonManager.getState().currentTopicId || undefined, futureTopics: [] });
      q.route = c.route;
      q.needsRAG = c.needsRAG;
      q.topicRelevance = c.topicRelevance;
      q.reason = c.reason;
      switch (c.route) {
        case 'CHAT_NOW': await this.answerNow(q); break;
        case 'PAUSE': this.createPause(q); break;
        case 'END_TOPIC': this.queueEnd(q); break;
        case 'IGNORE': break;
        case 'ADD_NOTE': this.addNote(q); break;
      }
    }
  }

  private async answerNow(q: ClassifiedQuestion) {
    const ans = await ragAgent.answerWithCitations(q.text, lessonManager.getState().currentTopicId || undefined);
    lessonManager.pushAnswer(q.id, ans, 'chat_now');
  }

  private createPause(q: ClassifiedQuestion) {
    const pr: PauseRequest = { id: 'pause_'+Date.now().toString(36), questionId: q.id, createdAt: Date.now(), processed: false };
    this.state.pauses.push(pr);
    lessonManager.requestPause(4500, 'question');
  }

  private addNote(q: ClassifiedQuestion) {
    this.state.notes.push({ id: 'note_'+Date.now().toString(36), questionId: q.id, content: q.text, createdAt: Date.now() });
  }

  private queueEnd(q: ClassifiedQuestion) { this.state.endQueue.push(q); }

  async processPauses() {
    for (const p of this.state.pauses.filter(p=>!p.processed)) {
      const q = this.state.questions.find(q=>q.id===p.questionId); if(!q) continue;
      const ansFull = await ragAgent.answerWithCitations(q.text, lessonManager.getState().currentTopicId || undefined);
      lessonManager.pushAnswer(q.id, ansFull, 'pause');
      p.processed = true;
      logger.info({ event: 'pause_answered', q: q.id });
    }
  }

  async flushEndSession() {
    for (const q of this.state.endQueue) {
      const ans = await ragAgent.answerWithCitations('Forneça uma síntese final: '+q.text, lessonManager.getState().currentTopicId || undefined);
      lessonManager.pushAnswer(q.id, ans, 'end_topic');
    }
    this.state.endQueue = [];
  }

  getState(){ return this.state; }
}

export const multiAgentCoordinator = new MultiAgentCoordinator();
