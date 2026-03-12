# Tool Calls - Schemas e Rendering

## Como Tools Funcionam no Agent SDK

O Agent SDK executa tools internamente (no processo Claude Code). O nosso app recebe:

1. `tool_use` content block no `SDKAssistantMessage` (ou via streaming)
2. `tool_use_result` no `SDKUserMessage` seguinte

O app NAO precisa executar tools -- o SDK faz isso. O app so precisa RENDERIZAR.

## Tools Built-in e Seus Schemas

### Edit (edicao de arquivo)

**Input:**

```typescript
type FileEditInput = {
  file_path: string; // caminho absoluto
  old_string: string; // texto exato a ser substituido (deve ser unico)
  new_string: string; // texto substituto
  replace_all?: boolean; // substituir todas as ocorrencias (default: false)
};
```

**Output (tool_use_result):**

```typescript
type FileEditOutput = {
  filePath: string;
  oldString: string;
  newString: string;
  originalFile: string; // conteudo original completo
  structuredPatch: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[]; // prefixadas com +, -, ou espaco
  }>;
  userModified: boolean;
  replaceAll: boolean;
  gitDiff?: {
    filename: string;
    status: "modified" | "added";
    additions: number;
    deletions: number;
    changes: number;
    patch: string; // patch no formato git
  };
};
```

**Como renderizar:**

- Mostrar nome do arquivo
- Usar `structuredPatch` para renderizar diff unificado (linhas com +/-/espaco)
- Ou usar `gitDiff.patch` para formato git padrao
- Mostrar contagem de additions/deletions

---

### Write (criar/reescrever arquivo)

**Input:**

```typescript
type FileWriteInput = {
  file_path: string;
  content: string;
};
```

**Output:**

```typescript
type FileWriteOutput = {
  type: "create" | "update";
  filePath: string;
  content: string;
  structuredPatch: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>;
  originalFile: string | null; // null se arquivo novo
  gitDiff?: {
    filename: string;
    status: "modified" | "added";
    additions: number;
    deletions: number;
    changes: number;
    patch: string;
  };
};
```

**Como renderizar:**

- Se `type: "create"` -> badge "New File"
- Se `type: "update"` -> diff completo com `structuredPatch`
- Mostrar conteudo completo colapsavel

---

### Read (leitura de arquivo)

**Input:**

```typescript
type FileReadInput = {
  file_path: string;
  offset?: number;
  limit?: number;
  pages?: string; // para PDFs
};
```

**Output (union discriminada):**

```typescript
type FileReadOutput =
  | {
      type: "text";
      file: {
        filePath: string;
        content: string;
        numLines: number;
        startLine: number;
        totalLines: number;
      };
    }
  | { type: "image"; file: { base64: string; type: string; originalSize: number } }
  | { type: "notebook"; file: { filePath: string; cells: unknown[] } }
  | { type: "pdf"; file: { filePath: string; base64: string; originalSize: number } };
```

**Como renderizar:**

- Card colapsado mostrando nome do arquivo + range de linhas
- Expandir para ver conteudo com syntax highlighting

---

### Bash (execucao de comando)

**Input:**

```typescript
type BashInput = {
  command: string;
  timeout?: number;
  description?: string;
  run_in_background?: boolean;
};
```

**Output:**

```typescript
type BashOutput = {
  stdout: string;
  stderr: string;
  interrupted: boolean;
  isImage?: boolean;
  backgroundTaskId?: string;
  rawOutputPath?: string;
};
```

**Como renderizar:**

- Card com `description` (ou o command) como titulo
- Terminal-style output com stdout/stderr
- Badge se `interrupted: true`
- Badge se background task

---

### Glob (busca de arquivos)

**Input:**

```typescript
type GlobInput = {
  pattern: string; // ex: "**/*.ts"
  path?: string;
};
```

**Como renderizar:** Lista de arquivos encontrados, colapsavel.

---

### Grep (busca de conteudo)

**Input:**

```typescript
type GrepInput = {
  pattern: string;
  path?: string;
  glob?: string;
  output_mode?: "content" | "files_with_matches" | "count";
};
```

**Como renderizar:** Resultados de busca com linhas matching, colapsavel.

---

### WebFetch / WebSearch

**Input:**

```typescript
type WebFetchInput = { url: string; prompt: string };
type WebSearchInput = { query: string };
```

**Como renderizar:** Card com URL/query e resultado.

---

### Agent (subagent)

Quando Claude spawna um subagent, as mensagens filhas tem `parent_tool_use_id` non-null.

**Como renderizar:**

- Card com nome do subagent e descricao
- Conteudo do subagent aninhado (indent ou secao colapsavel)
- Resultado final do subagent

---

## Identificando o Tool pelo Nome

No `tool_use` content block:

```typescript
block.name === "Edit"; // edicao de arquivo
block.name === "Write"; // criacao/reescrita
block.name === "Read"; // leitura
block.name === "Bash"; // terminal
block.name === "Glob"; // busca de arquivos
block.name === "Grep"; // busca de conteudo
block.name === "WebFetch"; // fetch de URL
block.name === "WebSearch"; // busca na web
block.name === "Agent"; // subagent
block.name === "NotebookEdit"; // notebook
```

## Mapeamento para Nosso Sistema de Activities

No nosso app, cada tool call pode ser mapeada para `OrchestrationThreadActivity`:

| Tool  | Activity Kind (proposto) |
| ----- | ------------------------ |
| Edit  | `file.change.edit`       |
| Write | `file.change.write`      |
| Read  | `tool.read`              |
| Bash  | `command.execute`        |
| Glob  | `tool.search`            |
| Grep  | `tool.search`            |
| Agent | `task.subagent`          |

## Streaming de Tool Input (JSON parcial)

Durante streaming, o input do tool chega como fragments JSON:

```
input_json_delta: ""
input_json_delta: '{"file_path":'
input_json_delta: ' "/src/main.ts"'
input_json_delta: ', "old_string": "const x = 1"'
input_json_delta: ', "new_string": "const x = 2"}'
```

Para UI responsiva:

1. Acumular os fragments
2. Tentar parse parcial periodicamente (try/catch)
3. Mostrar preview do que ja e parseavel (ex: file_path assim que disponivel)
4. Parse final no `content_block_stop`
