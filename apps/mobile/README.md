# T3 Code Mobile

Wrapper Capacitor para o bundle de `apps/web`.

Fluxo esperado:

1. `bun --filter @t3tools/web build`
2. `bun --filter @t3tools/mobile sync`
3. Abrir iOS/Android pelo Capacitor.

O app mobile inicia neutro. Ele so conecta depois que um profile LAN ou Tailscale e pareado dentro da UI.
