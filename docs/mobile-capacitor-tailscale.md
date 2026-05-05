# T3 Code Mobile com Capacitor e Tailscale

## Decisao Atual

Construir o app mobile como um cliente nativo via Capacitor que controla um T3 Code server rodando em outra maquina. O celular nao roda Codex, Node server, providers ou filesystem local do projeto.

Regra central: o app mobile abre em estado neutro, sem nenhum environment ativo. O usuario escolhe ou pareia um environment; so entao o app monta runtime, WebSocket, server state e UI principal. Para trocar de environment, o usuario fecha o environment atual, o app limpa o estado volatil e volta ao neutro.

Minha opiniao: esse desenho e melhor que auto-switch entre LAN/Tailscale. Auto-switch parece esperto, mas no MVP vira estado fantasma. Single-active-environment e previsivel, testavel e muito menos chato de manter.

```text
App abre
  ↓
Estado neutro: nenhum environment ativo
  ↓
Usuario escolhe/pareia perfil
  ↓
App ativa 1 environment
  ↓
Uso normal do T3 Code
  ↓
Usuario fecha environment
  ↓
App limpa runtime e volta ao neutro
```

## Objetivo

Criar um app iOS/Android que replique a experiencia mobile do T3 Code, com pareamento simples, suporte a Tailscale e LAN, e apenas um backend ativo por vez.

O app deve salvar perfis separados:

| Modo | Exemplo | Quando usar |
|---|---|---|
| Tailscale | `http://100.x.y.z:3774` ou MagicDNS | fora de casa, redes diferentes, IP estavel |
| LAN | `http://192.168.15.12:3774` | em casa, mesma rede Wi-Fi, teste rapido |

Mesmo que Tailscale e LAN apontem para o mesmo servidor, cada modo deve ter seu proprio profile e bearer token.

```text
MacBook Pro
  Perfil Tailscale
    httpBaseUrl: http://100.x.y.z:3774
    wsBaseUrl:   ws://100.x.y.z:3774
    session:     bearer-token-A

  Perfil LAN
    httpBaseUrl: http://192.168.15.12:3774
    wsBaseUrl:   ws://192.168.15.12:3774
    session:     bearer-token-B
```

## Regra Dura do Estado Neutro

No modo mobile neutro, nenhum caminho de codigo pode tocar:

- primary environment;
- saved environments desktop/browser;
- `LocalApi`;
- `getPrimaryEnvironmentConnection()`;
- `ensurePrimaryEnvironmentReady()`;
- `resolveInitialServerAuthGateState()`;
- server state;
- tracing;
- WebSocket.

Se algum desses caminhos roda no neutro, o app esta mentindo: a UI parece neutra, mas por baixo ja tentou ligar o motor.

## Modelo Mental

```text
App mobile
  guarda profiles
  escaneia QR
  troca pairing token por bearer session
  ativa 1 profile por vez
  fecha profile antes de trocar

Servidor T3 Code
  autentica
  gerencia sessoes
  conversa com Codex
  acessa arquivos locais
```

Nao e app standalone. E um controle remoto nativo para um T3 Code server.

## Estado Atual do Projeto

Pecas existentes que ajudam:

| Peca | Estado | Codigo |
|---|---|---|
| UI web React/Vite | pronta para bundle web | `apps/web` |
| Rota `/pair` | existe | `apps/web/src/routes/pair.tsx` |
| Pairing token em URL/QR | existe | `apps/server/src/startupAccess.ts` |
| Bearer session para clientes remotos | existe | `apps/server/src/auth/http.ts` |
| Remote API bearer/ws-token | existe | `apps/web/src/environments/remote/api.ts` |
| WebSocket com `wsToken` | existe | `apps/web/src/environments/remote/api.ts` |

Pecas que nao podem ser reaproveitadas diretamente no mobile neutro:

| Peca | Problema |
|---|---|
| `apps/web/src/routes/__root.tsx` | roda primary bootstrap global |
| `apps/web/src/environments/runtime/service.ts` | autoconecta saved environments e registra conexoes por `environmentId` |
| `apps/web/src/environments/runtime/catalog.ts` | persiste saved env por `environmentId`, insuficiente para LAN/Tailscale separados |
| `apps/web/src/localApi.ts` | pode criar primary connection so para montar API local |
| `apps/web/src/environments/remote/target.ts` | bare host vira `https://`, ruim para LAN/Tailscale HTTP |
| attachments/favicons via `<img src>` | nao enviam bearer `Authorization` |

## Fluxo do MVP

### Abrir App

```text
1. App abre
2. Detecta modo mobile/Capacitor
3. Carrega storage mobile isolado
4. Mostra tela neutra
5. Nenhum backend e conectado automaticamente
```

### Parear Novo Profile

