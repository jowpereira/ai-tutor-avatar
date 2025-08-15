# 📋 Análise Técnica: Integração Avatar Azure Speech SDK

> **Análise detalhada dos exemplos da Microsoft para implementar Avatar com WebRTC no AI Tutor**

## 🔍 Análise dos Códigos de Referência

### 📄 basic.html - Estrutura HTML

**Elementos principais identificados:**

1. **Container de Configuração** (`#configuration`)
   - Configurações do Azure Speech (região, API key, endpoint privado)
   - Configurações TTS (voz, endpoint customizado) 
   - Configurações Avatar (character, style, background)
   - Checkboxes para funcionalidades (custom avatar, background transparente, subtítulos)

2. **Container de Vídeo** (`#videoContainer`)

   ```html
   <div id="videoContainer" style="position: relative; max-width: 960px;">
     <div id="overlayArea" style="position: absolute;" hidden="hidden">
       <p id="overlayText" style="font-size: large;">Live Video</p>
     </div>
     <div id="remoteVideo"></div>
     <div id="subtitles" style="..." hidden></div>
     <canvas id="canvas" max-width="1920" height="1080" hidden></canvas>
     <canvas id="tmpCanvas" max-width="1920" height="1080" hidden></canvas>
   </div>
   ```

**Características importantes:**

- Container responsivo (max-width: 960px)
- Overlay area para elementos sobrepostos  
- Subtítulos posicionados absolutamente no bottom: 5%
- Canvas duplo para processamento de background transparente
- O vídeo é injetado dinamicamente no `#remoteVideo` via JavaScript

### 🔧 basic.js - Lógica de Controle

**Fluxo principal:**

1. **Inicialização da Sessão** (`startSession()`)
   - Configura SpeechConfig com região/key
   - Cria AvatarConfig com character, style, videoFormat
   - Requisição para token WebRTC
   - Cria AvatarSynthesizer e inicializa WebRTC

2. **Setup WebRTC** (`setupWebRTC()`)
   - Cria RTCPeerConnection com ICE servers
   - Event handler `ontrack`: cria elemento `video` ou `audio` dinamicamente
   - Adiciona ao `#remoteVideo` container
   - Event handler `datachannel`: recebe eventos do servidor

3. **Controle de Fala** (`speak()`)
   - Gera SSML com voice e texto
   - Chama `avatarSynthesizer.speakSsmlAsync(spokenSsml)`
   - Controla botões durante fala

**Gerenciamento de estado:**

- Controle de botões baseado em `peerConnection.iceConnectionState`
- Subtítulos aparecem em `EVENT_TYPE_TURN_START`  
- Background transparente usando canvas e chroma key (verde)

### 🎨 styles.css - Estilização

**Observações gerais:**

- CSS minimalista focado em responsividade
- Media queries para detecção de dispositivos touch/non-touch
- Elementos de vídeo com `max-width: 100%` para responsividade

## 🔗 Mapeamento para Nosso Sistema Atual

### ✅ O que já temos implementado:

1. **AvatarController** - Equivale ao controle de estado do basic.js
2. **WebRTCStrategy** - Equivale ao setupWebRTC + AvatarSynthesizer  
3. **TTS Fallback** - Funciona quando Azure credentials não disponíveis
4. **Avatar Shell** - Container equivalente ao `#videoContainer`

### 🎯 Adaptações Necessárias:

#### 1. Layout - Posicionamento do Avatar

**Proposta de estrutura:**

```html
<div id="main-container">
  <!-- NOVO: Avatar acima do stream -->
  <div id="avatar-section" class="avatar-positioned">
    <div id="avatarShell">
      <div id="avatarVideo"></div>
      <div id="avatarSubtitles"></div>
    </div>
  </div>
  
  <!-- EXISTENTE: Stream principal (reduzido) -->
  <div id="stream-section" class="stream-reduced">
    <div id="stream"><!-- conteúdo das lições --></div>
  </div>
</div>
```

**CSS proposto:**

```css
#main-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

#avatar-section {
  flex: 0 0 300px; /* altura fixa para avatar */
  background: #f5f5f5;
  border-bottom: 2px solid #ddd;
}

#stream-section {
  flex: 1; /* ocupa resto do espaço */
  overflow-y: auto;
}

.avatar-positioned #avatarShell {
  position: relative;
  max-width: 480px; /* menor que exemplo (960px) */
  margin: 0 auto;
  height: 100%;
}
```

#### 2. Integração com Nosso Locutor Atual

**O texto deve vir do nosso sistema:**

```javascript
// Em vez de usar textarea #spokenText (exemplo Azure)
function speakFromOurSystem(lessonText) {
  // Usar texto das lições que já funcionam 100%
  const cleanText = extractTextFromLesson(lessonText);
  
  if (avatarController && avatarController.isWebRTCReady()) {
    // Usar WebRTC Avatar
    avatarController.speak(cleanText);
  } else {
    // Fallback TTS (como já funciona)
    avatarController.speakTTS(cleanText);
  }
}

function extractTextFromLesson(lessonHtml) {
  // Remover HTML tags, manter apenas texto puro
  const temp = document.createElement('div');
  temp.innerHTML = lessonHtml;
  return temp.textContent || temp.innerText || '';
}
```

#### 3. Controle de Estado Integrado

**Sincronizar com nosso fluxo de lições:**

```javascript
// Durante typeContentSequential()
function typeContentSequential(content, references, onDone) {
  activeTyping++; 
  isTyping = true;
  
  // NOVO: Enviar para avatar enquanto digita
  if (avatarEnabled && avatarReady) {
    const textToSpeak = extractTextFromLesson(content);
    scheduleAvatarSpeech(textToSpeak);
  }
  
  // resto da lógica existente...
}
```

## 🚧 Plano de Implementação

### Fase 1: Layout e Posicionamento

1. Adicionar seção de avatar acima do stream principal
2. Redimensionar stream para acomodar avatar
3. Testar responsividade

### Fase 2: Integração WebRTC

1. Adaptar nossa WebRTCStrategy para criar elementos de vídeo dinamicamente
2. Implementar event handlers para `ontrack` e `datachannel`
3. Sincronizar com nosso sistema de credentials Azure

### Fase 3: Sincronização com Locutor

1. Modificar `typeContentSequential` para enviar texto ao avatar
2. Implementar extração de texto limpo das lições
3. Coordenar timing entre digitação e fala

### Fase 4: Polimento

1. Subtítulos sincronizados
2. Controles de volume/mute integrados
3. Estados visuais (falando/silencioso)

## ⚠️ Pontos de Atenção

### 1. Preservar Funcionamento Atual

- TTS fallback deve continuar funcionando perfeitamente
- Sistema de lições não pode ser afetado
- Controles existentes mantidos

### 2. Performance

- Avatar WebRTC consume mais recursos que TTS
- Considerar lazy loading do componente avatar
- Otimizar para mobile

### 3. UX Consistency

- Avatar deve complementar, não competir com o texto
- Timing entre texto e fala deve ser natural
- Estados de loading/erro bem comunicados

## 📊 Impacto Estimado

**Arquivos a modificar:**

- `public/ui/ui.html` - Layout principal
- `public/ui/ui.css` - Estilização do avatar section  
- `public/ui/ui.js` - Integração com typeContentSequential
- `public/ui/avatarWebRTC.js` - Event handlers WebRTC

**Arquivos a preservar:**

- `public/ui/avatarPlayer.js` - TTS fallback
- `src/server/routes.ts` - Endpoints já funcionais

**Riscos minimizados:**

- Implementação incremental por fases
- Fallback garantido para TTS
- Layout responsivo desde início
