# Progress: Sistema de Sub-Threads (Chat Tabs)

> Iniciado em: 2026-03-14
> Plano: /Users/gabrielalonso/.claude/plans/effervescent-spinning-catmull.md
> Progress: /Users/gabrielalonso/conductor/workspaces/t3code/lansing/.claude/progress/sub-threads-progress.md
> Stack: React/Vite (web), Effect-TS (server), SQLite event sourcing, Zustand, TanStack Router
> Validação: `bun fmt`, `bun lint`, `bun typecheck`, `bun run test`

## Waves

### Wave 1: Contracts — Schemas e Tipos

- Status: CONCLUIDO
- Tarefas: 1.1-1.8
- Nota: Step 1.1 (SubThreadId em baseSchemas.ts) ja feito antes do modo execucao
- Steps 1.2-1.8 implementados: OrchestrationSubThread schema, OrchestrationThread refatorado, subThreadId opcional em payloads/commands, novos commands e events para sub-threads

### Wave 2: Server — Decider e Projector

- Status: CONCLUIDO
- Tarefas: 2.1-2.9
- Step 2.1: findSubThreadById, requireSubThread, resolveSubThreadId adicionados em commandInvariants.ts
- Step 2.2: Re-exports de SubThreadCreatedPayload, SubThreadDeletedPayload, SubThreadMetaUpdatedPayload, ThreadActiveSubThreadSetPayload adicionados em Schemas.ts
- Step 2.3: thread.create agora emite [thread.created, thread.sub-thread-created] com SubThreadId auto-gerado
- Step 2.4: Novos command cases no decider: thread.sub-thread.create, thread.sub-thread.delete, thread.sub-thread.meta.update, thread.active-sub-thread.set
- Step 2.5: subThreadId forwarding adicionado em 15 commands existentes via resolveSubThreadId; thread.turn.start agora le runtimeMode/interactionMode do SubThread
- Step 2.6: updateSubThread helper e resolveEventSubThreadId helper no projector; thread.created handler atualizado para subThreads: [], activeSubThreadId: null
- Step 2.7: Handlers para thread.sub-thread-created, thread.sub-thread-deleted, thread.sub-thread-meta-updated, thread.active-sub-thread-set
- Step 2.8: Todos handlers existentes migrados para updateSubThread: message-sent, session-set, proposed-plan-upserted, turn-diff-completed, reverted, activity-appended, runtime-mode-set, interaction-mode-set
- Step 2.9: fmt OK, lint OK, typecheck OK nos arquivos Wave 2 (erros restantes sao em arquivos Wave 3: ProjectionSnapshotQuery, ProviderCommandReactor, ProviderRuntimeIngestion, CheckpointReactor, CheckpointDiffQuery)

### Wave 3: Server — Persistência

- Status: PENDENTE
- Tarefas: 3.1-3.5

### Wave 4: Client — Tipos e Store

- Status: PENDENTE
- Tarefas: 4.1-4.6

### Wave 5: Client — Routing e Tab Bar

- Status: PENDENTE
- Tarefas: 5.1-5.7

## Descobertas dos Subagentes

- exactOptionalPropertyTypes: O tsconfig usa exactOptionalPropertyTypes: true. Funcoes que recebem SubThreadId de commands (Schema.optional) devem declarar o parametro como `SubThreadId | undefined` e nao `explicitSubThreadId?: SubThreadId`, pois passar undefined explicitamente falha o type check.
- OrchestrationThread nao tem mais model, runtimeMode, interactionMode, latestTurn, messages, proposedPlans, activities, checkpoints, session. Tudo foi movido para OrchestrationSubThread.
- thread.meta-updated payload ainda tem `model` no schema mas o handler do projector nao o aplica na thread (pois a thread nao tem mais model).
- Wave 3 tera que atualizar: CheckpointDiffQuery, CheckpointReactor, ProjectionSnapshotQuery, ProviderCommandReactor, ProviderRuntimeIngestion (todos acessam thread.checkpoints, thread.session, thread.messages, etc).

## Log de Execução

- 2026-03-14: Plano aprovado, iniciando execução
- Step 1.1: SubThreadId adicionado em baseSchemas.ts (feito manualmente antes do /executar-plano)
- Import de SubThreadId adicionado em orchestration.ts
- Steps 1.2-1.8: OrchestrationSubThread criado, OrchestrationThread refatorado (campos movidos para SubThread, adicionados subThreads + activeSubThreadId), subThreadId adicionado em 15 payloads e 16 commands, 4 novos commands (sub-thread.create/delete/meta.update, active-sub-thread.set), 4 novos events (sub-thread-created/deleted/meta-updated, active-sub-thread-set). Contracts typecheck OK.
- Wave 2 (Steps 2.1-2.9): Server decider e projector atualizados. Decider: thread.create emite 2 events, 4 novos command cases, subThreadId forwarding em 15 commands. Projector: updateSubThread helper, 4 novos event handlers, 8 handlers existentes migrados para updateSubThread. Validacao: fmt/lint/typecheck OK nos arquivos Wave 2.
