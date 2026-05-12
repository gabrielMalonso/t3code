# T3 Code Mobile

Wrapper Capacitor para o bundle de `apps/web`.

Fluxo esperado:

1. `bun --filter @t3tools/web build`
2. `bun --filter @t3tools/mobile sync`
3. Abrir iOS/Android pelo Capacitor.

O app mobile inicia neutro. Ele so conecta depois que um profile LAN ou Tailscale e pareado dentro da UI.

## Android release signing

Para gerar APK/AAB assinados, configure estes valores como variaveis de ambiente ou propriedades do Gradle:

- `T3CODE_ANDROID_KEYSTORE_PATH`
- `T3CODE_ANDROID_KEYSTORE_PASSWORD`
- `T3CODE_ANDROID_KEY_ALIAS`
- `T3CODE_ANDROID_KEY_PASSWORD`

Sem esses valores, o build de release continua funcionando, mas os artefatos saem unsigned e nao servem para publicar na Play Store.
