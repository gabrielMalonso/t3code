# Message Types - O Pipeline Completo de Eventos

## Union Type `SDKMessage`

Toda mensagem emitida pelo SDK e um dos seguintes tipos:

```typescript
type SDKMessage =
  | SDKSystemMessage // Init da sessao (primeiro evento)
  | SDKAssistantMessage // Resposta completa do Claude
  | SDKUserMessage // Input do usuario ou tool results
  | SDKPartialAssistantMessage // Streaming token-by-token (requer includePartialMessages)
  | SDKResultMessage // Resultado final (ultimo evento)
  | SDKUserMessageReplay // Replay ao retomar sessao
  | SDKCompactBoundaryMessage // Compactacao de contexto ocorreu
  | SDKStatusMessage // Status updates
  | SDKToolProgressMessage // Progresso de execucao de tool
  | SDKToolUseSummaryMessage // Resumo de tool use
  | SDKHookStartedMessage // Hook iniciado
  | SDKHookProgressMessage // Progresso de hook
  | SDKHookResponseMessage // Resposta de hook
  | SDKAuthStatusMessage // Status de autenticacao
  | SDKTaskNotificationMessage // Notificacao de task
  | SDKTaskStartedMessage // Task iniciada
  | SDKTaskProgressMessage // Progresso de task
  | SDKFilesPersistedEvent // Arquivos persistidos
  | SDKRateLimitEvent // Rate limit atingido
  | SDKPromptSuggestionMessage; // Sugestoes de prompt
```

---

## SDKSystemMessage (type: "system", subtype: "init")

**Primeiro evento emitido.** Contém metadata da sessao.

```typescript
type SDKSystemMessage = {
  type: "system";
  subtype: "init";
  uuid: UUID;
  session_id: string;
  agents?: string[];
  apiKeySource: ApiKeySource;
  betas?: string[];
  claude_code_version: string;
  cwd: string;
  tools: string[]; // lista de tools disponiveis
  mcp_servers: { name: string; status: string }[];
  model: string;
  permissionMode: PermissionMode;
  slash_commands: string[];
  output_style: string;
  skills: string[];
  plugins: { name: string; path: string }[];
};
```

**Uso no nosso app:** Inicializar estado da sessao, mostrar modelo ativo, tools disponiveis.

---

## SDKAssistantMessage (type: "assistant")

**Resposta completa do Claude.** Contém content blocks.

```typescript
type SDKAssistantMessage = {
  type: "assistant";
  uuid: UUID;
  session_id: string;
  message: BetaMessage; // @anthropic-ai/sdk - contem content blocks
  parent_tool_use_id: string | null; // non-null = dentro de subagent
  error?: SDKAssistantMessageError;
};
```

O campo `message.content` e um array de content blocks:

```typescript
type ContentBlock =
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "redacted_thinking"; data: string };
```

**Uso no nosso app:** Renderizar cada content block:

- `thinking` -> secao colapsavel de raciocinio
- `text` -> markdown renderizado
- `tool_use` -> card de tool call com nome e input

---

## SDKUserMessage (type: "user")

**Input do usuario ou resultado de tool.**

```typescript
type SDKUserMessage = {
  type: "user";
  uuid?: UUID;
  session_id: string;
  message: MessageParam;
  parent_tool_use_id: string | null;
  isSynthetic?: boolean;
  tool_use_result?: unknown; // output estruturado do tool
};
```

**Uso no nosso app:** Quando `tool_use_result` existe, renderizar o output do tool (diff de arquivo, output de terminal, etc.).

---

## SDKPartialAssistantMessage (type: "stream_event") -- CRITICO PARA UI

**Streaming em tempo real.** Wraps raw Anthropic SSE events.

```typescript
type SDKPartialAssistantMessage = {
  type: "stream_event";
  event: BetaRawMessageStreamEvent; // Raw SSE event da API
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
};
```

O `event` segue a tipagem da Anthropic API:

```typescript
type BetaRawMessageStreamEvent =
  | { type: "message_start"; message: Message }
  | { type: "content_block_start"; index: number; content_block: ContentBlock }
  | { type: "content_block_delta"; index: number; delta: ContentBlockDelta }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason: string }; usage: { output_tokens: number } }
  | { type: "message_stop" };

type ContentBlockDelta =
  | { type: "text_delta"; text: string }
  | { type: "input_json_delta"; partial_json: string }
  | { type: "thinking_delta"; thinking: string }
  | { type: "signature_delta"; signature: string };
```

**Uso no nosso app:** Atualizar UI incrementalmente conforme tokens chegam.

---

## SDKResultMessage (type: "result") -- SEMPRE O ULTIMO

```typescript
type SDKResultMessage =
  | {
      type: "result";
      subtype: "success";
      uuid: UUID;
      session_id: string;
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      num_turns: number;
      result: string;
      stop_reason: string | null;
      total_cost_usd: number;
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens: number;
        cache_read_input_tokens: number;
      };
      modelUsage: { [modelName: string]: ModelUsage };
      permission_denials: SDKPermissionDenial[];
    }
  | {
      type: "result";
      subtype: "error_max_turns" | "error_during_execution" | "error_max_budget_usd";
      // ... mesmos campos + errors: string[]
    };
```

**Uso no nosso app:** Mostrar custo, duracao, tokens usados no final da execucao.

---

## Fluxo Completo de Eventos (Ordem)

```
1. SDKSystemMessage (subtype: "init")     -> metadata da sessao
2. SDKPartialAssistantMessage (stream)    -> tokens de thinking/text/tool_use
3. SDKAssistantMessage                    -> resposta completa (content blocks)
4. SDKUserMessage (tool_use_result)       -> resultado do tool executado
5. [LOOP: volta ao 2-4 ate stop_reason="end_turn"]
6. SDKResultMessage                       -> resultado final com metricas
```

## Eventos Auxiliares (podem aparecer a qualquer momento)

| Evento                      | Quando                                      |
| --------------------------- | ------------------------------------------- |
| `SDKToolProgressMessage`    | Tool em execucao (ex: bash command rodando) |
| `SDKStatusMessage`          | Status updates gerais                       |
| `SDKCompactBoundaryMessage` | Contexto foi compactado (limite atingido)   |
| `SDKRateLimitEvent`         | Rate limit da API                           |
| `SDKHook*Message`           | Hooks em execucao                           |
| `SDKTask*Message`           | Subagents/tasks                             |
