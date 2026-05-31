# Limitacoes

- Chrome/Chromium e o unico navegador suportado no MVP.
- `chrome://`, `chrome-extension://`, páginas internas e Chrome Web Store não permitem injeção normal.
- `file://` pode exigir permissão manual no Chrome.
- Elementos fora do viewport não são capturados por inteiro.
- Iframes cross-origin sao limitados pela seguranca do navegador.
- Shadow DOM aberto pode ser inspecionado quando acessivel; Shadow DOM fechado aparece como host.
- Downloads podem ficar pendentes ou ser bloqueados por politica/prompt do Chrome; nesses casos a captura falha sem inventar path local.
- A pasta configurável é uma subpasta relativa a Downloads; o Chrome não permite escolher um path absoluto arbitrário sem helper nativo.
- O path absoluto so entra na nota quando `chrome.downloads.search` confirma `DownloadItem.filename`.
- Clipboard de texto pode ser bloqueado pelo navegador ou ambiente mesmo depois do PNG salvo. Nesse caso, o fallback mostra a nota completa em textarea selecionada.
- Não há botões separados de copiar PNG, salvar PNG ou copiar texto no fallback principal.
- O MVP não tenta editar código, localizar arquivos, chamar agentes ou sincronizar histórico.
