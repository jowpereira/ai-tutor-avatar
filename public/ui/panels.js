// Gerenciamento das abas e painéis das 5 ações
import { store, derive } from './store.js';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  initPanels();
});

function initPanels() {
  // Elementos das abas
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Elementos dos painéis
  const pausePointsList = document.getElementById('pausePointsList');
  const presenterNotesList = document.getElementById('presenterNotesList');
  const finalQueueList = document.getElementById('finalQueueList');
  const manualPauseBtn = document.getElementById('manualPause');
  const drainFinalBtn = document.getElementById('drainFinal');
  const clearFinalBtn = document.getElementById('clearFinal');

  console.log('Panel elements found:', {
    tabBtns: tabBtns.length,
    tabContents: tabContents.length,
    pausePointsList, presenterNotesList, finalQueueList,
    manualPauseBtn, drainFinalBtn, clearFinalBtn
  });

  // Sistema de abas
  function switchTab(targetTab) {
    if (!tabBtns || !tabContents) return;
    
    tabBtns.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    const targetBtn = document.querySelector(`[data-tab="${targetTab}"]`);
    const targetContent = document.getElementById(`${targetTab}Tab`);
    
    if (targetBtn) targetBtn.classList.add('active');
    if (targetContent) targetContent.classList.add('active');
    
    loadTabData(targetTab);
  }

  // Event listeners para as abas
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // Carregar dados específicos de cada aba
  async function loadTabData(tab) {
    switch(tab) {
      case 'presenter':
        loadPresenterData();
        break;
      case 'final':
        loadFinalData();
        break;
      case 'chat':
        // Chat é carregado pelo chat.js
        break;
    }
  }

  // Carregar dados do apresentador (pontos de pausa + notas)
  async function loadPresenterData() {
    try {
      const [pauseRes, notesRes] = await Promise.all([
        fetch('/sessions/current/pause-points'),
        fetch('/sessions/current/presenter-notes')
      ]);

      if (pauseRes.ok && pausePointsList) {
        const pausePoints = await pauseRes.json();
        renderPausePoints(pausePoints);
      }

      if (notesRes.ok && presenterNotesList) {
        const notes = await notesRes.json();
        renderPresenterNotes(notes);
      }
    } catch (error) {
      console.error('Erro ao carregar dados do apresentador:', error);
    }
  }

  // Carregar dados da fila final
  async function loadFinalData() {
    try {
      const response = await fetch('/sessions/current/final-queue');
      if (response.ok && finalQueueList) {
        const finalQueue = await response.json();
        renderFinalQueue(finalQueue);
      }
    } catch (error) {
      console.error('Erro ao carregar fila final:', error);
    }
  }

  // Renderizar pontos de pausa
  function renderPausePoints(points) {
    if (!pausePointsList) return;
    pausePointsList.innerHTML = '';
    
    points.forEach(point => {
      const li = document.createElement('li');
      li.className = 'pause-point';
      li.innerHTML = `
        <div class="pause-content">
          <strong>⏸️ ${point.question}</strong>
          <small>Criado em: ${new Date(point.createdAt).toLocaleTimeString()}</small>
        </div>
        <button class="resolve-btn" data-id="${point.id}">✅ Resolvido</button>
      `;
      pausePointsList.appendChild(li);
    });
  }

  // Renderizar notas do apresentador
  function renderPresenterNotes(notes) {
    if (!presenterNotesList) return;
    presenterNotesList.innerHTML = '';
    
    notes.forEach(note => {
      const li = document.createElement('li');
      li.className = 'presenter-note';
      li.innerHTML = `
        <div class="note-content">
          <strong>📝 ${note.question}</strong>
          <small>Criado em: ${new Date(note.createdAt).toLocaleTimeString()}</small>
        </div>
        <button class="resolve-btn" data-id="${note.id}">✅ Concluído</button>
      `;
      presenterNotesList.appendChild(li);
    });
  }

  // Renderizar fila final
  function renderFinalQueue(queue) {
    if (!finalQueueList) return;
    finalQueueList.innerHTML = '';
    
    queue.forEach(item => {
      const li = document.createElement('li');
      li.className = 'final-item';
      li.innerHTML = `
        <div class="final-content">
          <strong>🔚 ${item.question}</strong>
          <small>Adicionado em: ${new Date(item.createdAt).toLocaleTimeString()}</small>
        </div>
        <button class="answer-btn" data-id="${item.id}">💬 Responder</button>
      `;
      finalQueueList.appendChild(li);
    });
  }

  // Event listeners para botões de ação
  if (manualPauseBtn) {
    manualPauseBtn.addEventListener('click', async () => {
      try {
        const response = await fetch('/sessions/current/manual-pause', {
          method: 'POST'
        });
        if (response.ok) {
          alert('Pausa manual ativada');
          loadPresenterData(); // Recarregar dados
        }
      } catch (error) {
        console.error('Erro ao criar pausa manual:', error);
      }
    });
  }

  if (drainFinalBtn) {
    drainFinalBtn.addEventListener('click', async () => {
      try {
        const response = await fetch('/sessions/current/drain-final', {
          method: 'POST'
        });
        if (response.ok) {
          alert('Q&A Final iniciado');
          loadFinalData(); // Recarregar dados
        }
      } catch (error) {
        console.error('Erro ao iniciar Q&A final:', error);
      }
    });
  }

  if (clearFinalBtn) {
    clearFinalBtn.addEventListener('click', async () => {
      if (!confirm('Tem certeza que deseja limpar toda a fila final?')) return;
      
      try {
        // Implementar endpoint de limpeza se necessário
        alert('Funcionalidade em desenvolvimento');
      } catch (error) {
        console.error('Erro ao limpar fila:', error);
      }
    });
  }

  // Auto-refresh dos dados quando necessário
  setInterval(() => {
    const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
    if (activeTab && activeTab !== 'chat') {
      loadTabData(activeTab);
    }
  }, 10000); // Refresh a cada 10 segundos

  // Exportar funções para uso global
  window.switchTab = switchTab;
  window.loadTabData = loadTabData;
}
