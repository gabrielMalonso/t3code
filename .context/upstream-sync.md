# Upstream Sync

## Status atual

- Data: 2026-04-23
- Branch de trabalho: `sync/upstream-2026-04-23`
- Upstream integrado nesta wave: `ada410bc` (`upstream/main`)
- Estado: merge aplicado e validado localmente com `thread loop`, `file references`, `showPlanSidebar` e `skills de workspace` preservados
- Inventario vivo do fork: consultar `.context/customizations.md` antes de classificar conflito ou reaplicar custom

## Features locais vivas

- `t3code-custom/file-references`: referencia de arquivos por path, colagem e envio
- `t3code-custom/chat/ThreadLoop*`: controles e comportamento de thread loop
- `showPlanSidebar`: toggle local para desligar a Plan/Tasks sidebar e impedir auto-open
- `t3code-custom/hooks/useComposerProviderSkills.ts`: descoberta de skills do workspace e selecao de `$skill` para turnos do Codex
- `t3code-custom/hooks/useComposerFileReferenceSend.ts`: serializacao custom no envio
- `apps/server/src/t3code-custom/workspace/internalArtifacts.ts`: artefatos internos de workspace, como `.t3code/.gitignore`
- `apps/web/src/t3code-custom/terminal/fontFamily.ts`: policy local da fonte monoespacada no terminal e blocos de codigo

## Refatoracoes feitas para sair da frente do upstream

- O composer agora usa o fluxo nativo do upstream para chips e busca de skills/slash commands
- Removido `apps/web/src/components/composerInlineTextNodes.ts`, que virou duplicacao da infraestrutura nova do upstream
- `ChatComposer.tsx` voltou a depender de `selectedProviderStatus.skills` e `selectedProviderStatus.slashCommands`, em vez de puxar catalogo paralelo so para UI
- A extensao local de `skills de workspace` voltou a existir como overlay pequeno em cima das `skills` nativas do upstream, sem reabrir um fork inteiro do composer
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
- Se a mudanca for UX de skill/slash command, absorver o fluxo nativo do upstream e reaplicar so a descoberta/serializacao local que ainda for diferencial real
- Se a mudanca for regra de negocio local, empurrar para `t3code-custom/*`
- Se precisar tocar `ChatComposer` ou `ComposerPromptEditor`, fazer o minimo e deixar a adaptacao visivel

## 2026-04-23 — Sync ate `ada410bc`

- Branch de sync: `sync/upstream-2026-04-23`
- Donor local usado para replay seletivo: `d633e440` (`Sync upstream Codex runtime and UI updates`)
- Regra dominante desta wave: aceitar o upstream primeiro e usar o sync para reduzir superficie do fork, nao para mumificar custom antigo
- Zona de atrito prevista antes do merge:
  - `apps/server/src/persistence/Migrations.ts` — `hotspot-compartilhado`
  - `apps/web/src/components/ChatView.tsx` — `hotspot-compartilhado`
  - `apps/web/src/components/chat/ChatComposer.tsx` — `hotspot-compartilhado`
  - `apps/web/src/components/settings/SettingsPanels.tsx` — `adaptador-core`
  - `packages/contracts/src/settings.ts` — `adaptador-core`
- Conflitos reais do merge:
  - `apps/server/src/persistence/Migrations.ts`
  - `apps/web/src/components/ChatView.tsx`
  - `apps/web/src/components/settings/SettingsPanels.tsx`
  - `apps/web/src/components/chat/TraitsPicker.browser.tsx`
- O que foi absorvido do upstream:
  - `autoOpenPlanSidebar` separado de `showPlanSidebar`
  - fixes de `Claude cwd resume`, `CODEX_HOME` com `~`, cache atomico e comandos localizados no Windows
  - refactor de model selection para option arrays, com migracao nova carregada como `028_CanonicalizeModelSelectionOptions`
  - cleanup do `TraitsPicker.browser.tsx` e fluxo novo do composer para `skills` nativas
- O que foi reaplicado do custom vivo:
  - `thread loop`
  - `file references` por path
  - `showPlanSidebar` como gate local de visibilidade, coexistindo com `autoOpenPlanSidebar`
  - artefatos internos `.t3code`
  - policy local da fonte mono