```text
1. Usuario escolhe modo: Tailscale ou LAN
2. Usuario escaneia QR ou cola token/URL
3. App separa credential/token de backend URL
4. Usuario confirma/edita o host do backend
5. App chama /api/auth/bootstrap/bearer
6. App salva bearer token, expiresAt e URLs no profile
7. App pode ativar esse profile imediatamente
```

### Ativar Profile

```text
1. Usuario toca em Conectar
2. App valida se bearer session ainda nao expirou
3. App cria WsTransport para esse profile
4. App emite wsToken para abrir WebSocket
5. App monta server state e UI principal
```

### Fechar Environment

```text
1. Usuario toca em Fechar environment
2. App encerra WebSocket
3. App cancela subscriptions/streams
4. App limpa estado volatil
5. App revoga blob URLs de assets
6. App volta para tela neutra
```

## QR, Token e Host

O QR nao deve mandar no host final cegamente.

Exemplo: o QR pode vir como `http://localhost:3774/pair#token=abc`, mas o usuario quer usar Tailscale. Nesse caso, o app deve extrair `token=abc`, mas deixar o host editavel ou preenchido pelo modo escolhido.

Regra pratica:

| Entrada | Comportamento |
|---|---|
| Pairing URL com token | extrai token e sugere host da URL |
| Token manual | usuario informa host separado |
| Modo Tailscale | sugerir host Tailscale/MagicDNS salvo anteriormente |
| Modo LAN | sugerir ultimo IP LAN salvo |
| Host sem scheme em mobile | para IP privado/Tailscale, usar `http://` por default no MVP |
| URL com scheme explicito | preservar scheme |

## Modelo de Dados Mobile

Nao usar o storage desktop atual para isso no MVP. Criar storage mobile isolado, com schema proprio.

```ts
type MobileConnectionMode = "tailscale" | "lan";

type MobileConnectionProfile = {
  profileId: string;
  environmentId: string;
  label: string;
  mode: MobileConnectionMode;
  httpBaseUrl: string;
  wsBaseUrl: string;
  bearerToken: string;
  sessionExpiresAt: string;
  createdAt: string;
  lastConnectedAt: string | null;
};
```

Futuro agrupamento opcional:

```ts
type MobileBackend = {
  backendId: string;
  environmentId: string;
  label: string;
  profiles: {
    tailscale?: MobileConnectionProfile;
    lan?: MobileConnectionProfile;
  };
};
```

## Runtime Mobile

Criar um controller explicito:

```ts
activateProfile(profileId)
closeActiveProfile()
reconnectActiveProfile()
getActiveProfile()
```

Invariantes:

- so um profile ativo por vez;
- ativar outro profile exige fechar o atual;
- nenhuma conexao e criada na tela neutra;
- `wsToken` deve ser emitido a cada reconnect real;
- token bearer expirado nao deve gerar reconnect loop: pedir repareamento.

## Reset ao Fechar Environment

Criar uma API de producao, nao usar helpers de teste:

```ts
resetRuntimeForClosedEnvironment()
```

Ela deve limpar explicitamente:

- WebSocket/RPC client;
- subscriptions e streams;
- server state;
- query cache relevante;
- ws connection state;
- request latency state;
- terminal state;
- app store/projections do environment ativo;
- LocalApi server binding;
- tracing ou OTLP binding;
- asset blob cache;
- active profile state.

## Assets Autenticados

No mobile bearer-only, `<img src="http://...">` nao envia `Authorization: Bearer ...`.

Rotas afetadas:

- `/attachments/*`;
- `/api/project-favicon`.

Plano:

```text
1. Criar asset fetch com bearer token
2. Converter resposta para blob:
3. Expor blob URL para componentes
4. Guardar blob URLs em cache scoped por profile
5. Revogar tudo no closeActiveProfile()
```

Alternativa futura: endpoint/token temporario para assets.

## Capacitor

Criar `apps/mobile` como wrapper Capacitor do build web.

Plugins previstos:

| Necessidade | Plugin |
|---|---|
| QR code de pareamento | `@capacitor/barcode-scanner` |
| Persistencia leve | `@capacitor/preferences` |
| Status de rede/reconexao | `@capacitor/network` |
| Teclado mobile | `@capacitor/keyboard` |
| Status bar/safe area | `@capacitor/status-bar` |

O bundle web deve ir dentro do app. `server.url` do Capacitor pode ajudar em dev/live reload, mas nao deve ser a arquitetura de producao.

## Config Nativa

### iOS

- `NSLocalNetworkUsageDescription` para LAN.
- `NSAppTransportSecurity`/excecoes para HTTP no MVP.
- Futuro: HTTPS para distribuicao mais seria.

### Android

- network security config para HTTP/cleartext no MVP.
- Testar em device, nao so simulador.

## Plano de Implementacao

### Wave 1: Modo Mobile Neutro

- Criar detector/flag de mobile Capacitor.
- Splitar root: mobile neutro nao chama primary bootstrap.
- Criar tela neutra/lista de profiles sem montar runtime.

