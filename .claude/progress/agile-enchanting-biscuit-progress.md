# Progress: Correcao de todos os itens do pipeline de streaming

> Iniciado em: 2026-03-13
> Plano: /Users/gabrielalonso/.claude/plans/agile-enchanting-biscuit.md
> Progress: /Users/gabrielalonso/conductor/workspaces/t3code/asmara/.claude/progress/agile-enchanting-biscuit-progress.md
> Stack: TypeScript, Effect, Bun, Vitest, React, Zustand
> Validacao: `bun run typecheck`, `bun run test`, `bun run lint`, `bun run fmt:check`

## Waves

### Wave 1: Orchestration — Incluir itemId no payload

- Status: COMPLETA
- Arquivo: `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
- Mudanca: Adicionado `itemId: event.itemId` ao `data` do payload nos cases `item.completed` (L491-494) e `item.started` (L514-517)
- Decisoes: Manteve `item.updated` sem itemId pois nao participa da deduplicacao

### Wave 2: Adapter — Completar segmento antes de rotacionar

- Status: COMPLETA
- Arquivo: `apps/server/src/provider/Layers/ClaudeCodeAdapter.ts`
- Mudancas:
  - 2.1: Emitido `item.completed` para assistantItemId atual antes da rotacao (apos item.updated)
  - 2.2: Adicionado `fallbackAssistantText: ""` na rotacao do turnState
  - 2.3: Alterado guard em `completeTurn` de `!turnState.messageCompleted` para `needsCompletion = !turnState.messageCompleted || turnState.emittedTextDelta`

### Wave 3: Frontend — Simplificar deduplicacao

- Status: COMPLETA
- Arquivos: `apps/web/src/session-logic.ts`, `apps/web/src/session-logic.test.ts`
- Mudancas:
  - 3.1: Extraido helper `extractActivityItemId` antes de `deriveWorkLogEntries`, eliminando duplicacao de logica de extracao de itemId em 2 locais (coleta de completedItemIds e filtro de tool.started)
  - 3.2: Adicionado teste fail-safe "shows tool.started when payload has no itemId" — verifica que tool.started sem data.itemId nao e filtrado
  - Correcao: ordem esperada no teste ajustada para refletir ordenacao cronologica real (started antes de completed)

### Wave 4: Validacao e Formatacao

- Status: PENDENTE

## Descobertas dos Subagentes

[Sera preenchido durante execucao]

## Log de Execucao

- Wave 1: Implementada diretamente pelo orquestrador
- Wave 2: Implementada diretamente pelo orquestrador
- Wave 3: Implementada — helper extractActivityItemId criado, logica duplicada eliminada, teste fail-safe adicionado