- O que foi deliberadamente deixado de fora do replay inicial:
  - nada permanente; a customizacao de `skills de workspace` foi recolocada em seguida por pedido explicito do usuario
- Resultado do reencaixe:
  - `file references` e `thread loop` continuam como `perimetro-custom` com adaptadores pequenos
  - `showPlanSidebar` ficou como `adaptador-core`
  - `skills de workspace` voltou como `hotspot-compartilhado`, mas atras de hooks/RPC pequenos em vez de branch paralela maior
- Validacao final:
  - `bun fmt`
  - `bun lint` passou com warnings antigos de hooks em `ChatView.tsx` e avisos informativos de outros pacotes, sem erro bloqueante
  - `bun typecheck`

## 2026-04-23 — Reinstalacao da customizacao de skills

- Pedido explicito do usuario: restaurar a customizacao de `skills de workspace` depois do sync
- O que voltou:
  - `apps/web/src/t3code-custom/hooks/useComposerProviderSkills.ts`
  - `apps/web/src/t3code-custom/hooks/useComposerSkillExtension.ts`
  - `apps/web/src/providerSkillSelections.test.ts`
  - passagem de `skills` em `ChatComposer`, `ChatView`, contracts, RPC, `ProviderService`, `CodexAdapter`, `CodexSessionRuntime`, `decider`, `ProviderCommandReactor` e `ws.ts`
- Regra que guiou a reinstalacao:
  - manter o fluxo visual do upstream no composer e recolocar so o overlay local de descoberta por workspace + serializacao para envio
- Validacao:
  - `bun fmt`
  - `bun lint`
  - `bun typecheck`

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

## 2026-04-19 — Sync ate `9df3c640`

- Branch de trabalho: `main`
- Donor local usado para replay seletivo: `6a818b04` (`Add plan sidebar visibility setting`)
- Regra dominante desta wave: aceitar o core do upstream primeiro e reaplicar so o diferencial vivo do fork, sem reabrir o composer inteiro
- Zona de atrito prevista antes do merge:
  - `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` — `hotspot-compartilhado`
  - `apps/server/src/server.ts` — `adaptador-core`
  - `apps/server/src/ws.ts` — `hotspot-compartilhado`
  - `apps/server/src/persistence/Migrations.ts` — `hotspot-compartilhado`
  - `apps/web/src/components/chat/ChatComposer.tsx` — `hotspot-compartilhado`
  - `packages/contracts/src/settings.ts` — `adaptador-core`
- Conflitos reais do merge:
  - `ProviderRuntimeIngestion.ts`, `server.ts`, `ws.ts`, `Migrations.ts`, `ChatComposer.tsx`, `settings.ts` e alguns testes de desktop/server/web
  - nao houve conflito textual em `ChatView.tsx`, `MessagesTimeline.tsx`, `composerDraftStore.ts` ou `historyBootstrap.ts`, o que poupou uma boa quantidade de sangue
- O que foi absorvido do upstream:
  - suporte ACP com Cursor provider
  - provider `opencode`
  - thread deletion reactor
  - session reaper
  - Node-native TypeScript no server/desktop
  - configurable project grouping
  - ajustes de terminal/global shortcuts, command palette e release pipeline
- O que foi reaplicado do custom vivo:
  - `thread loop`, incluindo eventos detalhados na WS e start do scheduler no reactor
  - `file references` por path e paste grande para `.t3code/pastes`
  - descoberta de skills do workspace para turnos do Codex
  - `showPlanSidebar` no schema de settings, painel de settings e gates de auto-open
  - artefatos internos `.t3code/.gitignore`
- O que foi deliberadamente nao reaplicado:
  - qualquer ruído antigo de CI/browser thresholds
  - runner local antigo em `.github/workflows/ci.yml`; a wave aceitou o `blacksmith-8vcpu-ubuntu-2404` do upstream
  - duplicacao de imports/paths antigos sem `.ts` onde o upstream ja migrou o modulo
- Decisao sensivel desta wave:
  - `apps/server/src/persistence/Migrations.ts` preservou a nossa `023_ProjectionThreadLoops`
  - as migracoes de shell summary ficaram em `024` e `025` no fork
  - a limpeza de pending approvals do upstream entrou como `026` logica, importando a implementacao do arquivo `025_CleanupInvalidProjectionPendingApprovals.ts`
  - isso evita quebrar bancos do fork que ja conhecem a `023` local de loop
