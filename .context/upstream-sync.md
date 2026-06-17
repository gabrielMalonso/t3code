# Upstream Sync

## Status atual

- Data: 2026-06-17
- Branch de trabalho: `main`
- Upstream integrado nesta wave: `b489ea52a` (`upstream/main`)
- Estado: sync aplicado; `apps/mobile` restaurado como React Native upstream-puro e Capacitor preservado em `apps/mobile-capacitor`
- Inventario vivo do fork: consultar `.context/customizations.md` antes de classificar conflito ou reaplicar custom

## Features locais vivas

- `t3code-custom/file-references`: referencia de arquivos por path, colagem e envio
- `t3code-custom/chat/ThreadLoop*`: controles e comportamento de thread loop
- `showPlanSidebar`: toggle local para desligar a Plan/Tasks sidebar e impedir auto-open
- `t3code-custom/hooks/useComposerProviderSkills.ts`: descoberta de skills do workspace e selecao de `$skill` para turnos do Codex
- `apps/server/src/t3code-custom/provider/mcpElicitationPolicy.ts`: policy local de Allow/Deny para Computer Use via `mcpServer/elicitation/request`
- `t3code-custom/hooks/useComposerFileReferenceSend.ts`: serializacao custom no envio
- `apps/server/src/t3code-custom/workspace/internalArtifacts.ts`: artefatos internos de workspace, como `.t3code/.gitignore`
- `apps/web/src/t3code-custom/terminal/fontFamily.ts`: policy local da fonte monoespacada no terminal e blocos de codigo
- `apps/mobile-capacitor` + `apps/web/src/mobile`: app mobile Capacitor Android-first/iOS-compatible como cliente nativo do `apps/web`, com pareamento LAN/Tailscale e runtime mobile de um environment ativo por vez
- `apps/annotations/*` + Annotations bridge/external composer intake: point-and-shoot composer via extensao/ponte local
- `scripts/build-desktop-artifact.ts`: builds desktop do fork so criam feed de auto-update quando `T3CODE_DESKTOP_UPDATE_REPOSITORY` estiver definido explicitamente
- `apps/server/src/process/externalLauncher.ts`: fallbacks locais de editor no macOS/Ghostty em cima do `ExternalLauncher` upstream

## 2026-06-17 — Sync ate `b489ea52a` com mobile upstream restaurado

- Branch de sync: `main`
- Donor local usado para replay seletivo: `7f58e5e4b` (`Move Capacitor app out of apps/mobile`)
- Upstream absorvido:
  - `b489ea52a` — inline panel, file preview e MCP session handling
  - right panel/inline panel, file browser/preview, comentarios locais em arquivos, task toggles, bulk close e tab menu
  - DELETE de sessoes MCP, melhorias de session handling e refactors de runtime/processo
  - busca nativa com `fff`, Pierre icons/file preview e update de `@pierre/diffs`
  - mobile React Native upstream completo em `apps/mobile/*`, incluindo composer/editor nativo, markdown, review diff e terminal
- O que foi reaplicado do custom vivo:
  - file references, skills de workspace, thread loop e review comments combinados em composer, draft store e envio
  - gate local `showPlanSidebar` para impedir auto-open da Plan sidebar quando desligada
  - `buildCodexProcessEnvironment` com `CODEX_HOME`/`SKY_CUA_SERVICE_PATH` para Computer Use em cima do spawn upstream
  - handler local de `mcpServer/elicitation/request` via policy de Allow/Deny
  - helper `.t3code/.gitignore` sobre o `WorkspaceEntries.refresh` upstream
  - fallback macOS/Ghostty no `ExternalLauncher`
  - updater desktop opt-in apenas por `T3CODE_DESKTOP_UPDATE_REPOSITORY`
  - Tailscale Serve prompt detection junto com `tailscale.exe` no Windows
  - Capacitor deps e release smoke cobrindo `apps/mobile-capacitor` e o mobile upstream
  - file-reference chips migrados para `PierreEntryIcon`/`~/pierre-icons`
- O que foi deliberadamente deixado de fora do replay:
  - congelamento antigo de `apps/mobile/*`; esse diretorio agora e upstream-puro
  - patch antigo `@pierre/diffs@1.1.20` e dependencias `vscode-icons`
  - fallback automatico para `GITHUB_REPOSITORY` no feed de updater desktop
  - retorno de OpenPets
- Classificacao:
  - `apps/mobile/*` — `upstream-puro absorvido`
  - `apps/mobile-capacitor/*` — `perimetro-custom`
  - `apps/web/src/mobile/*` — `perimetro-custom`
  - `apps/web/src/components/ChatView.tsx` — `hotspot-compartilhado`
  - `apps/web/src/components/chat/ChatComposer.tsx` — `hotspot-compartilhado`
  - `apps/web/src/components/ComposerPromptEditor.tsx` — `hotspot-compartilhado`
  - `apps/web/src/composerDraftStore.ts` — `hotspot-compartilhado`
  - `apps/web/src/t3code-custom/*` — `perimetro-custom`
  - `apps/server/src/provider/Layers/{CodexProvider,CodexSessionRuntime}.ts`, `apps/server/src/textGeneration/CodexTextGeneration.ts` — `adaptador-core`
  - `apps/server/src/workspace/Layers/WorkspaceFileSystem.ts` — `adaptador-core`
  - `apps/server/src/process/externalLauncher.ts` — `adaptador-core`
  - `packages/tailscale/src/tailscale.ts` — `adaptador-core`
  - `scripts/build-desktop-artifact.ts` — `adaptador-core`
  - `pnpm-lock.yaml`, `pnpm-workspace.yaml` — `tooling-hotspot`
- Decisoes importantes:
  - aceitar `apps/mobile/*` integralmente do upstream para reduzir drift futuro; o app Capacitor vivo fica so em `apps/mobile-capacitor/*`
  - aceitar Pierre icons como fonte de verdade dos icones de arquivo e adaptar os slots custom a essa infraestrutura
  - preservar o modelo upstream de right panel/file preview e manter apenas adaptadores locais pequenos para composer/file references
  - manter o updater desktop do fork com opt-in explicito para evitar apontar builds locais para releases upstream por acidente
- Validacao final:
  - `pnpm install`
  - `pnpm exec vp check`
  - `pnpm exec vp run typecheck` (passou com sugestoes TSGo nao bloqueantes de `Effect.orElseSucceed`)
  - `pnpm exec vp run lint:mobile`

## 2026-06-17 — Preparacao para coexistencia mobile upstream + Capacitor

- Branch de sync: `main`
- Donor local usado para replay seletivo futuro: `af6c97dbe` (`Add manual MCP reconnect support`)
- Mudanca feita:
  - `apps/mobile/*` foi movido para `apps/mobile-capacitor/*`
  - pacote renomeado de `@t3tools/mobile` para `@t3tools/mobile-capacitor`
  - CI/release smoke/documentacao passaram a mirar o pacote Capacitor novo
- Regra nova:
  - `apps/mobile/*` pertence ao upstream React Native e deve ser aceito como upstream-puro em syncs futuros
  - `apps/mobile-capacitor/*` e `apps/web/src/mobile/*` continuam custom vivo do fork
  - nao resolver conflitos futuros congelando `apps/mobile/*` so para proteger o Capacitor
