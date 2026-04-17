# Upstream Sync

## Status atual

- Data: 2026-04-11
- Branch de trabalho: `main`
- Upstream integrado nesta wave: `5467d11980e2b41e4cf5c8d1c5fe972532da3a74` (`upstream/main`)
- Estado: merge aplicado e validado localmente com `thread loop` e `file references` preservados
- Inventario vivo do fork: consultar `.context/customizations.md` antes de classificar conflito ou reaplicar custom

## Features locais vivas

- `t3code-custom/file-references`: referencia de arquivos por path, colagem e envio
- `t3code-custom/chat/ThreadLoop*`: controles e comportamento de thread loop
- `t3code-custom/hooks/useComposerProviderSkills.ts`: descoberta de skills do workspace e selecao de `$skill` para turnos do Codex
- `t3code-custom/hooks/useComposerFileReferenceSend.ts`: serializacao custom no envio
- `apps/server/src/t3code-custom/workspace/internalArtifacts.ts`: artefatos internos de workspace, como `.t3code/.gitignore`
- `apps/web/src/t3code-custom/terminal/fontFamily.ts`: policy local da fonte monoespacada no terminal e blocos de codigo

## Refatoracoes feitas para sair da frente do upstream

- O composer agora usa o fluxo nativo do upstream para chips e busca de skills/slash commands
- Removido `apps/web/src/components/composerInlineTextNodes.ts`, que virou duplicacao da infraestrutura nova do upstream
- `ChatComposer.tsx` voltou a depender de `selectedProviderStatus.skills` e `selectedProviderStatus.slashCommands`, em vez de puxar catalogo paralelo so para UI
- A descoberta local de skills do workspace e a serializacao de `$skill` para envio sairam de `ChatComposer.tsx` e foram empurradas para `t3code-custom/hooks/useComposerProviderSkills.ts`, deixando o componente mais perto do upstream
- `ComposerPromptEditor.tsx` manteve o snapshot ampliado necessario para o paste custom de file references sem reabrir um fork inteiro do editor
- A placeholder custom do composer saiu de `ChatComposer.tsx` e voltou para `t3code-custom/chat/composerPlaceholder.ts`
- A orquestracao custom de envio do composer foi empurrada para `t3code-custom/hooks/useComposerSendExtension.ts`, reduzindo regra local espalhada em `ChatView.tsx`
- A UI dos chips de `file references` na timeline saiu de `MessagesTimeline.tsx` e foi puxada para `t3code-custom/chat/UserMessageFileReferencesSlot.tsx`, deixando o core so consumir um slot local
- `ComposerPromptEditor.tsx` parou de persistir estado extra de selecao no snapshot interno; a leitura ampliada agora acontece so quando precisa

## Hotspots que continuam sensiveis

- `apps/web/src/components/chat/ChatComposer.tsx`
  Continua sendo o ponto de encaixe entre UX do core e extensoes locais do composer
- `apps/web/src/components/ComposerPromptEditor.tsx`
  Qualquer mudanca de snapshot, cursor ou selection mexe direto com paste custom e chips inline
- `apps/web/src/components/ChatView.tsx`
  Ainda concentra ligacao entre envio, timeline e hooks custom, mas menos regra local ficou espalhada ali
- `apps/web/src/composerDraftStore.ts`
  Permanece hotspot compartilhado para draft, imagens, terminal context e file references
- `apps/web/src/components/chat/MessagesTimeline.tsx`
  Continua sendo fronteira entre renderizacao do core e parser dos sentinelas custom

## Regra pratica para o proximo sync

- Ler `.context/customizations.md` antes de abrir diff sensivel do fork
- Se a mudanca for UX de skill/slash command, tentar absorver do upstream primeiro
- Se a mudanca for regra de negocio local, empurrar para `t3code-custom/*`
- Se precisar tocar `ChatComposer` ou `ComposerPromptEditor`, fazer o minimo e deixar a adaptacao visivel

## 2026-04-11 — Sync 6 commits do upstream

