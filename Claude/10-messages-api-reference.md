# Anthropic Messages API - Referencia

## Alternativa ao Agent SDK

Se decidirmos implementar o agent loop manualmente (sem Agent SDK), usamos a Messages API diretamente via `@anthropic-ai/sdk`.

```bash
npm install @anthropic-ai/sdk
```

## Criando uma Requisicao

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // usa ANTHROPIC_API_KEY

const message = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 4096,
  thinking: { type: "enabled", budget_tokens: 10000 },
  tools: [
    {
      name: "read_file",
      description: "Read a file from disk",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute file path" },
        },
        required: ["path"],
      },
    },
  ],
  messages: [{ role: "user", content: "Read the main.ts file" }],
});
```

## Streaming

### Abordagem 1: Low-level (stream: true)

```typescript
const stream = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 4096,
  messages: [...],
  stream: true
});

for await (const event of stream) {
  switch (event.type) {
    case "message_start":
      // event.message: Message (content vazio)
      break;
    case "content_block_start":
      // event.index, event.content_block: { type, ... }
      break;
    case "content_block_delta":
      // event.index, event.delta: TextDelta | InputJsonDelta | ThinkingDelta | SignatureDelta
      break;
    case "content_block_stop":
      // event.index
      break;
    case "message_delta":
      // event.delta: { stop_reason, stop_sequence }
      // event.usage: { output_tokens }
      break;
    case "message_stop":
      // fim
      break;
  }
}
```

### Abordagem 2: High-level (.stream())

```typescript
const stream = client.messages.stream({
  model: "claude-opus-4-6",
  max_tokens: 4096,
  messages: [...]
});

// Event-based
stream
  .on("text", (text) => { /* text delta */ })
  .on("thinking", (thinking) => { /* thinking delta */ })
  .on("inputJson", (json) => { /* tool input delta */ })
  .on("message", (msg) => { /* final message */ });

const finalMessage = await stream.finalMessage();
```

## Agent Loop Manual

```typescript
async function agentLoop(userMessage: string) {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

  while (true) {
    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      thinking: { type: "enabled", budget_tokens: 10000 },
      tools: TOOL_DEFINITIONS,
      messages,
    });

    // Processar stream para UI...
    const response = await stream.finalMessage();

    // Adicionar resposta ao historico
    messages.push({ role: "assistant", content: response.content });

    // Verificar se terminou
    if (response.stop_reason === "end_turn") {
      break;
    }

    // Executar tools
    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await executeTool(block.name, block.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
            is_error: false,
          });
        }
      }

      // Adicionar resultados ao historico
      messages.push({ role: "user", content: toolResults });
    }
  }
}
```

## Tipos TypeScript Importantes

```typescript
// Message (resposta)
interface Message {
  id: string;
  type: "message";
  role: "assistant";
  content: ContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
  usage: { input_tokens: number; output_tokens: number };
}

// Content blocks
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "redacted_thinking"; data: string };

// Stream events
type MessageStreamEvent =
  | { type: "message_start"; message: Message }
  | { type: "content_block_start"; index: number; content_block: ContentBlock }
  | { type: "content_block_delta"; index: number; delta: ContentBlockDelta }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason: string }; usage: { output_tokens: number } }
  | { type: "message_stop" };

// Deltas
type ContentBlockDelta =
  | { type: "text_delta"; text: string }
  | { type: "input_json_delta"; partial_json: string }
  | { type: "thinking_delta"; thinking: string }
  | { type: "signature_delta"; signature: string };

// Tool definition
interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Tool result
interface ToolResultBlockParam {
  type: "tool_result";
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}
```

## Diferencas: Agent SDK vs Messages API

Se implementarmos com Messages API direta, precisamos gerenciar:

1. **Agent loop**: Loop de tool_use -> execute -> tool_result -> continue
2. **Tool execution**: Implementar cada tool (Read, Write, Edit, Bash, etc.)
3. **File checkpointing**: Salvar estado dos arquivos antes de edits
4. **Context management**: Compactacao quando contexto fica grande
5. **Session persistence**: Salvar/restaurar conversas
6. **Permission management**: UI de aprovacao para tools perigosos
7. **Error handling**: Retries, rate limits, etc.

O Agent SDK cuida de tudo isso automaticamente.
