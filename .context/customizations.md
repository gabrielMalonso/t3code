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

| Feature                                     | Tipo              | Fonte de verdade                                                                                                                                                                                                                                                                                                                                                                                                                                           | Pontos de contato no core                                                                                                                                                                                                                                                                                                                                                                                             | Regra de conflito                                                                                                                               |
| ------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| File references por path                    | web custom        | `apps/web/src/t3code-custom/file-references/*`, `apps/web/src/t3code-custom/hooks/useComposerFileReferenceSend.ts`, `apps/web/src/t3code-custom/hooks/useComposerPasteFileReference.ts`, `apps/web/src/t3code-custom/chat/UserMessageFileReferencesSlot.tsx`                                                                                                                                                                                               | `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/ChatComposer.tsx`, `apps/web/src/components/chat/MessagesTimeline.tsx`, `apps/web/src/composerDraftStore.ts`, `apps/web/src/historyBootstrap.ts`                                                                                                                                                                                                | preservar o parser e a serializacao local; no core, manter so adaptadores pequenos                                                              |
| Thread loop por thread                      | web custom        | `apps/web/src/t3code-custom/chat/ThreadLoopControl.tsx`, `apps/web/src/t3code-custom/hooks/useThreadLoopActions.ts`, `apps/server/src/orchestration/Layers/ThreadLoopScheduler.ts`                                                                                                                                                                                                                                                                         | `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/ChatComposer.tsx`, `apps/server/src/orchestration/*`, `packages/contracts/src/orchestration.ts`                                                                                                                                                                                                                                                 | contracts e scheduler sao hotspot real; UI deve continuar no perimetro custom                                                                   |
| Visibilidade da Plan sidebar                | web custom leve   | `packages/contracts/src/settings.ts`, `apps/web/src/components/settings/SettingsPanels.tsx`                                                                                                                                                                                                                                                                                                                                                                | `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/ChatComposer.tsx`, `apps/web/src/localApi.ts`, `apps/desktop/src/settings/DesktopClientSettings.ts`                                                                                                                                                                                                                                             | manter o setting local ate o upstream ganhar equivalente; gates do auto-open devem continuar pequenos                                           |
| Skills de workspace para turnos do Codex    | web+server custom | `apps/web/src/t3code-custom/hooks/useComposerProviderSkills.ts`, `apps/web/src/t3code-custom/hooks/useComposerSkillExtension.ts`, `apps/server/src/provider/Layers/ProviderService.ts`, `apps/server/src/provider/Layers/CodexAdapter.ts`, `apps/server/src/provider/Layers/CodexSessionRuntime.ts`, `apps/server/src/provider/Layers/CodexProvider.ts`, `apps/server/src/ws.ts`, `packages/contracts/src/provider.ts`, `packages/contracts/src/server.ts` | `apps/web/src/components/chat/ChatComposer.tsx`, `apps/web/src/components/ChatView.tsx`, `packages/contracts/src/rpc.ts`, `packages/client-runtime/src/wsRpcClient.ts`, `apps/web/src/environmentApi.ts`, `apps/web/src/localApi.ts`, `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `packages/contracts/src/providerInstance.ts`                                                                         | no web, manter o composer so consumindo hooks custom; no server, aceitar `ProviderInstanceId` do upstream e reaplicar skills como overlay Codex |
| Computer Use via MCP elicitation            | server custom     | `apps/server/src/t3code-custom/provider/mcpElicitationPolicy.ts`                                                                                                                                                                                                                                                                                                                                                                                           | `apps/server/src/provider/Layers/CodexSessionRuntime.ts`, `apps/server/src/provider/Layers/CodexAdapter.ts`                                                                                                                                                                                                                                                                                                           | aceitar runtime/protocolo upstream e preservar so o handler de `mcpServer/elicitation/request` mais a policy local de Allow/Deny                |
| Artefatos internos do workspace (`.t3code`) | server custom     | `apps/server/src/t3code-custom/workspace/internalArtifacts.ts`                                                                                                                                                                                                                                                                                                                                                                                             | `apps/server/src/workspace/Layers/WorkspaceFileSystem.ts`                                                                                                                                                                                                                                                                                                                                                             | se upstream mexer no workspace file system, manter o core generico e reaplicar so a chamada do helper local                                     |
| Fonte monoespacada do terminal/codigo       | web custom leve   | `apps/web/src/t3code-custom/terminal/fontFamily.ts`, `apps/web/src/index.css`                                                                                                                                                                                                                                                                                                                                                                              | `apps/web/src/components/ThreadTerminalDrawer.tsx`                                                                                                                                                                                                                                                                                                                                                                    | manter o drawer so lendo o helper; qualquer policy visual fica fora dele                                                                        |
| App mobile Capacitor                        | mobile+web custom | `apps/mobile/*`, `apps/web/src/mobile/*`, `docs/mobile-capacitor-tailscale.md`                                                                                                                                                                                                                                                                                                                                                                             | `packages/client-runtime/src/environmentConnection.ts`, `apps/web/src/routes/__root.tsx`, `apps/web/src/environments/runtime/service.ts`, `apps/web/src/environments/runtime/catalog.ts`, `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/ChatHeader.tsx`, `apps/web/src/components/chat/MessagesTimeline.tsx`, `apps/web/src/components/ProjectScriptsControl.tsx`, `apps/web/src/localApi.ts` | preservar o app no monorepo; no core, manter so guards/adaptadores pequenos atras de `isMobileCapacitorRuntime()`                               |
| Annotations/point-and-shoot composer        | server+web custom | `apps/annotations/*`, `apps/server/src/annotationsBridge.ts`, `apps/server/src/annotationsBridgeHttp.ts`, `apps/server/src/externalComposerIntake.ts`, `packages/contracts/src/annotationsBridge.ts`, `packages/contracts/src/externalComposerIntake.ts`                                                                                                                                                                                                   | `apps/server/src/server.ts`, `apps/server/src/ws.ts`, `packages/contracts/src/rpc.ts`, `packages/client-runtime/src/wsRpcClient.ts`, `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/settings/ConnectionsSettings.tsx`                                                                                                                                                                               | manter bridge/intake atras de endpoints/RPC custom pequenos; aceitar auth/runtime upstream e nao acoplar ao upstream mobile                     |
| Auto-update desktop opt-in                  | desktop custom    | `scripts/build-desktop-artifact.ts`                                                                                                                                                                                                                                                                                                                                                                                                                        | `apps/desktop/src/main.ts`, `apps/desktop/src/updateState.ts`, `.github/workflows/release.yml`                                                                                                                                                                                                                                                                                                                        | nao deixar builds do fork herdarem `GITHUB_REPOSITORY` e apontarem para releases upstream; feed de update precisa ser opt-in explicito          |
| Fallbacks de editor macOS/Ghostty           | server custom     | `apps/server/src/process/externalLauncher.ts`, `packages/contracts/src/editor.ts`                                                                                                                                                                                                                                                                                                                                                                          | `apps/server/src/ws.ts`, `apps/server/src/process/externalLauncher.test.ts`                                                                                                                                                                                                                                                                                                                                           | aceitar `ExternalLauncher` upstream e reaplicar so deteccao/fallback macOS-Ghostty que continuar diferencial real                               |

## Custom descartado

| Feature  | Status   | Arquivos removidos                                                                                                                                                                                                                              | Regra futura                                                                                 |
| -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| OpenPets | removido | `apps/server/src/openpets/*`, `apps/server/src/orchestration/Layers/OpenPetsReactor.ts`, `apps/server/src/orchestration/Services/OpenPetsReactor.ts`, `apps/web/src/components/settings/openPetsStatus.ts`, contratos/RPC/settings relacionados | tratar como custom arqueologico; nao reaplicar em proximos syncs, mesmo se aparecer no donor |

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
  - `apps/server/src/orchestration/Layers/ThreadLoopScheduler.ts`
  - `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
  - `apps/server/src/orchestration/decider.ts:344-381,604-624`
  - `apps/server/src/orchestration/projector.ts:363-374`
  - `packages/contracts/src/orchestration.ts:420-430,654,698-699,971-976`
- Regra pos VCS/source-control upstream:
  - `ThreadLoopScheduler` deve ler estado por `ProjectionSnapshotQuery.getCommandReadModel()`
  - `getCommandReadModel()` precisa hidratar `thread.loop` e sanitizar boot session/latest turn do mesmo jeito relevante para comandos
  - se esse contrato quebrar, loops de thread podem ficar presos em turn antigo ou ser apagados como stale; isso nao e detalhe de teste, e bug de produto

### Visibilidade da Plan sidebar

- Fonte de verdade:
  - `packages/contracts/src/settings.ts`
  - `apps/web/src/components/settings/SettingsPanels.tsx`
- Adaptadores do core:
  - `apps/web/src/components/ChatView.tsx`
  - `apps/web/src/components/chat/ChatComposer.tsx`
  - `apps/web/src/localApi.ts`
  - `apps/desktop/src/settings/DesktopClientSettings.ts`
- Motivo:
  - manter a sidebar do plano como capacidade opcional do fork, sem espalhar regra local por todo o layout do chat

### Skills de workspace para turnos do Codex

- Perimetro local:
  - `apps/web/src/t3code-custom/hooks/useComposerProviderSkills.ts`
  - `apps/web/src/t3code-custom/hooks/useComposerSkillExtension.ts`
- Regra pos Multi-Provider:
  - `ProviderInstanceId` e o registry upstream sao a fonte de identidade de provider
  - `ProviderDriverKind` deve ser usado so para filtrar a descoberta de skills do Codex
  - nao trazer `ProviderKind` de volta; isso agora e custom arqueologico
- Hotspots compartilhados:
  - `apps/web/src/components/chat/ChatComposer.tsx`
  - `apps/web/src/components/ChatView.tsx`
  - `apps/server/src/provider/Layers/ProviderService.ts`
  - `apps/server/src/provider/Layers/CodexAdapter.ts`
  - `apps/server/src/provider/Layers/CodexSessionRuntime.ts`
  - `apps/server/src/provider/Layers/CodexProvider.ts`
  - `apps/server/src/ws.ts`
  - `packages/contracts/src/provider.ts`
  - `packages/contracts/src/server.ts`
  - `packages/contracts/src/providerInstance.ts`
  - `packages/contracts/src/rpc.ts`
  - `packages/client-runtime/src/wsRpcClient.ts`
  - `apps/web/src/environmentApi.ts`
  - `apps/web/src/localApi.ts`
  - `apps/desktop/src/main.ts`
  - `apps/desktop/src/preload.ts`
  - `apps/desktop/src/ipc/*`
- Regra adicional:
  - se o upstream mexer no runtime do Codex, aceitar o fluxo novo e reaplicar so a passagem de `skills` como item do protocolo, sem recriar manager paralelo
  - se o upstream mexer em provider instances, manter `listProviderSkills` como RPC local pequeno, sem criar registry paralelo
  - se o upstream mexer em `ws.ts` junto com VCS/source-control, preservar `listProviderSkills` dentro do RPC atual e seguir `GitWorkflowService`/`VcsStatusBroadcaster` em vez de restaurar servicos Git antigos

### Computer Use via MCP elicitation

- Fonte de verdade:
  - `apps/server/src/t3code-custom/provider/mcpElicitationPolicy.ts`
- Adaptadores do core:
  - `apps/server/src/provider/Layers/CodexSessionRuntime.ts`
  - `apps/server/src/provider/Layers/CodexAdapter.ts`
- Motivo:
  - o app-server do Codex pode pedir autorizacao para Computer Use via `mcpServer/elicitation/request`
  - sem esse handler, o MCP server fica aguardando resposta e chamadas como `get_app_state` podem expirar
- Regra de conflito:
  - aceitar mudancas upstream no runtime/protocolo do Codex primeiro
  - preservar o registro do handler `mcpServer/elicitation/request` enquanto o upstream nao oferecer equivalente nativo
  - manter labels, conversao `Allow`/`Deny` e qualquer futura allowlist/persistencia dentro de `t3code-custom/provider/mcpElicitationPolicy.ts`
  - nao recriar um fluxo paralelo de Computer Use; continuar usando o painel existente de `user-input.requested`

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

### App mobile Capacitor

- Decisao de repositorio:
  - manter dentro deste fork/monorepo, nao extrair para projeto paralelo enquanto o app for um cliente nativo do mesmo `apps/web` e do mesmo backend T3 Code
  - apos merge na `main`, a worktree pode ser apagada; a feature viva passa a ser a branch principal do fork
- Perimetro local:
  - `apps/mobile/*`
  - `apps/web/src/mobile/MobileNeutralSurface.tsx`
  - `apps/web/src/mobile/assets.ts`
  - `apps/web/src/mobile/pairingTarget.ts`
  - `apps/web/src/mobile/profileStorage.ts`
  - `apps/web/src/mobile/runtime.ts`
  - `apps/web/src/mobile/platform.ts`
  - `apps/web/src/mobile/statusBar.ts`
  - `docs/mobile-capacitor-tailscale.md`
- Adaptadores do core:
  - `apps/web/src/routes/__root.tsx`
  - `apps/web/src/environments/runtime/catalog.ts`
  - `apps/web/src/environments/runtime/connection.ts`
  - `apps/web/src/environments/runtime/index.ts`
  - `packages/client-runtime/src/environmentConnection.ts`
  - `apps/web/src/localApi.ts`
  - `apps/web/src/rpc/requestLatencyState.ts`
  - `apps/web/src/rpc/serverState.ts`
  - `apps/web/src/rpc/wsConnectionState.ts`
  - `apps/web/src/hooks/useTheme.ts`
  - `apps/web/src/index.css`
- Hotspots compartilhados:
  - `apps/web/src/environments/runtime/service.ts`
  - `apps/web/src/components/ChatView.tsx`
  - `apps/web/src/components/ComposerPromptEditor.tsx`
  - `apps/web/src/components/chat/ChatHeader.tsx`
  - `apps/web/src/components/chat/HeaderOverflowMenu.tsx`
  - `apps/web/src/components/chat/MessagesTimeline.tsx`
  - `apps/web/src/components/chat/OpenInPicker.tsx`
  - `apps/web/src/components/ProjectScriptsControl.tsx`
  - `apps/web/src/components/Sidebar.tsx`
  - `apps/web/package.json`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
- Invariantes:
  - app mobile abre em estado neutro, sem `primary environment`, `LocalApi`, server state ou WebSocket antes de um profile ativo
  - so um profile mobile pode ficar ativo por vez
  - Tailscale e LAN podem apontar para o mesmo server, mas devem usar profiles e bearer tokens separados
  - app mobile conectado nao monta o gerenciador global de environments; reconnect apos background/resume deve ficar em `apps/web/src/mobile/runtime.ts` e no bootstrap mobile do root
  - `App.resume`, `visibilitychange` e `pageshow` devem reconectar apenas se o heartbeat do `WsTransport` estiver stale
  - assets autenticados devem usar o `httpBaseUrl` do profile ativo, nao o primeiro profile encontrado para o mesmo `environmentId`
  - imagens e favicons autenticados no mobile devem passar por fetch bearer-aware antes de virar blob URL
  - fechar environment mobile deve limpar conexao, stores volateis, estado de WebSocket/RPC e blobs
  - apos a extracao upstream para `packages/client-runtime`, o tipo de conexao `mobile` precisa continuar aceito em `packages/client-runtime/src/environmentConnection.ts`
- Regra adicional de conflito:
  - se o upstream mexer em root/bootstrap/runtime, aceite o fluxo upstream primeiro e reaplique apenas o bypass mobile neutro
  - se o upstream mexer em reconnect/resume do browser, nao montar `startEnvironmentConnectionService()` no mobile conectado so para herdar isso; reaplique o diferencial no runtime mobile
  - se o upstream mexer em layout mobile/safe-area/header/composer, mantenha a melhoria upstream e recoloque so gates `isMobileCapacitorRuntime()`
  - se o upstream criar suporte mobile nativo equivalente, apagar duplicacao local e preservar apenas o diferencial Android/Capacitor/Tailscale real
  - se o sync for explicitamente "ignorar mobile", preservar `apps/mobile/*`, `apps/web/src/mobile/*` e docs mobile do donor; nao absorver Expo/React Native/Nitro, workflow mobile ou patches mobile do upstream
  - nao deixar plugin Capacitor vazar para codigo desktop/browser fora dos imports dinamicos ou guards mobile

### Annotations/point-and-shoot composer

- Perimetro local:
  - `apps/annotations/*`
  - `apps/server/src/annotationsBridge.ts`
  - `apps/server/src/annotationsBridgeHttp.ts`
  - `apps/server/src/externalComposerIntake.ts`
  - `packages/contracts/src/annotationsBridge.ts`
  - `packages/contracts/src/externalComposerIntake.ts`
- Adaptadores do core:
  - `apps/server/src/server.ts`
  - `apps/server/src/ws.ts`
  - `packages/contracts/src/rpc.ts`
  - `packages/client-runtime/src/wsRpcClient.ts`
  - `apps/web/src/components/ChatView.tsx`
  - `apps/web/src/components/settings/ConnectionsSettings.tsx`
- Invariantes:
  - o bridge HTTP usa `EnvironmentAuth` upstream; endpoints administrativos exigem escopo `access:write`
  - `ExternalComposerIntake` deve continuar como RPC custom pequeno, com `EnvironmentAuthorizationError` declarado no contrato
  - pareamento, clientes aprovados e tokens ficam no `ServerSecretStore`; nao migrar para estado web
  - a entrega de payload deve continuar passando pelo composer ativo, sem depender do upstream mobile WIP
- Regra de conflito:
  - se o upstream mexer em auth, aceitar o modelo novo e reaplicar apenas a traducao bridge/intake
  - se o upstream mexer em `WsRpcGroup`, manter os RPCs custom declarados e escopados, sem criar transporte paralelo
  - se o upstream trouxer feature equivalente, apagar duplicacao local e preservar so o diferencial point-and-shoot real

### Auto-update desktop opt-in

- Fonte de verdade:
  - `scripts/build-desktop-artifact.ts`
- Regra:
  - builds desktop do fork nao devem criar `app-update.yml` a partir de `GITHUB_REPOSITORY`
  - feed de update so deve existir quando `T3CODE_DESKTOP_UPDATE_REPOSITORY` estiver definido explicitamente
  - motivo bem concreto: evitar que uma instalacao custom reinstale sozinha o build oficial do upstream e perca `t3code-custom`

### Fallbacks de editor macOS/Ghostty

- Fonte de verdade:
  - `apps/server/src/process/externalLauncher.ts:129`
  - `packages/contracts/src/editor.ts`
- Adaptadores do core:
  - `apps/server/src/ws.ts:722`
  - `apps/server/src/process/externalLauncher.test.ts:498`
- Regras:
  - `ExternalLauncher` upstream e a arquitetura Effect child process sao a base; nao recriar `apps/server/src/open.ts`
  - Ghostty no macOS deve preferir AppleScript para nova aba/janela quando o app existir
  - outros editores com `macAppName` podem cair em `open -a` quando o binario nao estiver no PATH
  - se o upstream ganhar fallback nativo equivalente, apagar a duplicacao local e manter so o diferencial que sobrar

### Desktop bridge para file references

- Fonte de verdade:
  - `packages/contracts/src/ipc.ts`
  - `apps/desktop/src/preload.ts`
- Regra pos refactor desktop upstream:
  - o desktop core agora vive em camadas `app/`, `electron/`, `ipc/`, `settings/` e `updates/`
  - preservar `getPathForFile` no preload como adaptador pequeno
  - nao recriar `clientPersistence.ts`, `desktopSettings.ts` ou constantes de canal antigas no `main.ts`

### Archived shell snapshots upstream

- Fonte de verdade upstream:
  - `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
  - `apps/web/src/lib/archivedThreadsState.ts`
- Regra de conflito:
  - aceitar a separacao upstream entre shell ativo e arquivado
  - manter `thread.loop` hidratado nas leituras completas e command read model
  - se `ProjectionSnapshotQuery` conflitar de novo, preservar simultaneamente `listThreadLoopRows` custom e `listActiveThreadRows`/`listArchivedThreadRows` upstream

## Checklist quando houver conflito

1. Encontrou um arquivo desta lista no diff com `upstream/main`:
   - compare primeiro o arquivo local de perimetro custom
2. O conflito apareceu no core:
   - procure a chamada do helper/slot local antes de sair mesclando bloco inteiro
3. O upstream trouxe versao nativa parecida:
   - aceite a dele e reduza o nosso diferencial ao minimo
4. Terminou a resolucao:
   - atualize este inventario e `.context/upstream-sync.md`
