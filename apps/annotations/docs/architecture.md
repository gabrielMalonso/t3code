# Arquitetura

Annotations é uma extensão Chrome Manifest V3 sem backend.

## Fluxo

1. O service worker recebe clique no icone ou `Alt+A`.
2. O worker injeta `content/boot.js` na aba ativa via `chrome.scripting.executeScript`.
3. O content script cria o overlay em Shadow DOM; o botão `Pick` liga ou desliga hover, seleção e comentário.
4. No botao `Copiar` ou `Cmd+Enter`, a UI se oculta, aguarda paint, e so entao coleta o contexto do elemento.
5. O worker chama `chrome.tabs.captureVisibleTab`.
6. O worker cria ou reutiliza `offscreen/offscreen.html` com reason `BLOBS`.
7. O offscreen document compoe apenas o crop contextual com highlight e devolve o PNG renderizado ao worker.
8. O worker salva o PNG via `chrome.downloads` na subpasta configurada de Downloads, por padrão `Annotations-PNG`, aguarda conclusão e confirma o path absoluto com `chrome.downloads.search`.
9. O worker monta uma nota Markdown minimalista `# UI Note`, separando `## Prompt` do usuário de `## Informações` com path absoluto, URL redigida, elemento selecionado, elemento no ponto, texto, ponto, rect e pistas curtas de layout.
10. O content script copia essa nota com `navigator.clipboard.writeText`; se o Chrome bloquear, mostra fallback manual com a nota completa selecionada.

## Build

Vite gera o service worker e o offscreen script como ES modules. O content script e empacotado via esbuild como IIFE porque arquivos injetados por `chrome.scripting.executeScript` precisam ser autocontidos.

## Sem servidor

Não há MCP, polling, WebSocket, SSE, servidor local, cloud, login, telemetria, Native Messaging ou histórico sincronizado.
