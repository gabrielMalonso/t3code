# Streaming Pipeline - Como Renderizar em Tempo Real

## Habilitando Streaming

O streaming token-by-token requer `includePartialMessages: true`:

```typescript
const q = query({
  prompt: userInput,
  options: {
    includePartialMessages: true, // SEM ISSO, so recebe mensagens completas
    // ... outras options
  },
});
```

## Processamento de Eventos para UI

```typescript
// Estado local para acumular conteudo
let currentThinking = "";
let currentText = "";
let currentToolInputs = new Map<number, { id: string; name: string; json: string }>();

for await (const message of q) {
  switch (message.type) {
    // ====== INIT ======
    case "system":
      if (message.subtype === "init") {
        // Salvar session_id, model, tools
        initSession(message.session_id, message.model, message.tools);
      }
      break;

    // ====== STREAMING (token-by-token) ======
    case "stream_event": {
      const event = message.event;

      if (event.type === "content_block_start") {
        const block = event.content_block;
        if (block.type === "thinking") {
          // Iniciar secao de thinking na UI
          startThinkingBlock();
        } else if (block.type === "text") {
          // Iniciar secao de texto na UI
          startTextBlock();
        } else if (block.type === "tool_use") {
          // Iniciar card de tool call
          startToolUseBlock(block.id, block.name);
          currentToolInputs.set(event.index, {
            id: block.id,
            name: block.name,
            json: "",
          });
        }
      } else if (event.type === "content_block_delta") {
        const delta = event.delta;

        if (delta.type === "thinking_delta") {
          // Append ao thinking - renderizar progressivamente
          currentThinking += delta.thinking;
          updateThinkingUI(currentThinking);
        } else if (delta.type === "text_delta") {
          // Append ao texto - renderizar como markdown
          currentText += delta.text;
          updateTextUI(currentText);
        } else if (delta.type === "input_json_delta") {
          // Acumular JSON parcial do tool input
          const tool = currentToolInputs.get(event.index);
          if (tool) {
            tool.json += delta.partial_json;
            // Opcionalmente mostrar JSON parcial na UI
            updateToolInputPreview(tool.id, tool.json);
          }
        } else if (delta.type === "signature_delta") {
          // Ignorar para UI - e verificacao criptografica
        }
      } else if (event.type === "content_block_stop") {
        // Bloco completo - finalizar rendering
        const tool = currentToolInputs.get(event.index);
        if (tool) {
          // Parse JSON completo do tool input
          const input = JSON.parse(tool.json);
          finalizeToolUseBlock(tool.id, tool.name, input);
          currentToolInputs.delete(event.index);
        }
      } else if (event.type === "message_delta") {
        // stop_reason: "end_turn" ou "tool_use"
        if (event.delta.stop_reason === "tool_use") {
          // Tools vao ser executados agora
          showToolExecutionIndicator();
        }
      }
      break;
    }

    // ====== MENSAGEM COMPLETA DO ASSISTENTE ======
    case "assistant": {
      // Mensagem completa com todos os content blocks finalizados
      for (const block of message.message.content) {
        if (block.type === "thinking") {
          renderFinalThinking(block.thinking);
        } else if (block.type === "text") {
          renderFinalText(block.text);
        } else if (block.type === "tool_use") {
          renderFinalToolUse(block.id, block.name, block.input);
        }
      }

      // Reset estado de streaming
      currentThinking = "";
      currentText = "";
      currentToolInputs.clear();
      break;
    }

    // ====== RESULTADO DE TOOL ======
    case "user": {
      if (message.tool_use_result) {
        renderToolResult(message.tool_use_result);
      }
      break;
    }

    // ====== PROGRESSO DE TOOL ======
    // SDKToolProgressMessage - quando tool esta executando
    // Util para mostrar output de bash em tempo real

    // ====== RESULTADO FINAL ======
    case "result": {
      if (message.subtype === "success") {
        showSessionComplete({
          cost: message.total_cost_usd,
          duration: message.duration_ms,
          turns: message.num_turns,
          tokens: message.usage,
        });
      } else {
        showSessionError(message.subtype, message.errors);
      }
      break;
    }
  }
}
```

## Sequencia Visual de Eventos

```
Usuario envia mensagem
       |
       v
[SDKSystemMessage] "init" - sessao inicializada
       |
       v
[SDKPartialAssistantMessage] content_block_start (thinking)
[SDKPartialAssistantMessage] thinking_delta "Preciso analisar..."
[SDKPartialAssistantMessage] thinking_delta "O arquivo principal..."
[SDKPartialAssistantMessage] signature_delta (ignorar)
[SDKPartialAssistantMessage] content_block_stop
       |  <--- UI: secao thinking completa
       v
[SDKPartialAssistantMessage] content_block_start (text)
[SDKPartialAssistantMessage] text_delta "Vou fazer as seguintes..."
[SDKPartialAssistantMessage] content_block_stop
       |  <--- UI: texto completo
       v
[SDKPartialAssistantMessage] content_block_start (tool_use: "Edit")
[SDKPartialAssistantMessage] input_json_delta '{"file_path":'
[SDKPartialAssistantMessage] input_json_delta ' "/src/main.ts",'
[SDKPartialAssistantMessage] input_json_delta ' "old_string": "...",'
[SDKPartialAssistantMessage] input_json_delta ' "new_string": "..."}'
[SDKPartialAssistantMessage] content_block_stop
       |  <--- UI: card de Edit com diff
       v
[SDKPartialAssistantMessage] message_delta (stop_reason: "tool_use")
       |  <--- UI: indicador "executando tool..."
       v
[SDKAssistantMessage] - resposta completa (redundante se ja renderizou via streaming)
       |
       v
[SDKUserMessage] tool_use_result - output do Edit (structuredPatch, gitDiff)
       |  <--- UI: resultado do tool (diff aplicado)
       v
... (loop continua ate stop_reason: "end_turn")
       |
       v
[SDKResultMessage] - custo, duracao, tokens
       |  <--- UI: resumo final
```

## Relacao entre stream_event e assistant

Quando `includePartialMessages: true`:

- **`stream_event`** chega PRIMEIRO (token por token)
- **`assistant`** chega DEPOIS (mensagem completa)

Estrategia recomendada:

1. Renderizar via `stream_event` para experiencia em tempo real
2. Quando `assistant` chega, pode substituir o conteudo streamado pelo final (para correcao de eventuais inconsistencias)
3. Ou simplesmente ignorar `assistant` se o streaming ja renderizou tudo corretamente