- Resultado pratico:
  - o reencaixe ficou majoritariamente em `adaptador-core`
  - os hotspots reais continuam sendo `ProviderRuntimeIngestion.ts`, `ws.ts`, `ChatComposer.tsx` e `Migrations.ts`
  - o sync diminuiu conflito futuro porque absorveu o core novo de providers/runtime sem reaplicar custom morto
- Validacao final:
  - `bun install`
  - `bun fmt`
  - `bun lint`
  - `bun typecheck`
  - `bun run test src/server.test.ts src/orchestration/Layers/OrchestrationReactor.test.ts` em `apps/server`
  - `bun run test src/localApi.test.ts src/components/chat/TraitsPicker.browser.tsx` em `apps/web`

## 2026-04-22 — Sync ate `b8305afa`

- Branch de trabalho: `sync/upstream-2026-04-22`
- Donor local usado para replay seletivo: `65df1de0` (`Track thread bootstrap phases during worktree setup`)
- Regra dominante desta wave: aceitar a arquitetura nova do upstream no provider/runtime do Codex e reaplicar so o diferencial vivo do fork em cima dela
- Zona de atrito prevista antes do merge:
  - `apps/desktop/src/clientPersistence.test.ts` — `adaptador-core`
  - `apps/server/src/codexAppServerManager.ts` — `core-puro`
  - `apps/server/src/codexAppServerManager.test.ts` — `core-puro`
  - `apps/server/src/provider/Layers/CodexAdapter.ts` — `hotspot-compartilhado`
  - `apps/web/src/components/chat/ChatComposer.tsx` — `hotspot-compartilhado`
  - `apps/web/src/localApi.test.ts` — `adaptador-core`
  - `packages/contracts/src/settings.ts` — `adaptador-core`
- Conflitos reais do merge:
  - `apps/desktop/src/clientPersistence.test.ts`
  - `apps/server/src/codexAppServerManager.ts`
  - `apps/server/src/codexAppServerManager.test.ts`
  - `apps/server/src/provider/Layers/CodexAdapter.ts`
  - `apps/web/src/components/chat/ChatComposer.tsx`
  - `apps/web/src/localApi.test.ts`
  - `packages/contracts/src/settings.ts`
- O que foi absorvido do upstream:
  - runtime tipado do Codex via `effect-codex-app-server`
  - refactor pesado de providers/session runtime no server
  - redesign do model picker e ajustes de sidebar/toasts/UI
  - helper de reveal de janela no desktop
  - `favorites` nos client settings
- O que foi reaplicado do custom vivo:
  - `showPlanSidebar` coexistindo com `favorites` em `packages/contracts/src/settings.ts`
  - descoberta de skills do workspace para turnos do Codex
  - suporte a `skills` no fluxo novo `CodexAdapter -> CodexSessionRuntime -> turn/start`
  - gatilhos e placeholder custom do composer sem reabrir o fork inteiro do model picker novo
- O que foi deliberadamente deixado de fora do replay:
  - `apps/server/src/codexAppServerManager.ts` e `apps/server/src/codexAppServerManager.test.ts`
  - qualquer tentativa de ressuscitar o manager antigo do Codex depois que o upstream moveu tudo para runtime tipado
  - branch de modelo antigo no `ChatComposer`; o picker novo do upstream ficou no comando
- Decisao sensivel desta wave:
  - `apps/server/src/provider/codexAppServer.ts` nao voltou como dependencia estrutural
  - a descoberta custom de skills passou a reaproveitar `CodexProvider.ts`
  - o replay de `skills` entrou no `CodexSessionRuntime.ts` como item `type: "skill"` em `turn/start`, que casa com o protocolo novo do app-server
- Resultado pratico:
  - o reencaixe ficou entre `adaptador-core` e `hotspot-compartilhado`
  - `ChatComposer.tsx`, `apps/server/src/ws.ts`, `apps/server/src/provider/Layers/CodexAdapter.ts` e `apps/server/src/provider/Layers/CodexSessionRuntime.ts` seguem sendo pontos de contato reais
  - o sync diminuiu conflito futuro porque aceitou o runtime novo do upstream em vez de carregar um fork paralelo do provider Codex
- Validacao final:
  - `bun install`
  - `bun fmt`
  - `bun lint`
  - `bun typecheck`
