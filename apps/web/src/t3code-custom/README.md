# t3code-custom

Tudo que diferencia este app da upstream deve morar aqui.

Antes de qualquer sync com `upstream/main`, consulte `.context/customizations.md`.
Esse inventario registra o que continua custom vivo, onde cada feature encosta no core e qual regra usar para resolver conflito sem cimentar vazamento.

Regras:

- Evite editar componentes core para lógica custom.
- Prefira pontos de encaixe pequenos no core.
- UI, hooks e comportamento específicos do fork ficam neste namespace.
- Se uma mudança exigir muito código dentro do core, pare e crie um slot.

Estrutura:

- `chat/`: slots e componentes visuais de customização do chat.
- `file-references/`: parser, serialização, copy e regras da feature de referência por path.
- `hooks/`: hooks específicos do fork, incluindo orquestração de comportamento custom do composer.
- `terminal/`: policy visual local do terminal quando o core só precisa consumir um helper pequeno.

Convenções:

- O core deve importar slots genéricos, não features específicas.
- Features específicas ficam atrás desses slots.
- Se surgir uma nova customização no composer, ela entra no slot do composer em vez de abrir novo diff espalhado no `ChatView`.
- Se a customização do composer precisar de orquestração, extraia para `t3code-custom/hooks/` e deixe o `ChatView` só passando dependências.
- Se uma feature precisar guardar estado de composer, prefira estender o `composerDraftStore` existente em vez de criar um store órfão.
