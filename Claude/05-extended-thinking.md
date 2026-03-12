# Extended Thinking - Raciocinio Visivel

## O que e

Extended thinking permite que o Claude "pense em voz alta" antes de responder. O resultado aparece como content blocks do tipo `thinking` na resposta.

## Configuracao

```typescript
// No Agent SDK
const q = query({
  prompt: "...",
  options: {
    thinking: { type: "adaptive" },          // Recomendado para Opus 4.6
    // OU
    thinking: { type: "enabled", budget_tokens: 10000 },  // Budget fixo
    // OU
    thinking: { type: "disabled" },          // Sem thinking
  }
});
```

**`adaptive`** (default): O modelo decide quando e quanto pensar. Melhor para Opus 4.6.

**`enabled` com `budget_tokens`**: Budget fixo de tokens para thinking. `budget_tokens` deve ser < `max_tokens`.

## Estrutura do Thinking Block

```typescript
{
  type: "thinking",
  thinking: "Preciso analisar o arquivo main.ts...\n\nO problema parece ser...",
  signature: "EqQBCg..."  // verificacao criptografica, NAO mostrar na UI
}
```

### Claude 4+ retorna thinking RESUMIDO
- Voce paga pelo thinking completo (tokens), mas recebe apenas um resumo
- O resumo captura os pontos-chave do raciocinio
- Nao ha como acessar o thinking completo

### Redacted Thinking
```typescript
{
  type: "redacted_thinking",
  data: "..."  // opaco, nao mostravel
}
```
Aparece quando o thinking contem conteudo que o modelo decidiu redatar. Mostrar placeholder na UI.

## Streaming de Thinking

### Sequencia de Eventos

```
event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me analyze "}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"this step by step..."}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"EqQBCgIYAhIM..."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}
```

### Processamento no Codigo

```typescript
// No handler de stream_event
if (event.type === "content_block_start" && event.content_block.type === "thinking") {
  // Iniciar bloco de thinking na UI
  // Mostrar indicador "Claude esta pensando..."
}

if (event.type === "content_block_delta" && event.delta.type === "thinking_delta") {
  // Append ao conteudo de thinking
  // Renderizar progressivamente (pode ser longo)
  appendThinking(event.delta.thinking);
}

if (event.type === "content_block_delta" && event.delta.type === "signature_delta") {
  // Ignorar - verificacao interna
}

if (event.type === "content_block_stop") {
  // Thinking completo - colapsar/minimizar na UI
}
```

## Interleaved Thinking (Thinking entre Tool Calls)

Com modelos que suportam, o Claude pode pensar ENTRE tool calls:

```
Turn 1:
  [thinking] "Preciso ler o arquivo primeiro..."
  [tool_use: Read] { file_path: "/src/main.ts" }

  (tool result recebido)

Turn 2:
  [thinking] "O arquivo tem um bug na linha 42. Preciso editar..."
  [tool_use: Edit] { file_path: "/src/main.ts", old_string: "...", new_string: "..." }

  (tool result recebido)

Turn 3:
  [thinking] "Edicao aplicada. Agora preciso verificar com o linter..."
  [tool_use: Bash] { command: "bun lint" }

  (tool result recebido)

Turn 4:
  [thinking] "Tudo passou. Vou resumir o que fiz."
  [text] "Corrigi o bug na linha 42 de main.ts..."
```

### Habilitando Interleaved Thinking
- **Opus 4.6**: Automatico com `thinking: { type: "adaptive" }`
- **Outros modelos**: Requer header `interleaved-thinking-2025-05-14`

## Regra CRITICA para Multi-turn

Ao enviar tool results de volta para a API (no agent loop), voce DEVE passar os thinking blocks de volta **sem modificacao**. A API filtra internamente.

**CORRETO:**
```typescript
messages.push({
  role: "assistant",
  content: [
    thinkingBlock,        // MANTER - a API precisa
    textBlock,
    toolUseBlock
  ]
});
```

**INCORRETO:**
```typescript
messages.push({
  role: "assistant",
  content: [
    // thinkingBlock removido - VAI QUEBRAR o raciocinio
    textBlock,
    toolUseBlock
  ]
});
```

No nosso caso, o Agent SDK cuida disso automaticamente.

## Rendering na UI

### Proposta de Design

```
+--------------------------------------------------+
| 💭 Thinking                           [Colapsar] |
| ------------------------------------------------ |
| Preciso analisar o arquivo main.ts para          |
| encontrar o bug reportado. O erro parece estar   |
| na funcao de validacao...                        |
+--------------------------------------------------+

Vou corrigir o bug na funcao de validacao.

+--------------------------------------------------+
| 📝 Edit: /src/main.ts                           |
| ------------------------------------------------ |
| - const isValid = input.length > 0;             |
| + const isValid = input != null && input.length; |
+--------------------------------------------------+
```

### Comportamento Sugerido
- Thinking comeca EXPANDIDO enquanto streama
- Apos conclusao do thinking, COLAPSA automaticamente (mostrando 1 linha de preview)
- Click para expandir/colapsar
- Cor/estilo diferenciado do texto principal (mais suave, italico, ou background diferente)
- `redacted_thinking` mostra placeholder "[Thinking redacted]"