- Classificacao:
  - `apps/mobile-capacitor/*` — `perimetro-custom`
  - `apps/mobile/*` — `upstream-puro reservado`
  - `apps/web/src/mobile/*` — `perimetro-custom`
  - `.github/workflows/ci.yml`, `scripts/release-smoke.ts`, `pnpm-lock.yaml` — `adaptador-core`

## 2026-06-14 — Sync ate `a23b83314` ignorando upstream mobile

- Branch de sync: `feature/annotation-composer-redesign`
- Donor local usado para replay seletivo: `d9270e02a` (`Handle Codex MCP elicitation requests`)
- Upstream absorvido:
  - `a23b83314` — fix desktop para crash no `start:desktop` em macOS com symlinks de framework reescritos
  - browser preview nativo no desktop/web, incluindo right panel, webview bridge, picking/annotations de preview e automacao MCP
  - servidor MCP HTTP, registry de sessoes MCP e toolkit de preview automation
  - rotas unificadas de assets/favicon e helpers `useAssetUrl`
  - provider Grok/xAI ACP, melhorias de provider startup, service tier/model options e lifecycle de turnos
  - ajustes de VCS/source-control, relay/connect, UI de settings, keybindings e componentes compartilhados
- Upstream deliberadamente nao absorvido:
  - upstream mobile em `apps/mobile/*`, incluindo arquivos removidos/adicionados pelo WIP mobile upstream
  - qualquer troca para stack mobile upstream que conflite com o app Capacitor vivo do fork
- Zona de atrito prevista antes do merge:
  - `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/ChatComposer.tsx`, `apps/web/src/components/chat/MessagesTimeline.tsx`, `apps/web/src/composerDraftStore.ts` — `hotspot-compartilhado`
  - `apps/server/src/server.ts`, `apps/server/src/provider/Layers/{CodexAdapter,CodexSessionRuntime,ProviderService}.ts`, `apps/server/src/orchestration/Layers/ProjectionPipeline.ts` — `hotspot-compartilhado`
  - `apps/desktop/src/preload.ts` e preview IPC/desktop — `adaptador-core`
  - `apps/mobile/*` — `perimetro-custom congelado`
- Conflitos reais resolvidos:
  - mobile: congelado como ours; arquivos mobile upstream removidos do merge para preservar o app Capacitor do fork
  - desktop preload: `getPathForFile`/`activateWindow` locais coexistem com bridge de preview upstream
  - server runtime: Annotations bridge/intake e MCP elicitation local coexistem com MCP HTTP/preview automation upstream
  - composer/timeline/store: file references, skills de workspace, thread loop e plan-sidebar local reencaixados sobre element contexts e preview annotations upstream
  - right panel: aceito modelo upstream de preview/diff/right panel e preservado gate local `showPlanSidebar`
- O que foi reaplicado do custom vivo:
  - Annotations bridge e external composer intake como endpoints/RPC custom pequenos sobre auth/runtime upstream
  - `mcpServer/elicitation/request` com policy local de Allow/Deny para Computer Use
  - file references por path no composer, timeline, draft store e serializacao do envio
  - thread loop, restore de envio custom e toggle local da Plan sidebar
  - helpers desktop `activateWindow` e `getPathForFile`
  - mobile bearer asset/favicons guards no web, sem aceitar upstream mobile
  - policy local de fonte monoespacada no terminal/codigo
- O que foi deliberadamente deixado de fora do replay:
  - app mobile upstream e arquivos mobile WIP removidos pelo merge
  - qualquer duplicacao local de preview/browser que o upstream agora cobre nativamente
  - retorno de OpenPets
- Classificacao:
  - `apps/mobile/*` — `perimetro-custom congelado`
  - `apps/web/src/mobile/*` — `perimetro-custom preservado`
  - `apps/web/src/components/ChatView.tsx` — `hotspot-compartilhado`
  - `apps/web/src/components/chat/ChatComposer.tsx` — `hotspot-compartilhado`
  - `apps/web/src/components/chat/MessagesTimeline.tsx` — `adaptador-core+custom`
  - `apps/web/src/composerDraftStore.ts` — `hotspot-compartilhado`
  - `apps/server/src/server.ts` — `hotspot-compartilhado`
  - `apps/server/src/provider/Layers/CodexAdapter.ts` — `hotspot-compartilhado`
  - `apps/server/src/provider/Layers/CodexSessionRuntime.ts` — `hotspot-compartilhado`
  - `apps/desktop/src/preload.ts` — `adaptador-core`
  - `apps/web/src/components/preview/*`, `apps/server/src/preview/*`, `apps/server/src/mcp/*`, `packages/contracts/src/preview*.ts` — `upstream-puro absorvido`
- Decisoes importantes:
  - aceitar o browser preview/MCP automation upstream como fonte de verdade e manter Annotations como point-and-shoot externo, nao como fork paralelo do preview
  - trocar attachments/favicon routes antigas pelo `assetRouteLayer` upstream, mantendo apenas `annotationsBridgeRouteLayer` como camada extra
  - adicionar `vitest` nos pacotes que agora possuem testes locais dependentes do catalogo pnpm
- Validacao final:
  - `pnpm install`
  - `pnpm exec vp check`
  - `pnpm exec vp run typecheck` (passou com sugestoes TSGo nao bloqueantes de `Effect.orElseSucceed` em arquivos custom existentes)

## Custom deliberadamente descartado

- OpenPets nao e mais custom vivo. Nao reaplicar `apps/server/src/openpets/*`, `OpenPetsReactor`, `OpenPetsBridge`, `server.getOpenPetsStatus`, `settings.openPets` nem a secao OpenPets das settings.

## 2026-06-14 — Repair pos-sync da conexao mobile Capacitor

- Problema encontrado: com `ServerConfig.devUrl`, o CORS upstream restringia as APIs HTTP autenticadas apenas ao dev UI; o app Capacitor usa origens `http://localhost` no Android e `capacitor://localhost` no iOS, entao pareamento/sessao bearer/`websocket-ticket` podiam falhar no mobile.
- Reencaixe feito:
  - `apps/server/src/httpCors.ts` agora declara as origens Capacitor permitidas.
  - `apps/server/src/http.ts` preserva o CORS credentialed do upstream para o dev UI e inclui essas origens mobile quando `devUrl` existe.
  - `apps/server/src/server.test.ts` cobre preflight de `/api/auth/websocket-ticket` para as duas origens mobile.
- Classificacao:
  - `apps/server/src/http.ts` — `adaptador-core`
  - `apps/server/src/httpCors.ts` — `adaptador-core`
  - `apps/server/src/server.test.ts` — `hotspot-compartilhado` de auth/CORS
- Regra futura: se o upstream mexer em CORS/auth HTTP, aceitar a estrutura upstream primeiro, mas manter `http://localhost` e `capacitor://localhost` como diferencial real do mobile Capacitor enquanto `apps/mobile-capacitor` continuar vivo.

## Refatoracoes feitas para sair da frente do upstream

