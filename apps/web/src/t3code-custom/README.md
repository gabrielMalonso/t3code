# t3code-custom

Tudo que diferencia este app da upstream deve morar aqui.

Regras:

- Evite editar componentes core para lógica custom.
- Prefira pontos de encaixe pequenos no core.
- UI, hooks e comportamento específicos do fork ficam neste namespace.
- Se uma mudança exigir muito código dentro do core, pare e crie um slot.

Estrutura:

- `chat/`: slots e componentes visuais de customização do chat.
- `file-references/`: parser, serialização, copy e regras da feature de referência por path.
- `hooks/`: hooks específicos do fork.

Convenções:

- O core deve importar slots genéricos, não features específicas.
- Features específicas ficam atrás desses slots.
- Se surgir uma nova customização no composer, ela entra no slot do composer em vez de abrir novo diff espalhado no `ChatView`.
- Se uma feature precisar guardar estado de composer, prefira estender o `composerDraftStore` existente em vez de criar um store órfão.
