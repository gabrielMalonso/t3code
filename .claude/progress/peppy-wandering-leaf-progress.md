# Progress: Portar Image Path Fix + Document Attachments

> Iniciado em: 2026-03-21
> Plano: /Users/gabrielalonso/.claude/plans/peppy-wandering-leaf.md
> Progress: /Volumes/SSD1TB/Conductor/workspaces/t3code-v1/providence/.claude/progress/peppy-wandering-leaf-progress.md
> Stack: TypeScript monorepo (Effect-TS, Vitest, React, Tailwind)
> Validacao: `bun run build`, `bun run typecheck`, `bun run lint`, `bun run test`

## Waves

### Wave 1: Image Path Fix (server only)
- Status: CONCLUIDA
- Tarefas: #1
- Arquivos: ClaudeAdapter.ts, ClaudeAdapter.test.ts
- Resultado: 38/38 testes passando

### Wave 2: Contracts
- Status: CONCLUIDA
- Tarefas: #2
- Arquivos: orchestration.ts, orchestration.test.ts
- Resultado: 65/65 testes passando (7 test files)

### Wave 3: Server Storage Layer
- Status: CONCLUIDA
- Tarefas: #3
- Arquivos: imageMime.ts, attachmentStore.ts, wsServer.ts, attachmentStore.test.ts
- Resultado: 9/9 testes passando, typecheck 0 erros (7 packages)

### Wave 4: Server Adapter Layer
- Status: CONCLUIDA
- Tarefas: #4
- Arquivos: ClaudeAdapter.ts, ClaudeAdapter.test.ts, CodexAdapter.ts, codexAppServerManager.ts, codexAppServerManager.test.ts
- Resultado: 39/39 testes passando (ClaudeAdapter), 35/35 testes passando (codexAppServerManager), typecheck 0 erros

### Wave 5: Web Types e Store
- Status: CONCLUIDA
- Tarefas: #5
- Arquivos: types.ts, store.ts, composerDraftStore.ts, MessagesTimeline.tsx, ClaudeTraitsPicker.browser.tsx, CodexTraitsPicker.browser.tsx, CompactComposerControlsMenu.browser.tsx
- Resultado: typecheck 0 erros (7 packages)

### Wave 6: Web UI
- Status: PENDENTE
- Tarefas: #6
- Arquivos: ChatView.tsx, MessagesTimeline.tsx

### Wave 7: Validação Final
- Status: PENDENTE
- Tarefas: #7

## Descobertas dos Subagentes

- Wave 1: Nenhuma descoberta inesperada. O `resolveAttachmentPath` retorna o path absoluto completo (via `path.resolve`), entao o text block no content array contem o path absoluto do attachment no disco.
- Wave 2: Sintaxe do Effect Schema confirmada: `.check()` aceita multiplos argumentos (`Schema.isMaxLength`, `Schema.isPattern`, `Schema.isLessThanOrEqualTo`). `UploadChatAttachment` const precisou ser exportado (era `const`, mudou para `export const`) para permitir testes e uso em outros modulos.
- Wave 3: Nenhuma descoberta inesperada. O switch em `attachmentRelativePath` compila sem default case graças ao tipo discriminado `ChatAttachment["type"]`. O `persistedAttachment` em wsServer com `type: attachment.type` (dinâmico) compila corretamente pois TypeScript infere o tipo da union.
- Wave 4: O plano sugeria retornar `ProviderAdapterRequestError` para PDFs no Codex, mas o padrao mais seguro e skip silencioso (return null + filter), pois o usuario pode ter attachments mistos e nao queremos falhar o turn inteiro. O `Effect.forEach` no CodexAdapter retorna array que pode conter null, entao filtramos com type guard `NonNullable`. O `TextDecoder` e usado para converter bytes para string UTF-8 (text_file).
- Wave 5: Expandir `ChatAttachment` union causou 5 erros colaterais: 3 browser test files construiam `ComposerThreadDraftState` inline sem `documents`, e `MessagesTimeline.tsx` acessava `previewUrl` diretamente no union (que agora inclui tipos sem esse campo). Ambos foram corrigidos. O fix em MessagesTimeline antecipou parte do trabalho da Wave 6 (separar images de documents na renderizacao).

## Log de Execucao

- [2026-03-21] Wave 1 concluida: Image Path Fix
  - Tarefa 1.1: Adicionado bloco de texto com path antes do bloco de imagem base64 em `ClaudeAdapter.ts:buildUserMessageEffect`
  - Tarefa 1.2: Teste `"embeds image attachments in Claude user messages"` atualizado para esperar 3 content blocks (texto usuario + texto path + imagem base64)
  - Verificacao: 38/38 testes passando em ClaudeAdapter.test.ts
