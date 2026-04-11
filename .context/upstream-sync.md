# Upstream Sync

## Status atual

- Data: 2026-04-11
- Branch de trabalho: `main`
- Upstream integrado nesta wave: `5467d11980e2b41e4cf5c8d1c5fe972532da3a74` (`upstream/main`)
- Estado: merge aplicado e validado localmente com `thread loop` e `file references` preservados

## Features locais vivas

- `t3code-custom/file-references`: referencia de arquivos por path, colagem e envio
- `t3code-custom/chat/ThreadLoop*`: controles e comportamento de thread loop
- `t3code-custom/hooks/useComposerFileReferenceSend.ts`: serializacao custom no envio
- `t3code-custom/chat/useComposerSkillExtension.ts`: mapeia skills do Codex selecionadas no prompt para `{ name, path }` no send

## Refatoracoes feitas para sair da frente do upstream

- O composer agora usa o fluxo nativo do upstream para chips e busca de skills/slash commands
- Removido `apps/web/src/components/composerInlineTextNodes.ts`, que virou duplicacao da infraestrutura nova do upstream
- A logica custom de skill ficou reduzida ao que realmente e local: derivar `selectedSkills` para o envio do Codex
- `ChatComposer.tsx` voltou a depender de `selectedProviderStatus.skills` e `selectedProviderStatus.slashCommands`, em vez de puxar catalogo paralelo so para UI
- `ComposerPromptEditor.tsx` manteve o snapshot ampliado necessario para o paste custom de file references sem reabrir um fork inteiro do editor
- A placeholder custom do composer saiu de `ChatComposer.tsx` e voltou para `t3code-custom/chat/composerPlaceholder.ts`
- A orquestracao custom de envio do composer foi empurrada para `t3code-custom/hooks/useComposerSendExtension.ts`, reduzindo regra local espalhada em `ChatView.tsx`
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
