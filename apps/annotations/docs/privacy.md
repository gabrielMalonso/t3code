# Privacidade

Annotations processa tudo localmente no navegador.

- Nenhum upload.
- Nenhuma telemetria.
- Nenhum servidor local.
- Nenhuma permissão ampla de host por padrão.
- A permissão `activeTab` limita o acesso à aba que o usuário ativou.
- A permissão `downloads` é usada para salvar o PNG localmente em `Downloads/Annotations-PNG/`.
- A permissão `storage` guarda apenas a subpasta configurada de Downloads, quando existir.
- O PNG salvo usa crop ao redor do elemento selecionado, não a página inteira, e não desenha comentário ou metadados.
- A nota copiada contém o caminho absoluto local do PNG salvo.
- Texto visível, seletores e metadados copiados são redigidos e truncados no modo padrão.
- O slug do arquivo PNG também redige valores sensíveis vindos do seletor selecionado.
- Valores longos em parâmetros de URL também são redigidos, como `membershipId=<redacted>`.
- O modo padrão é `redact-sensitive`.

## Redacao basica

O MVP redige:

- e-mails;
- telefones;
- CPF e CNPJ;
- tokens longos;
- sequencias longas de numeros;
- parâmetros sensíveis de URL, como `token`, `password`, `secret`, `session` e similares;
- parâmetros de URL com valores longos, especialmente chaves terminadas em `id`.

O usuário ainda deve revisar a nota e o screenshot antes de colar em qualquer agente ou ferramenta externa, especialmente porque o path absoluto pode revelar nome de usuário, estrutura de pastas ou volume local.
