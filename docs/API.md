# API Documentation

## Overview
AI Tutor Avatar provides intelligent lesson generation with real-time question handling through 5-action routing system.

## Core Endpoints

### Chat Integration

#### POST /chat/send
Sends a message and gets immediate classification + routing.

**Request:**
```json
{
  "message": "Can we pause here for a question about Machine Learning?",
  "participantId": "user_123"
}
```

**Response:**
```json
{
  "route": "PAUSE",
  "needsRAG": true,
  "answer": "Resposta imediata se route=CHAT_NOW",
  "queuePosition": 2
}
```

**Routes:**
- `CHAT_NOW`: Immediate answer returned in response
- `PAUSE`: Queued for next lesson pause
- `END_TOPIC`: Consolidated at topic completion  
- `IGNORE`: Out of scope, not processed

#### GET /chat/state
Current lesson manager state.

**Response:**
```json
{
  "currentTopicId": "t1",
  "questionsCount": 3,
  "lessonsGenerated": 5,
  "isPaused": false
}
```

### Course Generation

#### GET /course/stream (SSE)
Real-time lesson generation with heartbeat and inserts.

**Events:**
- `heartbeat`: Keep-alive every ~2s
- `lesson`: New lesson section generated
- `insert`: Pause/end_topic answers injected
- `done`: Course generation completed

**Example Events:**
```
event: heartbeat
data: {"type":"heartbeat","timestamp":1755177563123}

event: lesson
data: {"type":"lesson","lesson":{"id":"t1s1-sec","content":"..."}}

event: insert  
data: {"type":"insert","data":{"mode":"pause","text":"Consolidated answers..."}}
```

#### POST /events
Batch processing endpoint for todo ingestion.

**Request:**
```json
{
  "type": "ingest",
  "todos": [
    {
      "id": "t1",
      "title": "Introduction to ML",
      "subtasks": [{"id": "t1s1", "title": "Definitions"}]
    }
  ]
}
```

### Health & Debugging

#### GET /health
Service health check.

#### GET /course/lessons
Generated lessons list.

#### POST /course/next
Trigger next lesson generation step.

## 5-Action Question Processing

The system intelligently routes questions using LangGraph:

1. **CHAT_NOW** (ANSWER_NOW): Immediate short response
2. **PAUSE**: Queue for lesson break, detailed answer
3. **END_TOPIC**: Consolidate at topic completion
4. **IGNORE**: Out of scope filter
5. **NOTE**: Future feature for annotations

## LangGraph Architecture

### Main Graph Nodes
- `ingest`: Process todo items
- `judge`: Classify questions 
- `finalize`: Complete processing

### Lesson Subgraph Nodes
- `pick`: Select next subtask
- `checkQuestions`: Route pending questions
- `answerChatNow`: Immediate responses
- `processPauseAnswers`: Batch pause answers
- `processEndTopicAnswers`: Consolidate end answers
- `draftNode`: Generate lesson draft
- `groundNode`: RAG grounding with citations
- `finalizeSection`: Complete lesson section

### Chat Processing Subgraph
- `processChatNow`: Handle immediate answers
- `processPause`: Process pause queue
- `processEndTopic`: Consolidate end-topic answers

## Error Handling

All endpoints return structured errors:

```json
{
  "error": "Classification failed", 
  "code": "CLASSIFICATION_ERROR",
  "details": "OpenAI API timeout"
}
```

## Rate Limits

- Chat endpoints: 10 req/min per participant
- Streaming: 1 concurrent connection per session
- Course generation: Limited by LLM token quotas

## Authentication

Currently open API. Production deployment should implement:
- API key validation
- Participant session management
- Rate limiting by authenticated user
