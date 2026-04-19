# Inventario de Customizacoes

Este arquivo e a fonte de verdade do fork para sync com `upstream/main`.

Use assim:

- leia este arquivo depois de `.context/upstream-sync.md`
- trate cada item como custom vivo, nao como detalhe acidental
- quando tocar uma feature listada aqui, atualize os arquivos, simbolos e pontos de contato

Diagrama rapido:

```text
upstream core
  -> adaptador pequeno no core
  -> helper/slot local
  -> custom vivo do fork
```

Regra pratica:

- se o conflito estiver no helper/slot local, preserve o nosso perimetro
- se o conflito estiver no adaptador do core, aceite o upstream e reaplique so o diferencial real
- se o upstream cobrir a mesma UX, apague a duplicacao local

## Custom vivo

| Feature                                     | Tipo              | Fonte de verdade                                                                                                                                                                                                                                                                          | Pontos de contato no core                                                                                                                                                                                                                         | Regra de conflito                                                                                           |
| ------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| File references por path                    | web custom        | `apps/web/src/t3code-custom/file-references/*`, `apps/web/src/t3code-custom/hooks/useComposerFileReferenceSend.ts`, `apps/web/src/t3code-custom/hooks/useComposerPasteFileReference.ts`, `apps/web/src/t3code-custom/chat/UserMessageFileReferencesSlot.tsx`                              | `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/ChatComposer.tsx`, `apps/web/src/components/chat/MessagesTimeline.tsx`, `apps/web/src/composerDraftStore.ts`, `apps/web/src/historyBootstrap.ts`                            | preservar o parser e a serializacao local; no core, manter so adaptadores pequenos                          |
| Thread loop por thread                      | web custom        | `apps/web/src/t3code-custom/chat/ThreadLoopControl.tsx`, `apps/web/src/t3code-custom/hooks/useThreadLoopActions.ts`, `apps/server/src/orchestration/Layers/ThreadLoopScheduler.ts`                                                                                                        | `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/ChatComposer.tsx`, `apps/server/src/orchestration/*`, `packages/contracts/src/orchestration.ts`                                                                             | contracts e scheduler sao hotspot real; UI deve continuar no perimetro custom                               |
| Visibilidade da Plan sidebar                | web custom leve   | `packages/contracts/src/settings.ts`, `apps/web/src/components/settings/SettingsPanels.tsx`                                                                                                                                                                                                | `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/ChatComposer.tsx`, `apps/web/src/localApi.ts`, `apps/desktop/src/clientPersistence.ts`                                                                                      | manter o setting local ate o upstream ganhar equivalente; gates do auto-open devem continuar pequenos       |
| Skills de workspace para turnos do Codex    | web+server custom | `apps/web/src/t3code-custom/hooks/useComposerProviderSkills.ts`, `apps/web/src/t3code-custom/hooks/useComposerSkillExtension.ts`, `apps/server/src/provider/Layers/ProviderService.ts`, `apps/server/src/ws.ts`, `packages/contracts/src/provider.ts`, `packages/contracts/src/server.ts` | `apps/web/src/components/chat/ChatComposer.tsx`, `apps/web/src/components/ChatView.tsx`, `packages/contracts/src/rpc.ts`, `apps/web/src/environmentApi.ts`, `apps/web/src/localApi.ts`, `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts` | no web, manter o composer so consumindo hooks custom; contracts e bridge seguem hotspot manual              |
| Artefatos internos do workspace (`.t3code`) | server custom     | `apps/server/src/t3code-custom/workspace/internalArtifacts.ts`                                                                                                                                                                                                                            | `apps/server/src/workspace/Layers/WorkspaceFileSystem.ts`                                                                                                                                                                                         | se upstream mexer no workspace file system, manter o core generico e reaplicar so a chamada do helper local |
| Fonte monoespacada do terminal/codigo       | web custom leve   | `apps/web/src/t3code-custom/terminal/fontFamily.ts`, `apps/web/src/index.css`                                                                                                                                                                                                             | `apps/web/src/components/ThreadTerminalDrawer.tsx`                                                                                                                                                                                                | manter o drawer so lendo o helper; qualquer policy visual fica fora dele                                    |

## Pontos de contato atuais