- Merge de `upstream/main` de `e0e01b4a` ate `5467d119`
- O unico conflito textual real apareceu em `apps/web/src/store.ts`; a resolucao adotou a derivacao memoizada nova do upstream em `apps/web/src/threadDerivation.ts`
- Entraram melhorias do upstream em git e chat sem reabrir o fork do composer: diretorios git apagados deixam de quebrar a deteccao, links quebrados em varias linhas no terminal passam a abrir direito, o panel de pending user input para de roubar atalhos numericos de editores focados e mensagens do assistant agora podem ser copiadas com estado de streaming mais robusto
- `MessagesTimeline.tsx` continuou respeitando o parser custom de `file references`; a mudanca do upstream entrou por cima sem derrubar o boundary local de sentinelas
- `thread loop` continuou intacto no estado da thread: os campos `loop` no shell/store seguem vivos e os eventos `thread.loop-upserted` e `thread.loop-deleted` foram preservados
- A principal reducao de atrito desta wave foi aceitar o `threadDerivation.ts` do upstream em vez de manter derivacao duplicada dentro de `store.ts`

## 2026-04-15 — Sync ate `5e1dd56d`

- Branch de sync: `sync/upstream-2026-04-15`
- Upstream integrado: `5e1dd56d` (`upstream/main`)
- Regra dominante nesta wave: aceitar o fluxo novo do upstream e reaplicar so o diferencial local pequeno, principalmente no composer e na timeline
- `ChatComposer.tsx` ficou mais perto do upstream: a descoberta de skills do workspace e a serializacao de `$skill` continuam vivas, mas atras de `t3code-custom/hooks/useComposerProviderSkills.ts`
- `ChatView.tsx` continuou usando o send extension local para `file references` e skills do workspace, sem reabrir um fork maior do fluxo de envio
- `MessagesTimeline.tsx` preservou o parser custom de `file references`, mas o resto do comportamento continuou colado na estrutura atual do upstream
- `apps/desktop/src/preload.ts`, `packages/contracts/src/ipc.ts` e `apps/server/src/ws.ts` absorveram as novas capacidades do upstream sem perder o helper local `getPathForFile`
- `apps/server/src/persistence/Migrations.ts` preservou a migracao local `023_ProjectionThreadLoops`; as migracoes novas do upstream para shell summary/backfill foram empurradas para frente para nao corromper bancos do fork que ja conhecem o `023`
- O que foi absorvido do upstream:
  - filesystem browse API
  - shell/thread snapshot streaming
  - updates do desktop/nightly branding e titlebar
  - command palette, sidebar, markdown e runtime plumbing
- O que continuou como diferencial local:
  - `thread loop`
  - `file references` por path
  - skill discovery por workspace para turnos do Codex
  - artefatos internos `.t3code`
  - policy local da fonte mono

## 2026-04-16 — Sync ate `19d47408`

- Branch de sync: `sync/upstream-2026-04-15`
- Upstream integrado: `19d47408` (`upstream/main`)
- Regra dominante nesta wave: aceitar o fluxo novo do upstream no desktop e no layout do chat, reaplicando so o diferencial local pequeno quando ele ainda era real
- Zona de atrito prevista antes do merge:
  - `apps/desktop/src/desktopSettings.test.ts` — `adaptador-core`
  - `apps/desktop/src/desktopSettings.ts` — `adaptador-core`
  - `apps/desktop/src/main.ts` — `adaptador-core`
  - `apps/server/src/orchestration/Layers/ProjectionPipeline.ts` — `hotspot-compartilhado`
  - `apps/web/src/components/ChatView.tsx` — `hotspot-compartilhado`
  - `apps/web/src/composerDraftStore.ts` — `hotspot-compartilhado`
  - `docs/release.md` — `core-puro`
- Conflitos reais do merge:
  - so houve conflito textual no desktop: `desktopSettings.test.ts`, `desktopSettings.ts` e `main.ts`
  - `ProjectionPipeline.ts`, `ChatView.tsx` e `composerDraftStore.ts` entraram limpos, o que reduziu bastante o risco desta wave
- O que foi absorvido do upstream:
  - nightly desktop agora usa o canal nightly por default com persistencia explicita da escolha do usuario
  - `Claude Opus 4.7` entrou como modelo built-in com effort `xhigh`
  - o layout do chat absorveu os ajustes do upstream para evitar sobreposicao dos controles do composer em larguras estreitas
  - a projection passou a ignorar atividades de user input no pending approvals sem reabrir o nosso scheduler
  - `CLAUDE.md` e a documentacao de release seguiram a versao do upstream
