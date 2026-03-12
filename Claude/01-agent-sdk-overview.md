# Claude Agent SDK - Overview

## O que e

O Agent SDK (`@anthropic-ai/claude-agent-sdk`) e a forma oficial de integrar o Claude Code como engine em aplicacoes. Ele **spawna um processo Claude Code** como child process (stdio), gerencia o loop agentico completo (tool execution, context, retries, permissions) e expoe tudo via async generator tipado.

**Nao e um wrapper fino da Messages API** -- e o motor completo do Claude Code rodando como subprocess.

## Instalacao

```bash
npm install @anthropic-ai/claude-agent-sdk
# ou
bun add @anthropic-ai/claude-agent-sdk
```

## Autenticacao

- `ANTHROPIC_API_KEY` env var (principal)
- Amazon Bedrock: `CLAUDE_CODE_USE_BEDROCK=1`
- Google Vertex AI: `CLAUDE_CODE_USE_VERTEX=1`

## Entry Point - `query()`

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

const q = query({
  prompt: "Analyze this codebase",
  options: {
    cwd: "/path/to/project",
    model: "claude-opus-4-6",
    includePartialMessages: true, // CRITICO para UI
    allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
    maxTurns: 50,
    thinking: { type: "adaptive" },
  },
});

for await (const message of q) {
  // Cada message e um SDKMessage tipado
}
```

## Retorno do `query()`

`Query` extends `AsyncGenerator<SDKMessage, void>` com metodos extras:

| Metodo                       | Descricao                            |
| ---------------------------- | ------------------------------------ |
| `interrupt()`                | Interrompe o agente mid-task         |
| `rewindFiles(userMessageId)` | Restaura arquivos a um checkpoint    |
| `setPermissionMode(mode)`    | Muda modo de permissao dinamicamente |
| `setModel(model)`            | Troca modelo durante a sessao        |
| `initializationResult()`     | Dados de init da sessao              |
| `supportedModels()`          | Lista modelos disponiveis            |
| `mcpServerStatus()`          | Status dos servidores MCP            |
| `streamInput(stream)`        | Envia mensagens adicionais           |
| `close()`                    | Encerra o processo                   |

## Options Completas

```typescript
type Options = {
  abortController?: AbortController;
  additionalDirectories?: string[];
  agents?: Record<string, AgentDefinition>; // subagents customizados
  allowedTools?: string[];
  disallowedTools?: string[];
  allowDangerouslySkipPermissions?: boolean; // bypass TOTAL (sandbox only)
  canUseTool?: CanUseTool; // callback de permissao
  continue?: boolean; // continua sessao anterior
  cwd?: string;
  effort?: "low" | "medium" | "high" | "max"; // default: 'high'
  enableFileCheckpointing?: boolean;
  env?: Record<string, string | undefined>;
  fallbackModel?: string;
  forkSession?: boolean;
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  includePartialMessages?: boolean; // CRITICO: habilita streaming
  maxBudgetUsd?: number;
  maxTurns?: number;
  mcpServers?: Record<string, McpServerConfig>;
  model?: string;
  outputFormat?: { type: "json_schema"; schema: JSONSchema };
  permissionMode?: PermissionMode;
  persistSession?: boolean;
  resume?: string; // session ID para retomar
  sessionId?: string;
  systemPrompt?: string | { type: "preset"; preset: "claude_code"; append?: string };
  thinking?: ThinkingConfig; // default: { type: 'adaptive' }
  tools?: string[] | { type: "preset"; preset: "claude_code" };
};
```

## Modelos Disponíveis

| Modelo     | ID                  | Uso                                    |
| ---------- | ------------------- | -------------------------------------- |
| Opus 4.6   | `claude-opus-4-6`   | Mais inteligente, ideal para agentes   |
| Sonnet 4.6 | `claude-sonnet-4-6` | Melhor relacao velocidade/inteligencia |
| Haiku 4.5  | `claude-haiku-4-5`  | Mais rapido                            |

## Comparacao com Codex (nosso provider atual)

| Aspecto                | Codex (atual)       | Claude Agent SDK                        |
| ---------------------- | ------------------- | --------------------------------------- |
| Protocolo              | JSON-RPC over stdio | Async generator over spawned process    |
| Execucao de tools      | Server gerencia     | SDK gerencia (built-in)                 |
| Streaming              | JSON-RPC events     | `SDKMessage` union via async iterator   |
| Persistencia de sessao | Externa             | Built-in (`.jsonl` on disk)             |
| Thinking               | N/A                 | `thinking` content blocks com streaming |
| File edits             | Custom              | `structuredPatch` com unified diff      |
| Permissoes             | Custom              | Built-in modes + callback + hooks       |
| Multi-turn             | Manual              | `continue: true` ou `resume: sessionId` |