- OpenPets foi removido do backend, contratos, RPC, settings e UI. A feature estava custando superficie de conflito sem utilidade real.
- O servico antigo `Open` foi removido junto com o upstream; editor/browser launch agora vive em `apps/server/src/process/externalLauncher.ts`
- O fallback local de Ghostty/macOS foi reaplicado como diferencial pequeno dentro do `ExternalLauncher`, sem ressuscitar `open.ts`
- `ChatComposer.tsx` absorveu o refactor upstream de refs/context providers e manteve file references, skills de workspace, thread loop e compactacao como extensoes locais
- O app mobile nao monta o `EnvironmentConnectionManagerBootstrap`; o reconnect apos background/resume foi mantido no runtime mobile com checagem de heartbeat stale
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
- `packages/contracts/src/server.ts`, `packages/contracts/src/providerInstance.ts`, `apps/server/src/ws.ts`
  O upstream agora roteia providers por `ProviderInstanceId`; qualquer custom de skills precisa usar `ProviderDriverKind` so como metadata, nao como identidade de sessao
- `apps/server/src/persistence/Migrations.ts`
  Continua sensivel porque o fork ja ocupou IDs que o upstream tenta usar em waves futuras
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
  O `getCommandReadModel()` precisa continuar sanitizando boot session/latest turn e hidratando `thread.loop`; se esquecer disso, scheduler e command guards ficam cegos
- `apps/server/src/orchestration/Layers/ThreadLoopScheduler.ts`
  Agora le estado por `ProjectionSnapshotQuery.getCommandReadModel()`, nao por `OrchestrationEngine.getReadModel()`; isso e intencional porque o engine nao expoe mais read model direto
- `apps/server/src/ws.ts`
  O upstream migrou de `GitCore/GitStatusBroadcaster` para `GitWorkflowService`, `VcsStatusBroadcaster` e `VcsProvisioningService`; custom local deve seguir VCS, nao ressuscitar os servicos antigos
- `apps/server/src/process/externalLauncher.ts`
  O upstream substituiu `open.ts` por `ExternalLauncher`; preservar fallback Ghostty/macOS aqui, sem reabrir um servico paralelo de launch
- `apps/web/src/routes/__root.tsx`, `apps/web/src/environments/runtime/service.ts`, `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/ChatHeader.tsx` e `apps/web/src/components/chat/MessagesTimeline.tsx`
  O app mobile Capacitor depende de bypass de bootstrap neutro, conexao mobile bearer-only, safe-area/keyboard behavior e assets autenticados; qualquer sync aqui deve aceitar upstream primeiro e reaplicar so o diferencial mobile real

## Regra pratica para o proximo sync

- Ler `.context/customizations.md` antes de abrir diff sensivel do fork
- Se a mudanca for UX de skill/slash command, absorver o fluxo nativo do upstream e reaplicar so a descoberta/serializacao local que ainda for diferencial real
- Se a mudanca for Multi-Provider/provider instances, aceitar o roteamento por `instanceId` e reaplicar skills do workspace apenas como overlay de Codex
- Se a mudanca for Git/source-control/VCS, aceitar o modelo novo de VCS e reaplicar custom so nos pontos de UX/RPC ainda vivos
- Se a mudanca for regra de negocio local, empurrar para `t3code-custom/*`
- Se a mudanca for mobile/root/runtime/header/composer, preservar o fluxo upstream e reaplicar o diferencial Capacitor em `apps/mobile-capacitor/*`, `apps/web/src/mobile/*` e guards pequenos atras de `isMobileCapacitorRuntime()`
- Se o upstream mexer em `apps/mobile/*`, tratar como React Native upstream-puro; nao congelar esse diretorio para proteger o Capacitor
- Se a mudanca for launch de browser/editor/processo, aceitar `ExternalLauncher` upstream e reaplicar so fallback macOS/Ghostty que continuar diferencial real
- Se precisar tocar `ChatComposer` ou `ComposerPromptEditor`, fazer o minimo e deixar a adaptacao visivel
- Se a mudanca for release/build desktop, nao permitir fallback automatico para `GITHUB_REPOSITORY` no feed de updater; o fork precisa de opt-in explicito para nao reinstalar upstream por acidente
- Se OpenPets aparecer em branch antiga, tratar como custom arqueologico e nao reaplicar.

## 2026-06-08 — Sync ate `0e4a43519` ignorando upstream mobile

- Branch de sync: `feature/annotation-composer-redesign`
- Donor local usado para replay seletivo: `dc8ed5048` (`Refresh upstream sync references`)
- Upstream absorvido:
  - `0e4a43519` — infraestrutura, telemetria e tooling de testes
  - `5ae77c0d6` — managed relay tunnels e APN service
  - `b440dd181` — migracao do workspace para Vite+/pnpm
  - `49c1b6468` — source-control com GitHub multi-account, GitLab self-hosted e Azure DevOps web URL
  - `53042f47f` — file mentions com espacos no composer
  - correcoes de desktop packaging/release, TCC macOS, Claude Agent SDK 0.3.x e spawn sem shell
- Upstream deliberadamente nao absorvido:
  - pacote mobile Expo/React Native upstream em `apps/mobile/*`
  - workflow `mobile-eas-preview`, script `scripts/mobile-native-static-check.ts` e patches mobile `@expo/metro-config`/`react-native-nitro-modules`
  - qualquer dependencia Expo/React Native/Nitro introduzida apenas pelo mobile upstream
- Zona de atrito prevista antes do merge:
  - `apps/web/src/components/chat/ChatComposer.tsx`, `ComposerPromptEditor.tsx`, `MessagesTimeline.tsx`, `composerDraftStore.ts` — `hotspot-compartilhado`
  - `apps/server/src/ws.ts`, `apps/server/src/server.ts`, `packages/contracts/src/{ipc,rpc}.ts` — `hotspot-compartilhado`
  - `apps/desktop/src/preload.ts`, `apps/desktop/src/ipc/*` — `adaptador-core`
  - `apps/server/src/persistence/Migrations.ts` — `hotspot-compartilhado`
  - `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` — `tooling-hotspot`
  - `apps/mobile/*` e `apps/web/src/mobile/*` — `perimetro-custom congelado`
- Conflitos reais resolvidos:
  - desktop bridge: `activateWindow` local + cloud auth IPC upstream coexistem
  - server runtime: Annotations bridge/local intake + cloud managed endpoint runtime coexistem
  - migrations: upstream `032_AuthPairingProofKeyThumbprint` foi preservada como migration `37` para nao colidir com IDs locais 31-36
  - packages/tooling: aceito Vite+/pnpm upstream, removendo `bun.lock`; `pnpm install` regenerou `pnpm-lock.yaml`
  - build desktop: mantido opt-in explicito de updater do fork junto com staging pnpm e protocolo `t3code`
  - contracts/RPC: mantidos RPCs de external composer intake junto com RPCs cloud upstream
- O que foi reaplicado do custom vivo:
  - Annotations bridge/intake como layer e endpoints custom pequenos sobre auth/runtime upstream
  - `activateWindow` e `getPathForFile` no desktop bridge/preload
  - Capacitor deps no `apps/web/package.json`, sem aceitar o app mobile upstream
  - registro de temas custom do diff em cima do import path upstream novo de `@pierre/diffs`
  - opt-in explicito de auto-update desktop por `T3CODE_DESKTOP_UPDATE_REPOSITORY`
- O que foi deliberadamente deixado de fora do replay:
  - mobile Expo/React Native upstream inteiro
  - script/CI/patches mobile upstream
  - retorno de OpenPets