- O que continuou como diferencial local:
  - `thread loop`
  - `file references` por path
  - skill discovery por workspace para turnos do Codex
  - artefatos internos `.t3code`
  - policy local da fonte mono
- Ajuste local adicional necessario para fechar a integracao:
  - `apps/server/src/provider/Layers/ClaudeAdapter.ts` ganhou um cast documentado para aceitar `xhigh` em `createQuery`, porque o runtime novo suporta esse effort mas a tipagem publicada do SDK ainda esta atrasada
- Validacao final:
  - `bun fmt`
  - `bun lint` passou com warnings antigos no `ChatView.tsx` e `session-logic.ts`, sem erro novo bloqueante
  - `bun typecheck`
  - `bun run test src/desktopSettings.test.ts` em `apps/desktop`
  - `bun run test src/provider/Layers/ClaudeAdapter.test.ts` em `apps/server`

## 2026-04-16 — Auditoria do snapshot pre-sync `e7c4c59a`

- Snapshot auditado: `e7c4c59a` (`fix: sincroniza estado de loop entre backend e frontend`)
- Divergencia daquele ponto contra `upstream/main` atual:
  - `6` commits atras
  - `54` commits a frente
- O snapshot misturava feature viva com ruido de branch:
  - feature viva: `thread loop`, `file references`, paste grande para `.t3code/pastes`, skills de workspace, artefatos internos `.t3code`, policy local da fonte mono
  - ruido que nao vale transplantar como feature: ajustes de CI/browser thresholds, wording de release, script de worktree, tweaks de desktop/nightly e testes de contencao do footer
- Veredito daquele estado:
  - isolamento aceitavel, mas com hotspots
  - nao era um fork cru; boa parte da regra ja estava empurrada para `t3code-custom/*`
  - ainda nao dava para chamar de `bom isolamento` por causa de `ChatComposer.tsx` e `composerDraftStore.ts`
- O que ja estava bem posicionado:
  - `MessagesTimeline.tsx` usando `UserMessageFileReferencesSlot`
  - `historyBootstrap.ts` usando o parser custom so no boundary de user message
  - `WorkspaceFileSystem.ts` chamando helper local para artefatos internos em vez de embutir regra do fork
  - `ComposerPromptEditor.tsx` com `onPasteCapture` e snapshot expandido generico, sem semantica de feature no editor
- Hotspots reais daquele estado:
  - `apps/web/src/components/chat/ChatComposer.tsx`
    diff grande contra upstream e ainda coordenando skill selection, file references, paste capture, footer budget e estados do custom extension
  - `apps/web/src/composerDraftStore.ts`
    extensao inevitavel do store compartilhado para `fileReferences`, com persistencia, hidratacao e dedupe
  - `apps/server/src/ws.ts`
    contrato cross-module para listar skills de workspace
  - `packages/contracts/src/orchestration.ts`
    hotspot estrutural por concentrar `thread loop` e `skills`
- Regra pratica derivada desta auditoria:
  - se precisarmos portar features desse snapshot, o melhor doador e o estado final ja isolado em `t3code-custom/*`, nao os commits brutos que criaram a feature
  - nao vale replay da branch inteira; vale transplante seletivo do perimetro custom e dos contratos minimos

## 2026-04-16 — Refatoracao pequena pos-auditoria

- `ChatComposer.tsx` perdeu mais um pouco de territorio custom:
  - a extensao de skills do composer saiu do componente e foi empurrada para `apps/web/src/t3code-custom/hooks/useComposerSkillExtension.ts`
  - a heuristica local de budget do footer para o controle de loop saiu da constante inline e foi movida para helper em `apps/web/src/t3code-custom/chat/useComposerCustomExtension.tsx`
- Resultado:
  - `ChatComposer.tsx` continua hotspot, mas com menos regra local espalhada
  - a feature de skills agora fica atras de um hook custom especifico, em vez de misturar descoberta + menu building no core
