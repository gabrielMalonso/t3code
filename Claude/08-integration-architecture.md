# Arquitetura de Integracao - Como Encaixar no T3 Code

## Visao Geral da Arquitetura Atual

```
[Web App (React)] <--WebSocket--> [Server (Node)] <--stdio/JSON-RPC--> [Codex App Server]
```

## Arquitetura Proposta com Claude

```
[Web App (React)] <--WebSocket--> [Server (Node)] ─┬── stdio/JSON-RPC ──> [Codex App Server]
                                                    └── async generator ──> [Claude Agent SDK]
```

## O que ja existe e pode ser reutilizado

### 1. Provider Adapter Pattern (CHAVE)

O projeto ja tem uma abstracao de provider:

```typescript
// apps/server/src/provider/Services/ProviderAdapter.ts
interface ProviderAdapterShape<E> {
  startSession(input): Effect<ProviderSession, E>;
  sendTurn(input): Effect<ProviderTurnStartResult, E>;
  interruptTurn(threadId, turnId): Effect<void, E>;
  respondToRequest(threadId, requestId, decision): Effect<void, E>;
  respondToUserInput(threadId, requestId, answers): Effect<void, E>;
  stopSession(threadId): Effect<void, E>;
  listSessions(): Effect<ProviderSession[], E>;
  hasSession(threadId): Effect<boolean, E>;
  readThread(threadId): Effect<ProviderThreadSnapshot, E>;
  rollbackThread(threadId, numTurns): Effect<ProviderThreadSnapshot, E>;
  streamEvents(): Stream<ProviderRuntimeEvent>;
  stopAll(): Effect<void, E>;
}
```

**Acao:** Implementar `ClaudeAdapter` que implementa essa interface.

### 2. ProviderAdapterRegistry

Registra adapters por `ProviderKind`. Atualmente so tem "codex".

**Acao:** Adicionar "claude" ao `ProviderKind` e registrar o `ClaudeAdapter`.

### 3. ProviderRuntimeEvent (evento canonico)

Todos os providers emitem o mesmo tipo de evento canonico:

```typescript
// packages/contracts/src/providerRuntime.ts
ProviderRuntimeEvent = {
  type: ProviderRuntimeEventType;  // "session.started", "item.started", "content.delta", etc.
  source: string;
  payload: unknown;
  // ...
}
```

**Acao:** O `ClaudeAdapter` precisa mapear `SDKMessage` -> `ProviderRuntimeEvent`.

### 4. Orchestration Layer (intocavel)

A camada de orquestracao e provider-agnostica. Ela recebe `ProviderRuntimeEvent` e produz `OrchestrationEvent`. Nao precisa mudar.

### 5. Web App (minimas mudancas)

O frontend renderiza `OrchestrationEvent`. Se o mapeamento Claude -> ProviderRuntimeEvent for correto, o frontend funciona quase sem mudancas.

**Possivel excecao:** Rendering de thinking blocks (nao existe no Codex).

## Mapeamento SDKMessage -> ProviderRuntimeEvent

| SDKMessage | ProviderRuntimeEventType | Notas |
|------------|-------------------------|-------|
| `system` (init) | `session.started` + `session.configured` | Metadata da sessao |
| `stream_event` (thinking_delta) | `content.delta` | Novo tipo de content |
| `stream_event` (text_delta) | `content.delta` | Texto do assistente |
| `stream_event` (content_block_start, tool_use) | `item.started` | Tool call iniciado |
| `stream_event` (input_json_delta) | `content.delta` | Input parcial do tool |
| `stream_event` (content_block_stop) | `item.completed` | Tool call completo |
| `assistant` | Multiplos `item.*` events | Mensagem completa |
| `user` (tool_use_result) | `item.completed` | Resultado do tool |
| `result` (success) | `turn.completed` | Turn finalizado |
| `result` (error_*) | `turn.aborted` | Turn falhou |

