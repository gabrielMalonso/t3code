# Upstream Rebase — Plano de Reimplementacao de Features

## Contexto

O T3 Code e um fork do repositorio [pingdotgg/t3code](https://github.com/pingdotgg/t3code). Nosso fork adicionou varias features exclusivas ao longo do tempo (sub-threads, skills, attachments, favorite model, etc.), mas o upstream recentemente implementou seu proprio Claude Code adapter (PR #179) com uma base significativamente mais madura.

### Decisao tomada

Apos analise comparativa profunda (4 agentes paralelos analisaram adapter server-side, frontend, contracts e orchestration), decidimos:

**Partir da base upstream e reimplementar nossas features nela**, em vez de tentar portar as melhorias do upstream para nosso fork. Razoes:

1. O adapter upstream tem 51 testes vs 1 nosso, fiber management correto, multi-block text, error handling robusto
2. Nossas features sao "aditivas" (camadas em cima da base), enquanto as melhorias upstream sao "fundamentais" (arquitetura do adapter)
3. Facilita syncs futuros com upstream

### Estado atual dos branches

- **`main`** — Nosso fork com todas as features exclusivas. Tag `pre-upstream-rebase` marca este ponto.
- **`upstream-rebase`** (branch atual) — Base limpa do upstream/main (commit `bc124217`). Inclui o Claude Code adapter oficial (PR #179). Ainda nao tem nenhuma das nossas features exclusivas.

O clone do upstream puro (para testes) tambem existe em `/Volumes/SSD1TB/Projetos/t3code-upstream`.

## Tarefa para a proxima instancia

1. **Leia o branch `main`** (tag `pre-upstream-rebase`) para entender nossas features exclusivas
2. **Leia o branch `upstream-rebase`** (atual) para entender a base upstream
3. **Crie um plano macro** classificando cada feature em facil/medio/dificil com base no esforco de reimplementacao

## Features exclusivas do fork a reimplementar

### 1. Sub-threads (MAIOR feature — arquitetura profunda)

Nossa maior inovacao. Sistema completo de sub-threads com tab bar que permite sessoes paralelas por thread.

**Arquivos principais no fork (branch main):**
- `packages/contracts/src/orchestration.ts` — `OrchestrationSubThread`, `SubThreadId`, 4 novos commands, 4 novos event types, `subThreadId` em quase todos os payloads
- `packages/contracts/src/baseSchemas.ts` — `SubThreadId` type
- `apps/server/src/orchestration/Layers/ProjectionPipeline.ts` — `projection_sub_threads` table, subThreadId propagation em todos os 9 projectors
- `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` — `getActiveSubThread()`, todas as operacoes leem session/messages do active sub-thread
- `apps/web/src/store.ts` — Thread model com `subThreads[]`, `activeSubThreadId`, `mapSubThreadSession`, `mapSubThreadMessages`
- `apps/web/src/components/ChatView.tsx` — `getActiveSubThread(activeThread)` pattern, `tabBar` prop
- `apps/web/src/components/SubThreadTabBar.tsx` — Componente de tab bar
- `apps/web/src/components/chat/MessagesTimeline.tsx` e `MessagesTimeline.logic.ts`
- `apps/web/src/types.ts` — `SubThread` interface, `getActiveSubThread` helper
- Migrations SQLite para `projection_sub_threads` table

**Impacto:** Permeia TODA a stack (contracts → server → web). E a feature mais complexa.

### 2. Skills System

Catalogo de skills com discovery, token resolution e skill-aware trigger detection.

**Arquivos principais:**
- `apps/server/src/codexAppServerManager.ts` — `skillCatalog`, `readCodexSkillCatalog`, `extractMentionedCodexSkillNames`, `CODEX_SKILL_TOKEN_REGEX`
- `apps/server/src/provider/Layers/ClaudeCodeAdapter.ts` — `discoverSupportedCommands`, `extractSkillsFromSystemMessage`
- `apps/server/src/skillsDiscovery.ts` — Modulo de discovery
- `apps/server/src/skillsCache.ts` — Cache de skills
- `apps/web/src/composerSkills.ts` — Resolucao de skills no composer
- `apps/web/src/components/ChatView.tsx` — `resolveComposerSkills`, `sessionSkillsRef`
- `packages/contracts/src/orchestration.ts` — `skills` e `slashCommands` em `OrchestrationSession`

### 3. Document Attachments (PDF + text files)

Suporte a PDF e text files como attachments alem de imagens.

**Arquivos principais:**
- `packages/contracts/src/orchestration.ts` — `ChatDocumentAttachment`, `ChatTextFileAttachment`, `UploadChatDocumentAttachment`, `UploadChatTextFileAttachment`
- `apps/web/src/composerDraftStore.ts` — `ComposerDocumentAttachment`, `addDocument`, `removeDocument`
- `apps/web/src/components/ChatView.tsx` — `composerDocuments`, handlers
- `apps/server/src/codexAppServerManager.ts` — `{ type: "text_file" }` attachment handling

### 4. Favorite Model

Sistema de modelo favorito global para novos chats.

**Arquivos principais:**
- `apps/web/src/appSettings.ts` — `FavoriteModelSchema`, `getFavoriteModel`, `toggleFavoriteModel`
- `apps/web/src/components/ChatView.tsx` — Fallback para favorite model
- `apps/web/src/components/chat/ProviderModelPicker.tsx` — Star buttons

### 5. Electron/Asar Support

Suporte para rodar dentro do Electron asar bundle.

**Arquivos principais:**
- `apps/server/src/provider/Layers/ClaudeCodeAdapter.ts` — `RUNNING_INSIDE_ASAR`, `fixAsarPath()`, `makeAsarSpawnOverride()`

### 6. Cursor Provider (terceiro provider)

Infraestrutura para Cursor como terceiro provider.

**Arquivos principais:**
- `packages/contracts/src/model.ts` — `CursorModelOptions`, `CURSOR_MODEL_FAMILY_OPTIONS`, cursor model slugs
- `packages/contracts/src/orchestration.ts` — `"cursor"` em `ProviderKind`
- `apps/server/src/provider/Layers/ProviderSessionDirectory.ts` — `"cursor"` em `decodeProviderKind`
- `apps/web/src/appSettings.ts` — `customCursorModels`

### 7. Melhorias menores do fork

- **Approval timeout** (120s) no ClaudeCodeAdapter — upstream espera indefinidamente
- **`toolName` e `diffStats` no WorkLogEntry** — UI mais rica para work log
- **Smart tool.started deduplication** — so esconde started quando completed existe
- **`thinking` tone** em `OrchestrationThreadActivityTone`
- **Provider inference robusto** — `inferProviderForThreadModel` com chain de fallbacks
- **Image path fix** (PR #28) — passa file path ao modelo em vez de tentar base64

## Diferencas de naming a considerar

O upstream usa `"claudeAgent"` como provider kind. Nosso fork usa `"claudeCode"`. Ao reimplementar, devemos usar o naming do upstream (`"claudeAgent"`) para manter compatibilidade.

Da mesma forma:
- Upstream: `ClaudeAdapter` / Fork: `ClaudeCodeAdapter`
- Upstream: `ClaudeModelOptions` / Fork: `ClaudeCodeModelOptions`
- Upstream: `ClaudeProviderStartOptions` / Fork: `ClaudeCodeProviderStartOptions`

## Classificacao preliminar de dificuldade

| Feature | Dificuldade | Justificativa |
|---|---|---|
| Favorite Model | Facil | ~50 linhas em appSettings + pequenas mudancas em ChatView e ProviderModelPicker |
| Approval Timeout | Facil | ~5 linhas no ClaudeAdapter |
| Thinking tone | Facil | 1 literal em contracts |
| toolName/diffStats no WorkLogEntry | Facil | ~40 linhas em session-logic |
| Image path fix | Facil | Mudanca localizada no adapter |
| Electron/Asar support | Facil-Medio | ~60 linhas no adapter, mas precisa testar com Electron |
| Document Attachments | Medio | Contracts + composerDraftStore + ChatView + server handler |
| Smart tool dedup | Medio | session-logic refactor |
| Skills System | Medio-Dificil | Varios modulos novos (discovery, cache, composerSkills) + integracao |
| Cursor Provider | Medio-Dificil | Permeia contracts, session directory, appSettings, UI |
| Sub-threads | Dificil | Permeia TODA a stack, requer migrations, muda modelo de dados fundamental |

## Notas importantes

- O arquivo `.claude/upstream-sync.md` tem o historico completo de syncs e a tabela de commits reimplementados
- Sempre rodar `bun install` ao trocar de branch
- Para testar o app desktop: `bun run dist:desktop:dmg` e depois instalar o DMG manualmente
- O state dir do app desktop fica em `~/.t3/userdata/state.sqlite`
- Para dev server com banco limpo: `bun dev --state-dir ~/.t3/dev-upstream`
