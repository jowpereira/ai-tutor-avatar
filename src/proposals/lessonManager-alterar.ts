// Versão proposta (-alterar) para evoluir o LessonManager sem remover a atual.
// Objetivos desta versão:
// 1. Suporte a execução automática até completar tópico
// 2. Refinamento de seção (regenerar usando prompt extra)
// 3. Persistência opcional em disco a cada nova seção
// 4. Normalização de citações (remover duplicatas e gerar lista final)
//
// Esta implementação NÃO É usada ainda. Apenas referência para futura troca.

import { buildLessonGraph } from '../graph/lessonGraph.js';
import { logger } from '../utils/observability.js';
import { promises as fs } from 'fs';
import path from 'path';

export interface ProposedLessonSection {
  id: string; topicId: string; subtaskId: string; content: string; citations: string[];
  refined?: boolean; refinedAt?: number; notes?: string;
}

interface ProposedState {
  todo: any[]; lessons: ProposedLessonSection[]; currentTopicId: string | null; currentSubtaskId: string | null;
  draft: string; grounded: string; done: boolean; logs: any[];
}

export class LessonManagerAlterar {
  private graph = buildLessonGraph();
  private state: ProposedState = { todo: [], lessons: [], currentTopicId: null, currentSubtaskId: null, draft: '', grounded: '', done: false, logs: [] };
  private persistFile = path.resolve(process.cwd(), 'data', 'training', 'generated-lessons.json');

  async init(todos: any[]) {
    this.state = { ...this.state, todo: todos, lessons: [], currentTopicId: null, currentSubtaskId: null, draft: '', grounded: '', done: false };
    this.state = await this.graph.invoke({ ...this.state });
    logger.info({ event: 'lesson_manager_alterar_init', topics: todos.length });
    return this.state;
  }

  // Executa passos até surgir uma nova lesson ou terminar
  async stepUntilNewSection(maxSteps = 10) {
    const before = this.state.lessons.length;
    for (let i = 0; i < maxSteps && !this.state.done; i++) {
      this.state = await this.graph.invoke({ ...this.state });
      if (this.state.lessons.length > before) break;
    }
    if (this.state.lessons.length > before) await this.persist();
    return this.state;
  }

  // Refinar lição específica com prompt extra (placeholder – usa apenas concat)
  async refine(lessonId: string, extraPrompt: string) {
    const idx = this.state.lessons.findIndex(l => l.id === lessonId);
    if (idx === -1) return { error: 'lesson_not_found' };
    const l = this.state.lessons[idx];
    const refinedContent = l.content + '\n\n[Refinamento]: ' + extraPrompt.trim();
    this.state.lessons[idx] = { ...l, content: refinedContent, refined: true, refinedAt: Date.now(), notes: extraPrompt };
    await this.persist();
    return this.state.lessons[idx];
  }

  normalizeCitations(raw: string) {
    const matches = raw.match(/\[\[ref:[^\]]+\]\]/g) || [];
    const uniq: string[] = [];
    for (const m of matches) if (!uniq.includes(m)) uniq.push(m);
    return { text: raw, citations: uniq };
  }

  private async persist() {
    try {
      await fs.writeFile(this.persistFile, JSON.stringify({ lessons: this.state.lessons }, null, 2), 'utf-8');
      logger.info({ event: 'lesson_manager_alterar_persisted', count: this.state.lessons.length });
    } catch (e) {
      logger.warn({ event: 'lesson_manager_alterar_persist_error', error: (e as Error).message });
    }
  }

  getState() { return this.state; }
}

export const lessonManagerAlterar = new LessonManagerAlterar();
