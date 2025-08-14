// Debug script para verificar o problema com mensagens não aparecendo
console.log('=== DEBUGGING CHAT INTERFACE ===');

// Verificar se os elementos existem
const elements = {
  form: document.getElementById('chatForm'),
  input: document.getElementById('chatInput'),
  sendBtn: document.getElementById('sendChat'),
  pendingList: document.getElementById('pendingList'),
  answersDiv: document.getElementById('answers')
};

console.log('Elementos encontrados:', elements);

// Verificar store
if (window.store) {
  console.log('Store state:', window.store.state);
} else {
  console.log('Store não encontrado');
}

// Verificar se módulos foram carregados
console.log('Módulos loaded:', {
  hasAPI: typeof sendQuestion !== 'undefined',
  hasStore: typeof store !== 'undefined'
});

// Adicionar listener para debug das mensagens
if (elements.form) {
  elements.form.addEventListener('submit', (e) => {
    console.log('Form submitted:', e);
  });
}

if (elements.input) {
  elements.input.addEventListener('input', (e) => {
    console.log('Input changed:', e.target.value);
  });
}

// Verificar se há erros de rede
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('Fetch request:', args);
  return originalFetch(...args).then(response => {
    console.log('Fetch response:', response);
    return response;
  }).catch(error => {
    console.error('Fetch error:', error);
    throw error;
  });
};
