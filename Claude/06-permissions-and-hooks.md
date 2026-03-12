# Permissions e Hooks

## Permission Modes

O SDK tem modos de permissao built-in que controlam quais tools o Claude pode executar sem aprovacao:

| Modo                | Comportamento                                           |
| ------------------- | ------------------------------------------------------- |
| `default`           | Tools nao-aprovados disparam callback `canUseTool`      |
| `acceptEdits`       | Auto-aprova file edits (Edit, Write, mkdir, rm, mv, cp) |
| `bypassPermissions` | Tudo aprovado (APENAS para sandboxes)                   |
| `dontAsk`           | Rejeita qualquer tool nao pre-aprovado                  |
| `plan`              | Sem execucao, Claude apenas planeja                     |

## Ordem de Avaliacao

```
Hooks -> Deny rules -> Permission mode -> Allow rules -> canUseTool callback
```

## Callback `canUseTool`

Para controle fino de permissoes (human-in-the-loop):

```typescript
const options = {
  canUseTool: async (
    toolName: string,
    input: Record<string, unknown>,
    context: {
      signal: AbortSignal;
      suggestions?: PermissionUpdate[];
      toolUseID: string;
      agentID?: string;
    },
  ): Promise<PermissionResult> => {
    // Perguntar ao usuario via WebSocket
    const userDecision = await askUserForApproval(toolName, input);

    if (userDecision.approved) {
      return {
        behavior: "allow",
        updatedInput: userDecision.modifiedInput, // opcional: modificar input
        updatedPermissions: userDecision.newRules, // opcional: criar regras
      };
    }
    return {
      behavior: "deny",
      message: "User denied this tool",
      interrupt: false, // true = para o agente completamente
    };
  },
};
```

### Integracao com Nosso App

No nosso sistema, ja temos o conceito de `approval.requested` e `approval.resolved` nas activities. O `canUseTool` do Agent SDK pode ser mapeado para esse fluxo:

1. Agent SDK chama `canUseTool` -> cria activity `approval.requested`
2. WebSocket envia para o frontend -> UI mostra dialog de aprovacao
3. Usuario responde -> resolve a Promise do `canUseTool`
4. Activity `approval.resolved` e criada

## Hooks

Hooks permitem interceptar o comportamento do agente em pontos especificos.

### Hooks Disponíveis

| Hook                 | Quando                               |
| -------------------- | ------------------------------------ |
| `PreToolUse`         | Antes de executar um tool            |
| `PostToolUse`        | Depois de executar um tool           |
| `PostToolUseFailure` | Quando tool falha                    |
| `Notification`       | Notificacoes gerais                  |
| `UserPromptSubmit`   | Antes de processar prompt do usuario |
| `SessionStart`       | Inicio de sessao                     |
| `SessionEnd`         | Fim de sessao                        |
| `Stop`               | Quando agente para                   |
| `SubagentStart`      | Subagent iniciado                    |
| `SubagentStop`       | Subagent parado                      |
| `PreCompact`         | Antes de compactar contexto          |
| `PermissionRequest`  | Quando permissao e solicitada        |

### Exemplo de Hook

```typescript
const options = {
  hooks: {
    PreToolUse: [
      {
        matcher: "Write|Edit", // regex contra nome do tool
        hooks: [
          async (input, toolUseID, { signal }) => {
            // Logar no nosso sistema
            logToolAttempt(toolUseID, input);
            return {}; // {} = permitir, ou retornar deny
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: ".*",
        hooks: [
          async (input, toolUseID, { signal }) => {
            // Registrar tool executado
            recordToolExecution(toolUseID);
            return {};
          },
        ],
      },
    ],
  },
};
```

## Recomendacao para Nosso App

Para a primeira versao, usar:

```typescript
{
  permissionMode: "acceptEdits",  // auto-aprova file changes
  allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
  canUseTool: async (toolName, input) => {
    // Bash commands pedem aprovacao
    if (toolName === "Bash") {
      return await askUserApproval(toolName, input);
    }
    return { behavior: "allow" };
  }
}
```

Evolucao futura: implementar hooks para logging e controle mais fino.
