# Claude Agent SDK - Documentacao para T3 Code

Documentacao de referencia para integrar modelos Anthropic (Claude) no T3 Code.

## Indice

| #   | Arquivo                                                      | Conteudo                                                               |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 01  | [agent-sdk-overview](./01-agent-sdk-overview.md)             | Visao geral do SDK, instalacao, options, modelos, comparacao com Codex |
| 02  | [message-types](./02-message-types.md)                       | Todos os tipos de mensagem do SDK (SDKMessage union)                   |
| 03  | [streaming-pipeline](./03-streaming-pipeline.md)             | Como consumir streaming e renderizar na UI em tempo real               |
| 04  | [tool-calls](./04-tool-calls.md)                             | Schemas de input/output de cada tool, como renderizar diffs            |
| 05  | [extended-thinking](./05-extended-thinking.md)               | Configuracao, streaming e rendering de thinking blocks                 |
| 06  | [permissions-and-hooks](./06-permissions-and-hooks.md)       | Modos de permissao, canUseTool callback, hooks                         |
| 07  | [sessions-and-multi-turn](./07-sessions-and-multi-turn.md)   | Persistencia, resume, fork, streaming input                            |
| 08  | [integration-architecture](./08-integration-architecture.md) | Como encaixar no T3 Code: adapter, mapeamento, mudancas por camada     |
| 09  | [subagents](./09-subagents.md)                               | Subagents customizados e built-in                                      |
| 10  | [messages-api-reference](./10-messages-api-reference.md)     | Alternativa: usar Messages API diretamente                             |

## Decisao Principal

**Agent SDK** (`@anthropic-ai/claude-agent-sdk`):

- Spawna processo Claude Code como child
- Gerencia loop agentico completo
- Tools built-in (Read, Write, Edit, Bash, etc.)
- Paridade total com Claude Code CLI
- Requer CLI `claude` instalado

**Messages API** (`@anthropic-ai/sdk`):

- API HTTP/SSE direta
- Controle total sobre tool execution
- Sem dependencia de CLI externo
- Mais trabalho de implementacao
- Podemos definir nossos proprios tools

## Leitura Recomendada

1. Comece por `01-agent-sdk-overview.md` para entender o SDK
2. Leia `03-streaming-pipeline.md` para entender o rendering
3. Leia `04-tool-calls.md` para entender os tools
4. Leia `08-integration-architecture.md` para ver o plano de integracao