- Classificacao:
  - `apps/mobile/*`, `apps/web/src/mobile/*`, `docs/mobile-capacitor-tailscale.md` — `perimetro-custom congelado`
  - `apps/server/src/server.ts` — `hotspot-compartilhado`
  - `packages/contracts/src/{ipc,rpc}.ts` — `hotspot-compartilhado`
  - `apps/desktop/src/preload.ts`, `apps/desktop/src/ipc/*` — `adaptador-core`
  - `apps/server/src/persistence/Migrations.ts` — `hotspot-compartilhado`
  - `scripts/build-desktop-artifact.ts` — `adaptador-core`
  - `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` — `tooling-hotspot`
- Decisoes importantes:
  - aceitar Vite+/pnpm como tooling do upstream para reduzir drift futuro
  - congelar mobile por pedido explicito do usuario; isso evita misturar o app Capacitor vivo com o mobile Expo upstream nesta wave
  - manter o bridge desktop como contrato combinado: cloud auth upstream + helpers locais `activateWindow`/`getPathForFile`
- Validacao final:
  - `pnpm install`
  - `pnpm exec vp check`
  - `pnpm exec vp run typecheck` (passou com sugestoes TSGo nao bloqueantes de `Effect.orElseSucceed` em arquivos existentes)

## 2026-06-03 — Sync sem upstream mobile ate `f0116e44b`

- Branch de sync: `feature/annotation-composer-redesign`
- Donor local usado para replay seletivo: `e69f29274` (`Default repository publishing to HTTPS`)
- Upstream absorvido:
  - `f0116e44b` — AppImage icons para Niri/Noctalia
  - `a04c09a19` — Environment APIs em `HttpApi` e authn/authz padronizados
  - `6b3050ee7` — typecheck migrado para Effect TSGo
  - `83f0cc9e3` — Claude Opus 4.8
  - `e6330ead8` — Effect beta.73
  - extracao de runtime web para `packages/client-runtime`
  - renderizacao de review comments/diffs com `@pierre/diffs`
  - `.repos/alchemy-effect` e atualizacao de repos de referencia/tooling
- Upstream deliberadamente nao absorvido:
  - `b3e8c0334` — `T3 Code Mobile [WIP] (#2013)`
  - o app Capacitor do fork continua sendo o mobile vivo; `apps/mobile/*` e `docs/mobile-capacitor-tailscale.md` ficaram preservados
  - `apps/web/src/mobile/*` recebeu apenas adaptacao pequena para os helpers remotos movidos para `@t3tools/client-runtime` e para TSGo (`crypto.randomUUID`)
