# Annotations

Extensão Chrome local para selecionar visualmente um elemento, escrever um comentário, salvar um PNG cropado e copiar uma UI Note para agentes de código.

## Usar localmente

```bash
bun install
bun --filter @t3tools/annotations build
```

Depois, abra `chrome://extensions`, ative o modo de desenvolvedor e carregue a pasta `dist` como extensão unpacked.

## Fluxo

1. Abra uma página web.
2. Clique no ícone da extensão ou use `Alt+A` para abrir o overlay.
3. Clique em `Pick` para ligar a seleção.
4. Passe o mouse sobre um elemento.
5. Clique para travar a seleção.
6. Escreva o comentário.
7. Clique em `Copiar` ou pressione `Cmd+Enter`.
8. Cole a nota Markdown no agente de código.

O PNG é salvo em `Downloads/Annotations-PNG/`. A nota copiada separa `## Prompt` do usuário de `## Informações`, que contém o path absoluto do arquivo salvo e um bloco técnico curto: URL redigida, elemento selecionado, elemento no ponto, texto, ponto, rect e pistas de layout. Se o clipboard de texto for bloqueado depois do download, Annotations abre um fallback com a nota completa selecionada para cópia manual.

A subpasta de Downloads pode ser configurada via `chrome.storage.local` na chave `annotationsDownloadFolder`; se ela não existir, o fallback é `Annotations-PNG`.

## Validacao

```bash
bun --filter @t3tools/annotations lint
bun --filter @t3tools/annotations typecheck
bun --filter @t3tools/annotations test
bun --filter @t3tools/annotations build
bun --filter @t3tools/annotations e2e
bun --filter @t3tools/annotations smoke
```

## Escopo

Annotations não tem backend, MCP, servidor local, automação de código, login, cloud, telemetria, Native Messaging ou histórico sincronizado. Os artefatos principais são o PNG local salvo e a nota Markdown copiada.

## Documentacao

- [Arquitetura](docs/architecture.md)
- [Privacidade](docs/privacy.md)
- [Limitacoes](docs/limitations.md)

## Attribution

O padrão de interação foi desenhado com Impeccable Live como referência para picker, highlight, anotação e contexto visual. Ver [NOTICE.md](NOTICE.md).
