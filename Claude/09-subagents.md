# Subagents - Agentes Aninhados

## O que sao

Subagents sao agentes filhos que rodam em contexto isolado. O Claude pode delegar tarefas para subagents especializados.

## Definicao via SDK

```typescript
const options = {
  allowedTools: ["Read", "Glob", "Grep", "Agent"], // "Agent" habilita subagents
  agents: {
    "code-reviewer": {
      description: "Expert code reviewer",
      prompt: "Analyze code quality and suggest improvements",
      tools: ["Read", "Glob", "Grep"],
      model: "sonnet", // "opus", "haiku", ou "inherit" (herda do pai)
      maxTurns: 10,
    },
    "test-writer": {
      description: "Test case generator",
      prompt: "Write comprehensive tests for the given code",
      tools: ["Read", "Write", "Bash", "Glob", "Grep"],
      model: "inherit",
      maxTurns: 20,
    },
  },
};
```

## Subagents Built-in do Claude Code

| Agente              | Modelo    | Tools     | Proposito                       |
| ------------------- | --------- | --------- | ------------------------------- |
| **Explore**         | Haiku     | Read-only | Busca rapida no codebase        |
| **Plan**            | Inherited | Read-only | Pesquisa para modo planejamento |
| **General-purpose** | Inherited | Todos     | Tarefas complexas multi-step    |

## Como Subagents Aparecem nos Eventos

Mensagens de subagents tem `parent_tool_use_id` non-null:

```typescript
// Mensagem do agente principal
{
  type: "assistant",
  parent_tool_use_id: null,        // agente principal
  message: {
    content: [{
      type: "tool_use",
      id: "toolu_abc123",
      name: "Agent",
      input: { description: "Review code", prompt: "..." }
    }]
  }
}

// Mensagens do subagent
{
  type: "assistant",
  parent_tool_use_id: "toolu_abc123",  // filho do tool_use acima
  message: { content: [...] }
}

// Resultado do subagent (volta ao agente principal)
{
  type: "user",
  parent_tool_use_id: "toolu_abc123",
  tool_use_result: "Summary of the code review..."
}
```

## Rendering na UI

```
+---------------------------------------------------+
| 🤖 Agent: code-reviewer                          |
| "Expert code reviewer"                            |
| ------------------------------------------------- |
|   | 📖 Read: /src/main.ts                        |
|   | 📖 Read: /src/utils.ts                       |
|   | 💬 "Found 3 issues:                          |
|   |     1. Missing error handling...             |
|   |     2. Unused import...                      |
|   |     3. Inconsistent naming..."               |
| ------------------------------------------------- |
| ✅ Result: "Found 3 issues in the codebase..."    |
+---------------------------------------------------+
```

### Recomendacoes de UI:

- Mostrar subagent como card aninhado (indentado)
- Nome e descricao do subagent no header
- Activities do subagent dentro do card (colapsavel)
- Resultado final do subagent no footer

## Restricoes de Subagents

- Subagents NAO podem spawnar outros subagents (1 nivel de profundidade)
- Subagents rodam em contexto isolado (sem acesso ao historico do pai)
- Subagents retornam um resumo ao pai (nao todo o historico)

## Mapeamento para Nosso Sistema

O subagent pode ser modelado como:

- Uma activity do tipo `task.subagent` no thread principal
- Com sub-activities aninhadas dentro (tools executados pelo subagent)
- Ou como um "mini-thread" temporario