- Conflitos reais do merge:
  - `apps/mobile/README.md`, `apps/mobile/package.json`, `apps/mobile/tsconfig.json` — resolvidos como ours
  - `apps/server/src/auth/Layers/ServerSecretStore.ts` — deleted upstream; guard local reaplicado em `apps/server/src/auth/ServerSecretStore.ts`
  - `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
  - `apps/server/src/orchestration/decider.ts`
  - `apps/server/src/persistence/Migrations.ts`
  - `apps/server/src/process/externalLauncher.test.ts`
  - `apps/server/src/provider/Layers/OpenCodeAdapter.ts`
  - `apps/server/src/server.ts`
  - `apps/server/src/ws.ts`
  - `apps/web/src/components/ChatView.tsx`
  - `apps/web/src/components/chat/ChatComposer.tsx`
  - `apps/web/src/components/chat/ChatHeader.tsx`
  - `apps/web/src/components/chat/MessagesTimeline.tsx`
  - `apps/web/src/components/chat/MessagesTimeline.test.tsx`
  - `apps/web/src/components/settings/ConnectionsSettings.tsx`
  - `apps/web/src/components/settings/SettingsPanels.tsx`
  - `apps/web/src/environments/runtime/connection.ts`
  - `apps/web/src/environments/runtime/service.ts`
  - `apps/web/src/lib/diffRendering.ts`
  - `apps/web/src/rpc/wsTransport.ts`
  - `apps/web/src/rpc/wsTransport.test.ts`
  - `packages/client-runtime/src/wsRpcClient.ts`
  - `packages/contracts/src/rpc.ts`
  - `bun.lock`
- O que foi reaplicado do custom vivo:
  - Annotations bridge, external composer intake e rotas HTTP custom sobre o novo `EnvironmentAuth`
  - `listProviderSkills`, skills de workspace e overlay de `$skill` no composer
  - file references na composer/timeline e testes dos chips
  - thread loop, `bootstrapPhase`, migrations locais 31-35 preservadas; migration upstream de auth scopes entrou como 36
  - `showPlanSidebar` e auto-open guard
  - mobile Capacitor com conexao `mobile` no `packages/client-runtime/src/environmentConnection.ts`
  - blur/focus mobile em `ChatView`
  - guard seguro de `PlatformError` no `ServerSecretStore`
  - fallback Ghostty/macOS em `ExternalLauncher`
  - opt-in explicito de auto-update desktop por `T3CODE_DESKTOP_UPDATE_REPOSITORY`
- O que foi deliberadamente deixado de fora do replay:
  - upstream mobile WIP, `react-native-nitro-modules`, script `lint:mobile`, patch Nitro e qualquer dependencia Expo/React Native do upstream
  - qualquer retorno de OpenPets
- Classificacao:
  - `apps/mobile/*`, `docs/mobile-capacitor-tailscale.md` — `perimetro-custom preservado`
  - `apps/web/src/mobile/*` — `perimetro-custom com adaptacao minima`
  - `packages/client-runtime/src/environmentConnection.ts` — `adaptador-core`
  - `apps/server/src/persistence/Migrations.ts` — `hotspot-compartilhado`
  - `apps/server/src/ws.ts` — `hotspot-compartilhado`
  - `apps/server/src/server.ts` — `hotspot-compartilhado`
  - `apps/web/src/components/chat/ChatComposer.tsx` — `hotspot-compartilhado`
  - `apps/web/src/components/ChatView.tsx` — `hotspot-compartilhado`
  - `apps/web/src/components/chat/MessagesTimeline.tsx` — `adaptador-core+custom`
  - `apps/web/src/lib/diffRendering.ts` — `hotspot-compartilhado`
  - `packages/contracts/src/rpc.ts` — `hotspot-compartilhado`
  - `package.json`, `bun.lock` — `tooling-hotspot`
- Decisoes importantes:
  - aceitar `HttpApi`/`EnvironmentAuth` upstream como fonte de auth; bridge custom mapeia owner/admin por `access:write`
  - aceitar `packages/client-runtime` como novo dono de runtime/RPC client; web antigo reexporta ou importa dali
  - nao reutilizar IDs de migration ja ocupados pelo fork; upstream `AuthAuthorizationScopes` virou migration 36
  - manter a autorizacao uniforme no WS e declarar `EnvironmentAuthorizationError` nos RPCs custom
- Validacao final:
  - `bun fmt`
  - `bun lint` (0 erros; warnings preexistentes de hooks/ref e `no-map-spread`)
  - `bun typecheck`

## 2026-05-23 — Sync ate `4f0f24f05`

- Branch de sync: `feature/macos-reinstall-hardening`
- Donor local usado para replay seletivo: `66714e727` (`Harden macOS rebuild and preserve local data`)
- Upstream absorvido:
  - `4f0f24f05` — `fix: maintain reasoning selections for multiple providers (#2760)`
  - `ChatComposer` passou a ler `composerModelOptions` por `selectedInstanceId`, nao por driver
  - `TraitsPicker`/`composerProviderState` agora propagam `instanceId` para persistencia de traits
  - `composerDraftStore` aceita `instanceId` explicito em `setProviderModelOptions`, preservando opcoes por instancia custom
- Zona de atrito prevista antes do merge:
  - `apps/web/src/components/chat/ChatComposer.tsx` — `hotspot-compartilhado`
  - `apps/web/src/composerDraftStore.ts` — `hotspot-compartilhado`
  - `apps/web/src/composerDraftStore.test.ts` — `hotspot-compartilhado`
- Conflitos reais do merge:
  - nenhum
- O que foi reaplicado do custom vivo:
  - nada manualmente; o merge upstream entrou limpo e manteve os hooks/slots custom existentes do composer
- O que foi deliberadamente deixado de fora do replay:
  - nenhum replay de `t3code-custom`, mobile, thread loop, file references ou desktop reinstall; o upstream nao tocou esses perimetros
- Classificacao:
  - `apps/web/src/components/chat/ChatComposer.tsx` — `hotspot-compartilhado`
  - `apps/web/src/components/chat/TraitsPicker.tsx` — `core-puro`
  - `apps/web/src/components/chat/composerProviderState.tsx` — `core-puro`
  - `apps/web/src/composerDraftStore.ts` — `hotspot-compartilhado`
  - `apps/web/src/composerDraftStore.test.ts` — `hotspot-compartilhado`
- Decisao importante:
  - aceitar o fluxo upstream de `ProviderInstanceId` como fonte de verdade para opcoes de provider; nao criar compat local por `ProviderDriverKind`
- Validacao final:
  - `bun fmt`
  - `bun lint`
  - `bun typecheck`
  - `bun run --cwd apps/web test src/composerDraftStore.test.ts`

## 2026-05-19 — Sync sem OpenPets ate `d1e85c4e8`

- Branch de sync: `t3code/upstream-sync-no-openpets`
- Donor local usado para replay seletivo: `0710be37e` (`Add Android clipboard image paste support`)
- Upstream absorvido:
  - `d1e85c4e8` permanece como `upstream/main`; a branch local ja continha o conteudo do sync anterior, mas nao a ancestry de merge
  - o merge foi feito em modo upstream-first e parado em `--no-commit`
- Zona de atrito prevista antes do merge:
  - `apps/server/src/process/externalLauncher.ts` e teste — `adaptador-core`
  - `apps/server/src/server.test.ts`, `apps/server/src/ws.ts` — `hotspot-compartilhado`
  - `apps/web/src/components/ComposerPromptEditor.tsx`, `apps/web/src/components/chat/ChatComposer.tsx` — `hotspot-compartilhado`
  - `scripts/build-desktop-artifact.test.ts` — `adaptador-core`
  - `bun.lock` — `hotspot-compartilhado`
  - OpenPets em server/contracts/web settings — `custom arqueologico`
- Conflitos reais do merge:
  - `apps/server/src/process/externalLauncher.test.ts`
  - `apps/server/src/process/externalLauncher.ts`
  - `apps/server/src/server.test.ts`
  - `apps/server/src/ws.ts`
  - `apps/web/src/components/ComposerPromptEditor.tsx`
  - `apps/web/src/components/chat/ChatComposer.tsx`
  - `scripts/build-desktop-artifact.test.ts`
  - `bun.lock`
- O que foi reaplicado do custom vivo:
  - fallback macOS/Ghostty em `ExternalLauncher`
  - TextGeneration/listagem de skills em `ws.ts`
  - file references, skills de workspace, thread loop, compactacao de contexto e controles custom do composer
  - opt-in explicito do feed de update desktop
- O que foi deliberadamente deixado de fora do replay:
  - OpenPets inteiro: bridge, reactor, RPC, settings, contratos e UI
  - replay bruto de qualquer bloco antigo que existia so para OpenPets
- Classificacao:
  - `apps/server/src/openpets/*` — `custom arqueologico removido`
  - `apps/server/src/orchestration/Layers/OpenPetsReactor.ts` e teste — `custom arqueologico removido`
  - `apps/server/src/orchestration/Services/OpenPetsReactor.ts` — `custom arqueologico removido`
  - `packages/contracts/src/{ipc,rpc,server,settings}.ts` — `adaptador-core` limpo
  - `apps/server/src/{server,server.test,ws}.ts` — `hotspot-compartilhado` limpo
  - `apps/web/src/components/settings/ConnectionsSettings.tsx` — `adaptador-core` limpo
  - `apps/web/src/{localApi,rpc/wsRpcClient}.ts` — `adaptador-core` limpo
- Validacao final:
  - `bun install`
  - `bun fmt`
  - `bun lint`
  - `bun typecheck`
  - `bun run --cwd packages/contracts test src/settings.test.ts`
  - `bun run --cwd apps/server test src/orchestration/Layers/OrchestrationReactor.test.ts src/server.test.ts`
  - `bun run --cwd apps/web test src/localApi.test.ts`

## 2026-05-15 — Sync ate `d1e85c4e8`

- Branch de sync: `main`
- Donor local usado para replay seletivo: `8e5aebcc` (`Gate loop compaction on context usage`)
- Upstream absorvido:
  - `d15909af1` — Effect child process para editor/browser launch e novo `ExternalLauncher`
  - `a41f4895c` — menos rerenders na timeline
  - `b83e9c95e` — refactor de refs/context providers do composer
  - `7e20b23e7`, `4120e9459`, `9e632f5ce`, `ea20e8002` — popover overflow, VCS backoff, diagnostics history e deps desktop runtime
  - `34bb18c8c` — refresh grande do marketing
  - hardening de workflows, simplificacao de builds/deps e release `0.0.24`
- Zona de atrito prevista antes do merge:
  - `apps/server/src/ws.ts`, `packages/contracts/src/{editor,ipc,rpc,server}.ts`
  - `apps/server/src/open.ts`, `apps/server/src/server.test.ts`, `scripts/build-desktop-artifact.test.ts`
  - `apps/web/src/components/ChatView.tsx`
  - `apps/web/src/components/ComposerPromptEditor.tsx`
  - `apps/web/src/components/chat/ChatComposer.tsx`
  - `apps/web/src/components/chat/MessagesTimeline.tsx`
  - `apps/web/src/components/settings/SettingsPanels.browser.tsx`
  - `apps/web/src/environments/runtime/service.ts`, `apps/web/src/localApi.ts`, `apps/web/src/rpc/wsRpcClient.ts`
  - `apps/{desktop,web}/package.json`, `bun.lock`
- Conflitos reais do merge:
  - `apps/server/src/open.ts`
  - `apps/server/src/process/externalLauncher.test.ts`
  - `apps/server/src/server.test.ts`
  - `apps/server/src/ws.ts`
  - `apps/web/src/components/ComposerPromptEditor.tsx`
  - `apps/web/src/components/chat/ChatComposer.tsx`
  - `bun.lock`
  - `scripts/build-desktop-artifact.test.ts`
- O que foi reaplicado do custom vivo:
  - fallback Ghostty/macOS e deteccao de apps macOS em `ExternalLauncher`
  - `TextGeneration` local junto do `ExternalLauncher` upstream em `ws.ts`
  - mock de `OpenPetsBridge` e novo mock de `ExternalLauncher` em `server.test.ts`
  - `onPasteCapture` e snapshot ampliado em `ComposerPromptEditor.tsx`
  - file references, skills de workspace, thread loop controls, compactacao de contexto e `showPlanSidebar` no `ChatComposer.tsx`
  - reconnect stale no app mobile Capacitor apos `visibilitychange`, `pageshow` ou `App.resume`, sem acordar primary/saved environments
  - fetch bearer-aware de assets mobile agora reescreve anexos/favicons para o `httpBaseUrl` do profile ativo, evitando misturar LAN e Tailscale no mesmo `environmentId`
  - opt-in explicito do feed de update desktop em `scripts/build-desktop-artifact.test.ts`
  - dependencias do lockfile regeneradas com `bun install`, preservando Capacitor/mobile e removendo residuos do launch antigo
- O que foi deliberadamente deixado de fora do replay:
  - `apps/server/src/open.ts` e o servico `Open` antigo; o upstream substituiu isso melhor com `ExternalLauncher`
  - replay bruto do composer anterior; so os slots/hooks custom voltaram
  - dependencias antigas de launch que nao sao mais usadas diretamente pelo fork
- Classificacao:
  - `apps/server/src/process/externalLauncher.ts` — `adaptador-core`
  - `apps/server/src/process/externalLauncher.test.ts` — `adaptador-core`
  - `apps/server/src/ws.ts` — `hotspot-compartilhado`
  - `apps/server/src/server.test.ts` — `hotspot-compartilhado`
  - `apps/web/src/components/ComposerPromptEditor.tsx` — `adaptador-core`
  - `apps/web/src/components/chat/ChatComposer.tsx` — `hotspot-compartilhado`
  - `apps/web/src/mobile/runtime.ts`, `apps/web/src/mobile/assets.ts` e `apps/web/src/routes/__root.tsx` — `adaptador-core` mobile
  - `bun.lock` — `hotspot-compartilhado`
  - `scripts/build-desktop-artifact.test.ts` — `adaptador-core`
  - `apps/server/src/open.ts` — `core-puro removido`
- Validacao final:
  - `bun fmt`
  - `bun lint`
  - `bun typecheck`
  - `bun run test src/process/externalLauncher.test.ts src/server.test.ts` em `apps/server`
  - `bun run test src/t3code-custom/file-references/resolveFiles.test.ts src/t3code-custom/file-references/paste.test.ts src/t3code-custom/file-references/serialization.test.ts src/components/chat/MessagesTimeline.logic.test.ts src/components/chat/MessagesTimeline.test.tsx` em `apps/web`
  - `bun run test src/mobile/assets.test.ts src/mobile/runtime.test.ts src/mobile/pairingTarget.test.ts src/mobile/deepLink.test.ts src/environments/runtime/service.threadSubscriptions.test.ts src/environments/runtime/connection.test.ts src/environments/runtime/catalog.test.ts` em `apps/web`
  - `bun run test build-desktop-artifact.test.ts` em `scripts`

## 2026-05-10 — Sync ate `b793401ae`

- Branch de sync: `main`
- Donor local usado para replay seletivo: `03e3d5d88` (`Handle hosted pairing URLs in mobile pairing target`)
- Upstream absorvido:
  - refactor grande do desktop para camadas `app/`, `backend/`, `electron/`, `ipc/`, `settings/`, `ssh/`, `updates/` e `window/`
  - archived shell snapshots e listagem separada de threads arquivadas
  - colapso de mensagens longas de usuario e renderizacao de skill chips inline no markdown
  - stricter Effect diagnostics, oxlint plugin, automatic git fetch interval e atualizacoes de release/deploy
  - fixes hosted/bootstrap, CORS de pairing remoto, reconnect SSH e raw delta de OpenCode
- Zona de atrito prevista antes do merge:
  - `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `apps/server/src/ws.ts`
  - `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
  - `apps/server/src/orchestration/decider.ts`
  - `apps/server/src/persistence/Migrations.ts`
  - `apps/web/src/components/chat/ChatComposer.tsx`
  - `apps/web/src/components/chat/MessagesTimeline.tsx`
  - `apps/web/src/components/ChatMarkdown.tsx`
  - `apps/web/src/composerDraftStore.ts`
  - `apps/web/src/components/settings/SettingsPanels.tsx`
  - `apps/web/package.json`, `bun.lock`
- Conflitos reais do merge:
  - desktop bridge/main/preload e remocao de `clientPersistence`/`desktopSettings` antigos
  - `open.test`, `server.test`, `ProjectionSnapshotQuery`, `decider`, `Migrations`, `ws`
  - `ChatMarkdown`, `ChatComposer`, `MessagesTimeline`, `SettingsPanels`, `composerDraftStore`, `apps/web/package.json`, `bun.lock`
- O que foi reaplicado do custom vivo:
  - `getPathForFile` no `apps/desktop/src/preload.ts`, preservando file references por path no Electron sobre a nova arquitetura IPC
  - `showPlanSidebar` no novo teste de `DesktopClientSettings`
  - thread loop em `decider`, `ProjectionSnapshotQuery`, migrations e scheduler, atualizado para as regras Effect novas
  - file references em `MessagesTimeline` antes do novo `CollapsibleUserMessageBody`
  - placeholder custom do composer via `resolveComposerPlaceholder`
  - dependencias Capacitor junto do bump upstream de `@base-ui/react`
- O que foi deliberadamente deixado de fora do replay:
  - `clientPersistence.ts`, `desktopSettings.ts` e o `main.ts` monolitico antigos; o upstream substituiu isso melhor
  - fluxo antigo de mensagens de usuario sem colapso; o upstream agora cobre essa UX no core
  - qualquer copia local do markdown skill-chip; o upstream ganhou `SkillInlineText`
- Decisoes importantes:
  - migration upstream `030_ProjectionThreadShellArchiveIndexes` entrou como ID `32`, porque o fork ja ocupa IDs locais e o sync anterior ja havia deslocado `029` para `31`
  - `ProjectionSnapshotQuery` agora preserva loops custom e tambem absorve queries upstream de threads ativas/arquivadas
  - no desktop, o custom fica no preload/bridge; nao ressuscitar os modulos removidos pelo upstream
- Validacao final:
  - `bun fmt`
  - `bun lint`
  - `bun typecheck`
  - `bun run --cwd apps/desktop test src/settings/DesktopClientSettings.test.ts`
  - `bun run --cwd apps/server test src/orchestration/Layers/ProjectionSnapshotQuery.test.ts src/orchestration/Layers/ThreadLoopScheduler.test.ts src/orchestration/projector.test.ts`

## 2026-05-07 — Sync ate `a74ed8ed3`

- Branch de sync: `main`
- Donor local usado para replay seletivo: `197382449` (`Add hosted remote endpoints and VCS foundation`)
- Upstream absorvido:
  - `a74ed8ed3` — revert do cache de assets desktop em CI/release
- Zona de atrito prevista antes do merge:
  - vazia na intersecao desde a base; o upstream tocou apenas `.github/workflows/ci.yml` e `.github/workflows/release.yml`
- Conflitos reais do merge:
  - nenhum
- O que foi reaplicado do custom vivo:
  - nada no conflito; merge limpo
  - novo hardening local: `scripts/build-desktop-artifact.ts` deixou de usar `GITHUB_REPOSITORY` como fallback para gerar feed de auto-update
- O que foi deliberadamente deixado de fora do replay:
  - nenhum replay de composer, loop, file references ou mobile; upstream nao tocou esses caminhos nesta wave
- Decisao importante:
  - builds desktop custom agora precisam de `T3CODE_DESKTOP_UPDATE_REPOSITORY` explicito para embutir `app-update.yml`; sem isso, nao ha feed para o app auto-atualizar para `pingdotgg/t3code`
- Classificacao:
  - `.github/workflows/ci.yml` — `core-puro`
  - `.github/workflows/release.yml` — `core-puro`
  - `scripts/build-desktop-artifact.ts` — `adaptador-core`

## 2026-05-06 — Sync ate `6c79039ce`

- Branch de sync: `main`
- Donor local usado para replay seletivo: `eceb030a` (`Add settings modal access from mobile neutral surface`)
- Upstream absorvido:
  - hosted static/remote endpoints e pairing
  - base VCS/source-control providers, incluindo GitHub/GitLab/Bitbucket/Azure DevOps
  - `GitWorkflowService`, `VcsStatusBroadcaster`, `VcsProvisioningService` e drivers VCS
  - provider update/maintenance, diagnostics, SSH/Tailscale packages e keybindings/settings novos
  - JetBrains editors, diff whitespace setting, remote docs/workflows e ajustes de release
- Conflitos reais do merge:
  - `.gitignore`
  - `apps/desktop/src/desktopSettings.test.ts`
  - `apps/desktop/src/main.ts`
  - `apps/desktop/src/preload.ts`
  - `apps/server/src/open.test.ts`
  - `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
  - `apps/server/src/persistence/Migrations.ts`
  - `apps/server/src/ws.ts`
  - `apps/web/src/components/ChatView.tsx`
  - `apps/web/src/components/ProjectFavicon.tsx`
  - `apps/web/src/components/chat/ChatComposer.tsx`
  - `apps/web/src/components/chat/ChatHeader.tsx`
  - `apps/web/src/components/chat/MessagesTimeline.tsx`
  - `apps/web/src/components/chat/OpenInPicker.tsx`
  - `apps/web/src/components/settings/SettingsPanels.browser.tsx`
  - `apps/web/src/components/settings/SettingsPanels.tsx`
  - `apps/web/src/localApi.ts`
  - `apps/web/src/routes/__root.tsx`
  - `apps/web/src/store.test.ts`
  - `packages/contracts/src/editor.ts`
  - `packages/contracts/src/ipc.ts`
  - `packages/contracts/src/rpc.ts`
- O que foi reaplicado do custom vivo:
  - file references no composer/timeline, agora encaixados no refactor novo de `MessagesTimeline`
  - thread loop e scheduler, migrados para `ProjectionSnapshotQuery.getCommandReadModel()`
  - `showPlanSidebar` junto do novo `diffIgnoreWhitespace`
  - `listProviderSkills`, skills de workspace e extensoes de envio do composer
  - mobile Capacitor em `__root`, runtime mobile, header/timeline bearer-aware e favicons autenticados
  - Ghostty preservado junto dos novos editores JetBrains
- Decisoes importantes:
  - migration upstream `029_ProjectionThreadDetailOrderingIndexes` entrou como ID `31`, porque o fork ja ocupava `23` para loops e o upstream ocupou `29/30` depois
  - `getCommandReadModel()` agora tambem sanitiza boot session/latest turn e hidrata `thread.loop`; sem isso, loops de thread reiniciados podem ser apagados como stale
  - `ws.ts` segue o novo mundo VCS; nao trazer `GitCore`/`GitStatusBroadcaster` antigos de volta
  - no mobile/root, o fluxo hosted static upstream foi aceito e o bypass Capacitor ficou como gate pequeno
- Validacao final:
  - `bun fmt`
  - `bun lint`
  - `bun typecheck`
  - `bun run --cwd apps/server test src/orchestration/Layers/ThreadLoopScheduler.test.ts src/orchestration/Layers/ProviderRuntimeIngestion.test.ts src/orchestration/Layers/CheckpointReactor.test.ts src/server.test.ts`
  - `bun run --cwd apps/web test src/components/GitActionsControl.logic.test.ts src/components/chat/ChatHeader.test.ts src/providerSkillSelections.test.ts src/t3code-custom/file-references/paste.test.ts src/t3code-custom/file-references/serialization.test.ts`

## 2026-05-06 — Registro do app mobile Capacitor

- Branch analisada: `t3code/capacitor-mobile-app`
- Snapshot local registrado como referencia do custom vivo: `3a85aafb2` (`Fix mobile editor focus on thread switch`)
- Decisao: manter o app mobile dentro do fork/monorepo e fazer PR para a `main`; nao extrair para projeto paralelo enquanto ele reutilizar `apps/web`, runtime remoto, contratos e auth do T3 Code
- Forma do custom:
  - `apps/mobile/*` e o wrapper nativo Capacitor ficam como `perimetro-custom`
  - `apps/web/src/mobile/*` fica como `perimetro-custom` de runtime/UI mobile
  - root/runtime/chat/header/timeline ficam como `adaptador-core` ou `hotspot-compartilhado`, nunca como novo fork do core
- O que torna isso custom vivo:
  - app Android-first com iOS compat correto por Capacitor
  - tela mobile neutra que nao monta `LocalApi`, primary environment, server state ou WebSocket antes de um profile ativo
  - profiles LAN/Tailscale separados, mesmo quando apontam para o mesmo backend
  - pareamento por QR/token e troca para bearer session
  - runtime mobile com um environment ativo por vez
  - fechamento de environment limpando conexoes e estado volatil
  - assets autenticados resolvidos com bearer fetch/blob URL
- Hotspots novos registrados:
  - `apps/web/src/routes/__root.tsx` — `hotspot-compartilhado`
  - `apps/web/src/environments/runtime/service.ts` — `hotspot-compartilhado`
  - `apps/web/src/environments/runtime/catalog.ts` — `adaptador-core`
  - `apps/web/src/components/ChatView.tsx` — `hotspot-compartilhado`
  - `apps/web/src/components/ComposerPromptEditor.tsx` — `adaptador-core`
  - `apps/web/src/components/chat/ChatHeader.tsx` — `hotspot-compartilhado`
  - `apps/web/src/components/chat/MessagesTimeline.tsx` — `hotspot-compartilhado`
  - `apps/web/src/components/ProjectScriptsControl.tsx` — `adaptador-core`
  - `apps/web/src/components/chat/OpenInPicker.tsx` — `adaptador-core`
  - `apps/web/package.json` e `bun.lock` — `hotspot-compartilhado` por dependencias Capacitor no workspace web
- Regra dominante para sync futuro:
  - se o upstream mexer em runtime/root/header/chat, aceitar upstream primeiro e reaplicar apenas o gate mobile neutro ou o adaptador bearer necessario
  - se o upstream trouxer suporte mobile nativo equivalente, deletar a duplicacao local e preservar so o diferencial Capacitor/Tailscale/Android que continuar real
  - nao separar para outro repositorio antes de haver backend proprio, UI propria independente do `apps/web` ou release mobile com ciclo completamente separado

## 2026-05-01 — Sync ate `17b43960`

- Branch de sync: `sync/upstream-2026-05-01`
- Donor local usado para replay seletivo: `73cd6149` (`Add Ghostty and macOS app fallbacks for editor launches`)
- Commits upstream absorvidos:
  - `08e6d4cf` — `feat: Multi-Provider support (#2277)`
  - fixes mobile/iOS de sidebar, safe areas e botoes de thread
  - fixes de OpenCode no Windows, terminal dimensions, clock skew e git PR stale
  - release workflow com Discord webhook/logging
- Zona de atrito prevista antes do merge:
  - `apps/web/src/components/chat/ChatComposer.tsx` — `hotspot-compartilhado`
  - `apps/web/src/components/ChatView.tsx` — `hotspot-compartilhado`
  - `apps/web/src/composerDraftStore.ts` — `hotspot-compartilhado`
  - `apps/web/src/components/settings/SettingsPanels.tsx` — `adaptador-core`
  - `apps/server/src/ws.ts` — `hotspot-compartilhado`
  - `apps/server/src/provider/Layers/CodexAdapter.ts` — `hotspot-compartilhado`
  - `apps/server/src/provider/Layers/CodexProvider.ts` — `hotspot-compartilhado`
  - `apps/server/src/provider/Layers/CodexSessionRuntime.ts` — `hotspot-compartilhado`
  - `apps/server/src/persistence/Migrations.ts` — `hotspot-compartilhado`
  - `packages/contracts/src/server.ts`, `packages/contracts/src/settings.ts`, `packages/contracts/src/ipc.ts` — `hotspot-compartilhado`
- Conflitos reais do merge:
  - `apps/server/src/persistence/Migrations.ts`
  - `apps/server/src/provider/Layers/CodexAdapter.ts`
  - `apps/server/src/provider/Layers/CodexProvider.ts`
  - `apps/server/src/provider/Layers/CodexSessionRuntime.ts`
  - `apps/web/src/components/chat/ChatComposer.tsx`
  - `apps/web/src/rpc/wsRpcClient.ts`
  - `packages/contracts/src/ipc.ts`
  - `packages/contracts/src/server.ts`
  - `packages/contracts/src/settings.ts`
- O que foi absorvido do upstream:
  - Multi-Provider com `ProviderInstanceId`, provider instance registry, provider drivers e UI de instancias
  - novo model selection por `instanceId`
  - refresh direcionado por provider instance
  - redaction de settings expostos ao cliente
  - migrations upstream de `provider_instance_id` em runtime/session projections
  - melhorias mobile/iOS, release workflow e fixes operacionais
- O que foi reaplicado do custom vivo:
  - `listProviderSkills` e descoberta de skills de workspace para Codex
  - envio de `skills` no `CodexAdapter` e `CodexSessionRuntime`
  - `showPlanSidebar` em `ClientSettingsSchema` e patch
  - migrations locais de thread loop preservadas antes das migrations novas de provider instance
  - testes custom ajustados para `ProviderDriverKind.make(...)` e `ProviderInstanceId`
- O que foi deliberadamente deixado de fora do replay:
  - qualquer tentativa de restaurar `ProviderKind` como identidade de provider; o upstream venceu aqui e com razao
  - menu/discovery paralelo dentro do `ChatComposer`; o custom segue atras dos hooks em `t3code-custom`
  - IDs upstream `27/28` para provider instance; no fork eles viraram `29/30` para nao corromper bancos que ja conhecem migrations locais
- Resultado pratico:
  - `apps/web/src/t3code-custom/hooks/useComposerProviderSkills.ts` ficou como `perimetro-custom`
  - `apps/web/src/components/chat/ChatComposer.tsx` ficou como `adaptador-core`
  - `apps/server/src/ws.ts`, `packages/contracts/src/server.ts`, `packages/contracts/src/ipc.ts` e `packages/contracts/src/settings.ts` ficaram como `hotspot-compartilhado`
  - `apps/server/src/persistence/Migrations.ts` ficou como `hotspot-compartilhado` por historico de IDs do fork
  - o reencaixe diminuiu conflito futuro no composer, mas aumentou a responsabilidade em provider instance/contracts; normal, Multi-Provider mexe no chao da casa
- Validacao final:
  - `bun fmt`
  - `bun lint`
  - `bun typecheck`
  - `bun run --cwd apps/server test src/persistence/Migrations/027_028_ProviderInstanceIdColumns.test.ts src/orchestration/Layers/ProviderRuntimeIngestion.test.ts src/orchestration/Layers/CheckpointReactor.test.ts src/orchestration/Layers/ThreadLoopScheduler.test.ts`
  - `bun run --cwd apps/web test src/providerSkillSelections.test.ts src/modelSelection.test.ts src/components/settings/SettingsPanels.logic.test.ts src/localApi.test.ts`
  - `bun run --cwd packages/contracts test src/settings.test.ts src/providerInstance.test.ts src/server.test.ts`

## 2026-04-27 — Sync ate `dbebc387`

- Branch de sync: `sync/upstream-2026-04-23`
- Donor local usado para replay seletivo: `e2a52329` (`Add Dracula theme support`)
- Commits upstream absorvidos:
  - `5cf83ffe` — `fix(release): use configured node for smoke manifest merge`
  - `dbebc387` — `Ignore stale WebSocket lifecycle events after reconnect`
- Zona de atrito prevista antes do merge:
  - vazia; os arquivos alterados pelo upstream nao intersectavam os arquivos custom alterados desde a base
- Conflitos reais do merge:
  - nenhum
- O que foi absorvido do upstream:
  - `scripts/release-smoke.ts` passou a usar `process.execPath` ao mesclar manifests Windows, respeitando o Node configurado
  - `apps/web/src/rpc/protocol.ts` ganhou `isActive` nos lifecycle handlers
  - `apps/web/src/rpc/wsTransport.ts` passou a identificar sessoes ativas para ignorar eventos atrasados de WebSocket antigo apos reconnect
  - `apps/web/src/rpc/wsTransport.test.ts` cobriu reconnect com close stale e reset correto do status de conexao
- O que foi reaplicado do custom vivo:
  - nada; o merge foi upstream puro e nao tocou `t3code-custom`, composer, contracts custom ou bridge
- O que foi deliberadamente deixado de fora do replay:
  - nenhum replay foi necessario; restaurar blocos locais aqui seria ruido
- Resultado pratico:
  - `apps/web/src/rpc/protocol.ts` e `apps/web/src/rpc/wsTransport.ts` ficaram como `core-puro`
  - `apps/web/src/rpc/wsTransport.test.ts` ficou como `core-puro`
  - `scripts/release-smoke.ts` ficou como `core-puro`
  - nenhum hotspot custom novo foi criado
- Validacao final:
  - `bun fmt`
  - `bun run --cwd apps/web test src/rpc/wsTransport.test.ts`
  - `bun lint`
  - `bun typecheck`

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
