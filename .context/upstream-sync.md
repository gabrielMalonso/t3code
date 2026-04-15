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
