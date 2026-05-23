---
name: t3code-reinstall-local-build
description: Reinstala rapidamente o T3 Code a partir do build local custom arm64 no repo /Volumes/SSD1TB/Projetos/t3code, sem Homebrew nem validações longas, preservando alterações locais e protegendo dados persistentes com backup/checagem antes de trocar o app.
---

# T3 Code Local Reinstall

Use esta skill quando o usuário pedir para reinstalar o **T3 Code (Alpha)** usando o build local custom do repo `/Volumes/SSD1TB/Projetos/t3code`.

## Regra central

Faça só o necessário. Não rode `brew install --cask t3-code`, testes, buscas no bundle ou validações demoradas.

Antes de remover/reinstalar o app, o script precisa:

1. Fechar o `T3 Code (Alpha)` para estabilizar SQLite/WAL e LocalStorage.
2. Fazer checkpoint do `~/.t3/userdata/state.sqlite`, quando existir.
3. Criar backup em `~/Desktop/t3code-data-backups/pre-reinstall-<timestamp>/`.
4. Copiar `~/.t3/userdata` e `~/Library/Application Support/t3code/Local Storage`.
5. Gravar `before-summary.txt` e `before-fingerprint.sha256`.
6. Depois da reinstalação, gravar `after-summary.txt` e `after-fingerprint.sha256`.
7. Comparar fingerprints; se qualquer dado persistente mudar, abortar com erro e apontar o backup/diff.

Isto protege conversas, projetos, eventos, runtime cursors, anexos e rascunhos locais. A reinstalação em si deve trocar somente `/Applications/T3 Code (Alpha).app` e artefatos de build em `release/`.

O build macOS local precisa ser assinado com uma identidade estável. O script resolve automaticamente `T3CODE_DESKTOP_MAC_SIGNING_IDENTITY`, preferindo `Developer ID Application`, depois `Apple Development`, depois `Apple Distribution`, e aborta se não houver identidade válida. Se o app anterior ou as entradas TCC ainda estiverem presas em assinatura ad-hoc/cdhash, o script reseta `ScreenCapture`, `Accessibility` e `AppleEvents` para `com.t3tools.t3code` para forçar uma nova autorização limpa. O app instalado tambem precisa conter o entitlement `com.apple.security.automation.apple-events`; sem ele, o Computer Use via MCP pode ficar pronto mas travar ao listar ou controlar apps.

## Execução

Rode o script bundled:

```bash
.agents/skills/t3code-reinstall-local-build/scripts/reinstall-local-arm64.sh
```

O script faz:

1. Fecha o app `T3 Code (Alpha)`, se estiver aberto.
2. Faz backup e fingerprint dos dados persistentes.
3. Remove `/Applications/T3 Code (Alpha).app`.
4. Lê a versão em `apps/desktop/package.json`.
5. Limpa artefatos arm64 dessa versão em `release/`.
6. Resolve uma identidade macOS estável e roda `bun run dist:desktop:dmg:arm64` com assinatura habilitada.
7. Monta o DMG arm64 gerado em `release/`.
8. Copia `T3 Code (Alpha).app` do DMG para `/Applications`.
9. Desmonta o DMG.
10. Verifica que o app instalado não ficou ad-hoc, tem `TeamIdentifier` estável e inclui o entitlement de Apple Events.
11. Reseta TCC quando necessário para remover permissões antigas presas ao cdhash.
12. Refaz fingerprint dos dados persistentes e compara com o estado anterior.
13. Imprime `T3 Code (Alpha) <version> (<build>)` e o caminho do backup.

## Resposta final

Responda em Português Brasileiro e confirme a versão/build instalada, se os dados ficaram preservados e o caminho do backup. Se falhar, diga em uma frase qual etapa falhou e o erro essencial; se o guardião de dados detectar mudança, destaque o backup e o arquivo `fingerprint.diff`.
