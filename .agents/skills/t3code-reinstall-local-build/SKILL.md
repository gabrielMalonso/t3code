---
name: t3code-reinstall-local-build
description: Reinstala rapidamente o T3 Code a partir do build local custom arm64 no repo /Volumes/SSD1TB/Projetos/t3code, sem Homebrew, sem validações longas, preservando alterações locais e confirmando só versão/build instalada.
---

# T3 Code Local Reinstall

Use esta skill quando o usuário pedir para reinstalar o **T3 Code (Alpha)** usando o build local custom do repo `/Volumes/SSD1TB/Projetos/t3code`.

## Regra central

Faça só o necessário. Não rode `brew install --cask t3-code`, `bun fmt`, `bun lint`, `bun typecheck`, testes, buscas no bundle ou validações demoradas.

## Execução

Rode o script bundled:

```bash
.agents/skills/t3code-reinstall-local-build/scripts/reinstall-local-arm64.sh
```

O script faz:

1. Fecha o app `T3 Code (Alpha)`, se estiver aberto.
2. Remove `/Applications/T3 Code (Alpha).app`.
3. Lê a versão em `apps/desktop/package.json`.
4. Limpa artefatos arm64 dessa versão em `release/`.
5. Roda `bun run dist:desktop:dmg:arm64`.
6. Monta o DMG arm64 gerado em `release/`.
7. Copia `T3 Code (Alpha).app` do DMG para `/Applications`.
8. Desmonta o DMG.
9. Imprime somente `T3 Code (Alpha) <version> (<build>)`.

## Resposta final

Responda em Português Brasileiro e confirme apenas a versão/build instalada. Se falhar, diga em uma frase qual etapa falhou e o erro essencial.
