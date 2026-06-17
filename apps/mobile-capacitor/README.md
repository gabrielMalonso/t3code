# T3 Code Mobile Capacitor

Wrapper Capacitor para o bundle de `apps/web`.

Este app vive em `apps/mobile-capacitor` para deixar `apps/mobile` livre para
o app React Native do upstream. Nao misture os dois perimetros.

Fluxo esperado:

1. `bun --filter @t3tools/web build`
2. `bun --filter @t3tools/mobile-capacitor sync`
3. Abrir iOS/Android pelo Capacitor.

O app mobile inicia neutro. Ele so conecta depois que um profile LAN ou Tailscale e pareado dentro da UI.

## Android release signing

Para gerar APK/AAB assinados, configure estes valores como variaveis de ambiente ou propriedades do Gradle:

- `T3CODE_ANDROID_KEYSTORE_PATH`
- `T3CODE_ANDROID_KEYSTORE_PASSWORD`
- `T3CODE_ANDROID_KEY_ALIAS`
- `T3CODE_ANDROID_KEY_PASSWORD`

Sem esses valores, o build de release continua funcionando, mas os artefatos saem unsigned e nao servem para publicar na Play Store.