Verificacao:

- abrir app mobile com origem Capacitor nao tenta primary;
- nenhum WebSocket abre na tela neutra.

### Wave 2: Storage Mobile Isolado

- Criar `mobileProfileStorage.ts`.
- Usar `@capacitor/preferences` quando disponivel.
- Fallback browser controlado para dev.
- Persistir `sessionExpiresAt`.

Verificacao:

- dois profiles do mesmo `environmentId` coexistem;
- storage mobile nao chama `LocalApi`.

### Wave 3: Pareamento Mobile

- Criar resolver mobile separado.
- Separar token de backend URL.
- QR e token manual.
- Escolha explicita Tailscale/LAN.
- Trocar pairing token por bearer session.

Verificacao:

- QR `localhost` nao obriga host final;
- token one-time consumido corretamente;
- segundo modo exige novo token.

### Wave 4: Active Environment Runtime

- Implementar `activateProfile`, `closeActiveProfile`, `reconnectActiveProfile`.
- Conectar via bearer + wsToken.
- Reemitir wsToken em reconnect real.
- Guardar `lastConnectedAt`.

Verificacao:

- single-active-environment;
- trocar exige fechar;
- offline longo reconecta com novo wsToken.

### Wave 5: Guards e Reset

- Guard mobile: sem active profile, rotas de app voltam ao neutro.
- Se rota tem `environmentId` diferente do ativo, voltar ao neutro.
- Implementar `resetRuntimeForClosedEnvironment`.

Verificacao:

- deep link antigo nao renderiza estado velho;
- fechar environment limpa stores e conexao.

### Wave 6: Assets Bearer

- Criar fetch bearer-aware para assets.
- Blob URL cache scoped por profile.
- Revogar blob URLs no close.
- Ajustar favicon e attachments.

Verificacao:

- imagens/anexos renderizam no mobile;
- fechar environment revoga blobs.

### Wave 7: Capacitor Nativo

- Criar `apps/mobile`.
- Adicionar plugins.
- Config iOS e Android.
- Rodar `cap sync`.

Verificacao:

- build iOS/Android;
- teste manual Tailscale;
- teste manual LAN.

### Wave 8: UX MVP

- Tela neutra com profiles salvos.
- Parear novo.
- Escanear QR.
- Inserir token/URL.
- Conectar.
- Fechar environment.
- Estados de erro claros.

Verificacao:

- fluxo completo em device/simulador.

## Testes Necessarios

| Area | Teste |
|---|---|
| Root mobile | origem Capacitor nao chama primary bootstrap |
| Storage mobile | profiles Tailscale/LAN com mesmo `environmentId` |
| Storage mobile | token e `sessionExpiresAt` persistem por profile |
| Resolver mobile | `100.x`, `192.168.x`, MagicDNS e URL com scheme |
| Pairing | token one-time nao reaproveita |
| Runtime | activate/close/reconnect single-active |
| Runtime | close limpa estado volatil |
| Routes | deep link sem active profile volta ao neutro |
| WebSocket | reconnect reemite wsToken |
| Assets | bearer fetch cria blob e revoga no close |
| Native | LAN/Tailscale em device/simulador |

## Checklist de Validacao

- `bun --filter @t3tools/web build`
- `bun run test --filter=@t3tools/web`
- `bun run test --filter=@t3tools/contracts`, se contratos mudarem
- `bun fmt`
- `bun lint`
- `bun typecheck`
- `npx cap sync ios`
- `npx cap sync android`
- Teste manual com Tailscale
- Teste manual com LAN
- Confirmar que tela neutra nao abre WebSocket
- Confirmar que fechar environment limpa conexao

## Fora do MVP

- Rodar Codex/server no celular.
- Auto-switch magico entre Tailscale e LAN.
- Descoberta automatica na LAN.
- Controlar Tailscale diretamente.
- Push notifications.
- Publicacao App Store/Play Store.
- HTTPS completo para LAN.

## Fontes

- Capacitor Getting Started: https://capacitorjs.com/docs/getting-started
- Capacitor Workflow: https://capacitorjs.com/docs/basics/workflow
- Capacitor Config: https://capacitorjs.com/docs/config
- Capacitor Live Reload: https://capacitorjs.com/docs/guides/live-reload
- Capacitor Plugins: https://capacitorjs.com/docs/plugins
- Capacitor Official APIs: https://capacitorjs.com/docs/apis
- Barcode Scanner: https://capacitorjs.com/docs/apis/barcode-scanner
- Preferences: https://capacitorjs.com/docs/apis/preferences
- Network: https://capacitorjs.com/docs/apis/network
- Capacitor Security: https://capacitorjs.com/docs/guides/security
- Apple Local Network permission: https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription
- Android Network Security Config: https://developer.android.com/privacy-and-security/security-config

