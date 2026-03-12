# Sessions e Multi-turn

## Persistencia de Sessoes

O Agent SDK persiste sessoes automaticamente em disco:
```
~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
```

## Iniciar Nova Sessao

```typescript
const q = query({
  prompt: "Analyze this codebase",
  options: {
    cwd: "/path/to/project",
    sessionId: "custom-id",       // opcional
    persistSession: true,          // default: true
  }
});
```

## Continuar Sessao Mais Recente

```typescript
const q = query({
  prompt: "Now fix that bug",
  options: {
    continue: true,   // continua a sessao mais recente do cwd
  }
});
```

## Retomar Sessao Especifica

```typescript
const q = query({
  prompt: "Follow up on the previous work",
  options: {
    resume: "session-id-aqui",   // retoma sessao especifica
  }
});
```

## Fork de Sessao (Branching)

```typescript
const q = query({
  prompt: "Try a different approach",
  options: {
    resume: "session-id-aqui",
    forkSession: true,            // cria branch da sessao
  }
});
```

## Streaming de Input (Chat Interativo)

Para UIs de chat onde o usuario pode enviar multiplas mensagens:

```typescript
async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  // Primeira mensagem
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: "Analyze this codebase"
    }
  };

  // Esperar mais input do usuario...
  const nextMessage = await waitForUserInput();

  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: nextMessage
    }
  };
}

const q = query({
  prompt: generateMessages(),    // AsyncIterable como prompt
  options: { maxTurns: 50 }
});

for await (const message of q) {
  // Processar mensagens...
}
```

### Suporte a Imagens

```typescript
yield {
  type: "user" as const,
  message: {
    role: "user" as const,
    content: [
      { type: "text", text: "Review this diagram" },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: base64ImageData
        }
      }
    ]
  }
};
```

## Compactacao de Contexto

Quando o contexto se aproxima do limite:
1. SDK automaticamente compacta mensagens anteriores
2. Emite `SDKCompactBoundaryMessage` (type: "system", subtype: "compact_boundary")
3. Informacoes persistentes devem estar no `systemPrompt` ou CLAUDE.md (re-injetados a cada request)

## Interrupcao

```typescript
// Interromper o agente mid-task
q.interrupt();

// Rollback de arquivos a um checkpoint
q.rewindFiles(userMessageId);
```

## Mapeamento para Nosso Sistema

| Conceito Agent SDK | Conceito T3 Code |
|-------------------|------------------|
| Session | Thread (OrchestrationThread) |
| Turn | Turn (activeTurnId) |
| `resume` | Thread resume |
| `forkSession` | Thread fork |
| `interrupt()` | ThreadTurnInterruptCommand |
| `rewindFiles()` | ThreadCheckpointRevertCommand |
| Streaming input | Novo turn no thread |