## Fluxo Detalhado

### 1. Start Session

```typescript
// ClaudeAdapter.startSession()
const q = query({
  prompt: streamingInput,     // AsyncIterable para chat interativo
  options: {
    cwd: workspaceRoot,
    model: selectedModel,
    includePartialMessages: true,
    thinking: { type: "adaptive" },
    allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
    canUseTool: (name, input) => this.handlePermission(threadId, name, input),
  }
});

// Guardar referencia ao query object para controle
this.sessions.set(threadId, { query: q, sessionId: null });
```

### 2. Event Stream

```typescript
// ClaudeAdapter.streamEvents()
for await (const msg of q) {
  yield* this.mapToProviderEvents(threadId, msg);
}
```

### 3. Send Turn (nova mensagem)

```typescript
// ClaudeAdapter.sendTurn()
// Usa q.streamInput() para enviar nova mensagem ao agent
q.streamInput(asyncIterableWithNewMessage);
```

### 4. Interrupt

```typescript
// ClaudeAdapter.interruptTurn()
q.interrupt();
```

### 5. Permission Request

```typescript
// ClaudeAdapter (via canUseTool callback)
async handlePermission(threadId, toolName, input) {
  // Emitir evento de request.opened via streamEvents()
  const requestId = generateId();
  this.pendingApprovals.set(requestId, { resolve, reject });

  yield providerEvent("request.opened", { threadId, requestId, toolName, input });

  // Esperar resposta do frontend
  const decision = await this.pendingApprovals.get(requestId).promise;
  return decision;
}

// ClaudeAdapter.respondToRequest()
respondToRequest(threadId, requestId, decision) {
  this.pendingApprovals.get(requestId).resolve(decision);
}
```

## Mudancas Necessarias por Camada

### packages/contracts

1. Adicionar `"claude"` ao `ProviderKind` type
2. Adicionar modelos Claude ao `MODEL_OPTIONS_BY_PROVIDER`
3. Definir `ClaudeModelOptions` (thinking config, effort level)
4. Possivelmente adicionar novos `ProviderRuntimeEventType` para thinking

### apps/server

1. Implementar `ClaudeAdapter` (novo arquivo)
2. Registrar no `ProviderAdapterRegistry`
3. Possivelmente estender `ProviderRuntimeIngestion` para thinking events

### apps/web

1. Adicionar "claude" as opcoes de provider (UI selector ja existe, mas desabilitado)
2. Adicionar componente de rendering para thinking blocks
3. Mapear modelos Claude no model selector

### packages/shared

1. Adicionar opcoes de modelo Claude em `model.ts`

## Riscos e Decisoes

### Risco 1: Agent SDK spawna processo
O Agent SDK spawna um processo `claude` CLI. Precisamos garantir que o CLI esta instalado no servidor.

**Alternativa:** Usar a Messages API diretamente (`@anthropic-ai/sdk`) e implementar o agent loop manualmente. Mais trabalho, mas sem dependencia de CLI.

### Risco 2: Mapeamento de eventos
O Codex e o Claude tem pipelines de eventos diferentes. O mapeamento precisa ser robusto.

### Risco 3: Thinking blocks
O frontend nao tem conceito de thinking. Precisamos adicionar esse conceito ao sistema de activities/events.

### Decisao: Agent SDK vs Messages API Direta

| | Agent SDK | Messages API Direta |
|--|-----------|-------------------|
| Complexidade de implementacao | Menor (SDK gerencia loop) | Maior (implementar loop, tools, etc.) |
| Dependencia externa | CLI `claude` instalado | Apenas npm package |
| Controle fino | Menor (SDK decide) | Total |
| Paridade com Claude Code | Alta (mesmo engine) | Media |
| Manutenção | SDK atualiza automaticamente | Precisa acompanhar API changes |

**Recomendacao:** Comecar com Agent SDK para MVP rapido. Migrar para Messages API direta se necessario.