### File references por path

- Perimetro local:
  - `apps/web/src/t3code-custom/file-references/*`
  - `apps/web/src/t3code-custom/hooks/useComposerFileReferenceSend.ts`
  - `apps/web/src/t3code-custom/hooks/useComposerPasteFileReference.ts`
- Adaptadores do core:
  - `apps/web/src/components/ChatView.tsx:157-158,1426`
  - `apps/web/src/components/chat/ChatComposer.tsx:102-103,1454,1977`
  - `apps/web/src/components/chat/MessagesTimeline.tsx:62,308`
  - `apps/web/src/composerDraftStore.ts:45,214,374-377,493`
  - `apps/web/src/historyBootstrap.ts:2,41`

### Thread loop por thread

- Perimetro local:
  - `apps/web/src/t3code-custom/chat/ThreadLoopControl.tsx`
  - `apps/web/src/t3code-custom/chat/ComposerThreadLoopSlot.tsx`
  - `apps/web/src/t3code-custom/hooks/useThreadLoopActions.ts`
- Hotspots compartilhados:
  - `apps/web/src/store.ts:1285-1292`
  - `apps/server/src/orchestration/Layers/ThreadLoopScheduler.ts:71,142,157`
  - `apps/server/src/orchestration/decider.ts:344-381,604-624`
  - `apps/server/src/orchestration/projector.ts:363-374`
  - `packages/contracts/src/orchestration.ts:420-430,654,698-699,971-976`

### Visibilidade da Plan sidebar

- Fonte de verdade:
  - `packages/contracts/src/settings.ts`
  - `apps/web/src/components/settings/SettingsPanels.tsx`
- Adaptadores do core:
  - `apps/web/src/components/ChatView.tsx`
  - `apps/web/src/components/chat/ChatComposer.tsx`
  - `apps/web/src/localApi.ts`
  - `apps/desktop/src/clientPersistence.ts`
- Motivo:
  - manter a sidebar do plano como capacidade opcional do fork, sem espalhar regra local por todo o layout do chat

### Skills de workspace para turnos do Codex

- Perimetro local:
  - `apps/web/src/t3code-custom/hooks/useComposerProviderSkills.ts`
  - `apps/web/src/t3code-custom/hooks/useComposerSkillExtension.ts`
- Hotspots compartilhados:
  - `apps/web/src/components/chat/ChatComposer.tsx`
  - `apps/web/src/components/ChatView.tsx`
  - `apps/server/src/provider/Layers/ProviderService.ts`
  - `apps/server/src/ws.ts`
  - `packages/contracts/src/provider.ts`
  - `packages/contracts/src/server.ts`
  - `packages/contracts/src/rpc.ts`
  - `apps/web/src/environmentApi.ts`
  - `apps/web/src/localApi.ts`
  - `apps/desktop/src/main.ts`
  - `apps/desktop/src/preload.ts`

### Artefatos internos do workspace

- Perimetro local:
  - `apps/server/src/t3code-custom/workspace/internalArtifacts.ts:10-12,21-50`
- Adaptador do core:
  - `apps/server/src/workspace/Layers/WorkspaceFileSystem.ts:3,36-64`
- Motivo:
  - garantir `.t3code/.gitignore` sem transformar `WorkspaceFileSystem` em modulo do fork

### Fonte monoespacada do terminal/codigo

- Perimetro local:
  - `apps/web/src/t3code-custom/terminal/fontFamily.ts:1-13`
- Adaptadores do core:
  - `apps/web/src/components/ThreadTerminalDrawer.tsx:22,301-308`
  - `apps/web/src/index.css:7,72-75,170-172`
- Motivo:
  - manter a policy tipografica local fora do drawer, deixando o core so consumir um helper e uma CSS variable

## Checklist quando houver conflito

1. Encontrou um arquivo desta lista no diff com `upstream/main`:
   - compare primeiro o arquivo local de perimetro custom
2. O conflito apareceu no core:
   - procure a chamada do helper/slot local antes de sair mesclando bloco inteiro
3. O upstream trouxe versao nativa parecida:
   - aceite a dele e reduza o nosso diferencial ao minimo
4. Terminou a resolucao:
   - atualize este inventario e `.context/upstream-sync.md`
