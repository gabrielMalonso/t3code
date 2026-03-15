---
name: upstream-sync
description: "Verifica atualizacoes no upstream do t3code e compara com o changelog local. Use quando o usuario pedir '/upstream-sync', 'verifica upstream', 'check upstream', 'atualiza upstream', ou qualquer pedido para verificar novidades do repositorio upstream."
argument-hint: ""
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# Upstream Sync — Verificacao e analise de atualizacoes

## Workflow

### 1. Ler o changelog local

Leia o arquivo `.context/upstream-sync.md` no diretorio do workspace.

- Extraia o **ultimo commit upstream sincronizado** (hash e data)
- Extraia a lista de **mudancas locais exclusivas** (reimplementacoes)
- Se o arquivo nao existir, avise o usuario e faca a analise completa

### 2. Fetch upstream

```bash
git fetch upstream
```

### 3. Listar novos commits

Liste apenas commits do upstream **posteriores** ao ultimo commit sincronizado:

```bash
git log <ultimo_hash_sincronizado>..upstream/main --oneline --reverse
```

Se retornar vazio, informe: "Nenhuma atualizacao nova no upstream desde o ultimo sync."

### 4. Analise cruzada

Para cada novo commit upstream:

1. **Verificar por PR number**: buscar `git log origin/main --oneline --grep="#NNN"`
2. **Verificar por conteudo semantico**: comparar a descricao com a tabela de "Mudancas locais exclusivas" do changelog
3. **Verificar por arquivos modificados**: `git show <hash> --stat` e comparar se os mesmos arquivos foram alterados localmente

Classificar cada commit em:

- **Ja sincronizado** — existe localmente (por hash, PR, ou reimplementacao)
- **Novo simples** — mudanca isolada sem conflito previsto (CSS, docs, config, chore)
- **Novo moderado** — feature/fix que toca areas comuns mas sem sobreposicao direta
- **Atencao especial** — toca areas que foram modificadas significativamente no fork (ChatView, sub-threads, skills, streaming, etc.)

### 5. Apresentar relatorio

Formato:

```
## Upstream Sync Report — [data]

### Resumo
- X commits novos no upstream
- Y ja sincronizados
- Z pendentes (N simples, M moderados, K atencao especial)

### Pendentes — Simples
| Hash | Descricao | Arquivos |
|---|---|---|

### Pendentes — Moderado
| Hash | Descricao | Arquivos | Risco |
|---|---|---|---|

### Pendentes — Atencao Especial
| Hash | Descricao | Arquivos | Conflito potencial |
|---|---|---|---|

### Ja sincronizados (ignorados)
<lista resumida>
```

### 6. Perguntar ao usuario

Apos o relatorio, perguntar:

- "Quer que eu traga os commits simples agora?"
- "Quer revisar os moderados/especiais individualmente?"

### 7. Atualizar changelog

Apos qualquer sync realizado, atualizar `.context/upstream-sync.md`:

- Atualizar "Ultimo sync" com a nova data
- Atualizar "Ultimo commit upstream sincronizado"
- Adicionar entrada no historico
- Atualizar tabela de "Mudancas locais exclusivas" se necessario

## Regras importantes

- NUNCA assumir que um commit upstream ja foi trazido apenas por similaridade vaga. Verificar arquivos e conteudo real.
- Commits de contribuidores (vouched lists, typos em docs) sao sempre "simples"
- Commits que tocam `ChatView.tsx`, `chat/`, `composer/`, `skills/`, `streaming/` precisam de verificacao extra contra mudancas locais
- Sempre preservar features exclusivas do fork (sub-threads, skills, Claude adapter, favorite model)
- Preferir cherry-pick individual para commits simples e squash merge para lotes grandes
