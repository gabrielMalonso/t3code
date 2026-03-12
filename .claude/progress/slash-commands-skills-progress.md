# Progress: Suporte a Skills/Slash Commands do Claude Code

> Iniciado em: 2026-03-12
> Plano: .context/attachments/pasted_text_2026-03-12_19-24-06.txt
> Progress: .claude/progress/slash-commands-skills-progress.md
> Stack: TypeScript (monorepo - contracts, server, web)
> Validacao: bun typecheck, bun lint, bun fmt:check, bun test

## Waves

### Wave 1: Pipeline Server (SDK -> Orchestration)
- Status: PENDENTE
- Tarefas: 1, 2, 3

### Wave 2: Frontend Data Model
- Status: PENDENTE
- Tarefas: 4, 5

### Wave 3: Frontend Composer (UI + Logic)
- Status: PENDENTE
- Tarefas: 6, 7, 8, 9

## Descobertas dos Subagentes

- Tarefa 1.3: O `SessionConfiguredPayload` usa `config: UnknownRecordSchema` (Record<string, unknown>), nao um tipo tipado. O cast para Record<string, unknown> e necessario para acessar skills/slashCommands.
- Tarefa 1.3: O `session.configured` NAO faz parte dos event types do bloco lifecycle (session.started, session.state.changed, etc.), entao precisa de um bloco separado de tratamento.
- Tarefa 1.3: A variavel `shouldApplyThreadLifecycle` ja esta computada e disponivel no escopo - reutilizada para o novo bloco.

## Log de Execucao

- [1.3] CONCLUIDO - Processamento de session.configured no ProviderRuntimeIngestion
  - Alteracao A: Preservacao de skills/slashCommands no dispatch existente de thread.session.set (linhas 920-925)
  - Alteracao B: Novo bloco de tratamento session.configured para extrair skills do payload config (linhas 933-960)
  - Typecheck: OK (7/7 packages, 0 errors)
- [2.2] CONCLUIDO - Mapeamento de skills/slashCommands no syncServerReadModel()
  - Adicionado spread de skills e slashCommands no mapeamento de thread.session (linhas 291-292 de store.ts)
  - Usado spread [...array] para converter readonly string[] do schema para string[] mutavel do ThreadSession
  - Typecheck: OK (7/7 packages, 0 errors)
- [3.1] CONCLUIDO - Expandir tipos e trigger detection em composer-logic.ts
  - Alteracao 1: Adicionado "skill" ao tipo ComposerTriggerKind (linha 3)
  - Alteracao 2: Adicionado parametro availableSkills a detectComposerTrigger() (linhas 112-115)
  - Alteracao 3: Adicionado bloco de skill matching apos check de SLASH_COMMANDS (linhas 141-146)
  - Typecheck: Erros pre-existentes em ChatView.tsx:3102 (union type narrowing) - serao resolvidos nas tarefas 7-9
- [3.2] CONCLUIDO - Adicionar tipo "skill" ao dropdown (ComposerCommandMenu + ChatView)
  - Alteracao 1: Novo membro "skill" na union ComposerCommandItem (skillName, label, description)
  - Alteracao 2: Import de ZapIcon e renderizacao de icone para type === "skill"
  - Alteracao 3: Texto "No matching skill." para triggerKind === "skill" na lista vazia
  - Fix adicional: Type guard em ChatView.tsx:3102 - wrapping onProviderModelSelect em `if (item.type === "model")` para resolver narrowing com novo tipo "skill"
  - Typecheck: OK (7/7 packages, 0 errors)
- [3.4] CONCLUIDO - Tratar selecao de skills no onSelectComposerItem
  - Substituido placeholder comment por bloco `if (item.type === "skill")` (linhas 3112-3123 de ChatView.tsx)
  - Usa applyPromptReplacement com `/${item.skillName} ` como texto de substituicao
  - Segue o mesmo pattern dos handlers existentes (path, slash-command, model)
  - Typecheck: OK (7/7 packages, 0 errors)
- [3.3] CONCLUIDO - Montar items de skills no ChatView
  - Alteracao 1: Constante EMPTY_SKILLS no topo do arquivo (linha 172 de ChatView.tsx)
  - Alteracao 2: Variavel sessionSkills extraida de activeThread?.session?.skills (linha 913 de ChatView.tsx)
  - Alteracao 3: No composerMenuItems useMemo, case "slash-command" agora concatena skillItems apos filteredSlashCommandItems
  - Alteracao 4: Novo case "skill" no composerMenuItems useMemo retorna items de skills filtrados
  - Alteracao 5: sessionSkills adicionado a dep array do composerMenuItems useMemo
  - Alteracao 6: detectComposerTrigger recebe sessionSkills em resolveActiveComposerTrigger (linha 3081)
  - Alteracao 7: detectComposerTrigger recebe sessionSkills em onPromptChange (linha 3203)
  - Alteracao 8: sessionSkills adicionado a dep arrays de resolveActiveComposerTrigger e onPromptChange
  - Nota: sessionSkills precisou ser declarado antes do composerMenuItems useMemo (linha 913) para evitar TDZ error
  - Typecheck: OK (7/7 packages, 0 errors)