- [2026-03-21] Wave 2 concluida: Contracts (Document Attachment types)
  - Tarefa 2.1: Adicionadas 4 constantes de tamanho (DOCUMENT 30MB, DOCUMENT_DATA_URL 42M chars, TEXT_FILE 5MB, TEXT_FILE_DATA_URL 7M chars)
  - Tarefa 2.2: Adicionados 4 schemas (ChatDocumentAttachment, UploadChatDocumentAttachment, ChatTextFileAttachment, UploadChatTextFileAttachment)
  - Tarefa 2.3: Expandidas unions ChatAttachment e UploadChatAttachment para incluir os 3 tipos (image, document, text_file). UploadChatAttachment exportado como const
  - Tarefa 2.4: Adicionados 7 testes de schema (valid PDF, 30MB reject, valid text_file, 5MB reject, non-PDF mimeType reject, upload document dataUrl, upload text_file dataUrl)
  - Verificacao: 65/65 testes passando em packages/contracts (7 test files)
- [2026-03-21] Wave 3 concluida: Server Storage Layer
  - Tarefa 3.1: Adicionados DOCUMENT_EXTENSION_BY_MIME_TYPE, TEXT_FILE_EXTENSION_BY_MIME_TYPE, SAFE_DOCUMENT_FILE_EXTENSIONS e inferDocumentExtension() em imageMime.ts
  - Tarefa 3.2: Expandido ATTACHMENT_FILENAME_EXTENSIONS com SAFE_DOCUMENT_FILE_EXTENSIONS, adicionados cases "document"/"text_file" em attachmentRelativePath()
  - Tarefa 3.3: Reescrita normalizacao em wsServer.ts com branch por attachment.type (image/document/text_file), limites de tamanho por tipo, persistedAttachment.type dinâmico, mensagens de erro genéricas
  - Tarefa 3.4: Adicionados 4 testes em attachmentStore.test.ts (relative path .pdf, relative path .txt, resolve .pdf do disco, resolve .txt do disco)
  - Verificacao: 9/9 testes passando, typecheck 0 erros em 7 packages
- [2026-03-21] Wave 4 concluida: Server Adapter Layer
  - Tarefa 4.1: Reestruturado loop de attachments em `ClaudeAdapter.ts:buildUserMessageEffect` — removido `if (attachment.type !== "image") continue`, substituido por switch com cases image/document/text_file. resolveAttachmentPath movido para ANTES do switch (compartilhado). Adicionado teste `"embeds document and text_file attachments as text-only blocks"`
  - Tarefa 4.2: Expandido `CodexAppServerSendTurnInput.attachments` para aceitar `text_file` com content/name. Adicionado branch `else if (attachment.type === "text_file")` em `sendTurn` que wrapa conteudo em delimitadores `--- name ---`. Adicionado teste `"wraps text_file content in fenced delimiter block"`
  - Tarefa 4.3: Reescrito `codexAttachments` em `CodexAdapter.ts:sendTurn` com branching por tipo: document retorna null (skip silencioso), text_file le bytes e converte para string UTF-8 via TextDecoder, image mantem logica existente. Array filtrado para remover nulls antes de enviar
  - Verificacao: ClaudeAdapter 39/39 testes, codexAppServerManager 35/35 testes, typecheck 0 erros
- [2026-03-21] Wave 5 concluida: Web Types e Store
  - Tarefa 5.1: Adicionadas interfaces `ChatDocumentAttachment` e `ChatTextFileAttachment` em types.ts, expandido union `ChatAttachment` para 3 tipos
  - Tarefa 5.2: Reescrito mapeamento de attachments em store.ts — `type` agora vem do dado real (nao hardcoded "image"), `previewUrl` so gerado para `attachment.type === "image"`
  - Tarefa 5.3: Adicionada `ComposerDocumentAttachment` interface em composerDraftStore.ts, campo `documents: ComposerDocumentAttachment[]` ao draft state, metodos `addDocument`/`addDocuments`/`removeDocument`, `COMPOSER_DRAFT_STORAGE_VERSION` incrementado de 2 para 3, documents NAO persistidos no localStorage
  - Fix colateral: Adicionado `documents: []` em 3 arquivos de browser test (ClaudeTraitsPicker, CodexTraitsPicker, CompactComposerControlsMenu) que construiam ComposerThreadDraftState inline
  - Fix colateral: Atualizado MessagesTimeline.tsx para filtrar attachments por tipo — `userImages` (type === "image") renderiza em grid com `<img>`, `userDocuments` (type !== "image") renderiza como chips com nome
  - Verificacao: typecheck 0 erros em 7 packages
