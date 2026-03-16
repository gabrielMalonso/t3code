# Upstream Sync — Changelog

## Status atual

- **Ultimo sync**: 2026-03-16
- **Ultimo commit upstream sincronizado**: `765c1dc9` fix(desktop): backfill SSH_AUTH_SOCK from login shell on macOS (#972)
- **Status**: 100% sincronizado com upstream/main

## Mudancas locais exclusivas (reimplementacoes)

Estas features foram implementadas localmente e diferem significativamente do upstream.
Quando o upstream tocar nesses arquivos, e necessario verificacao manual cruzada.

| Area | PRs locais | Descricao | Arquivos principais |
|---|---|---|---|
| Sub-threads | #25 | Arquitetura completa de sub-threads com tab bar | `ChatView.tsx`, `SubThreadTabBar.tsx`, `MessagesTimeline.tsx`, orchestration layers |
| ChatView split | #25, #26 e outros | Split do ChatView em componentes (equivalente ao upstream #860, mas com features exclusivas do fork) | `apps/web/src/components/chat/*` — 22 componentes incluindo `SubThreadTabBar.tsx`, `MessagesTimeline.logic.ts` |
| Favorite model | #23 | Modelo favorito global para novos chats | `ChatView.tsx`, settings, store |
| Skills system | #16, #20, #21 | Skills discovery, catalogs por provider, Codex skills | `skills/`, provider layers |
| Claude streaming | #18, #19 | ClaudeCodeAdapter Effect-native, work events e thinking UI | `ClaudeCodeAdapter.ts`, streaming components |
| Tab bar | #26 | Tab bar abaixo do action header | `ChatView.tsx`, layout components |
| Attachments | #24 | Suporte expandido a documentos e text files | Composer, attachment handlers |
| Image path fix | #28 | Fix para passar image file path ao modelo | Provider layers |

## Commits upstream que foram reimplementados localmente (hashes diferentes)

Estes commits existem no upstream mas foram trazidos com hashes diferentes
(cherry-pick com resolucao de conflitos ou reimplementacao):

| Upstream hash | Upstream descricao | Local hash | Nota |
|---|---|---|---|
| `e3d46b68` | feat: split out components from ChatView.tsx (#860) | Varios (sub-threads #25 etc.) | Reimplementado com features exclusivas do fork. Todos os 17+ componentes do upstream existem localmente + extras (SubThreadTabBar, MessagesTimeline.logic) |
| `7d115334` | Stabilize runtime orchestration (#488) | `02f8bae9` | Cherry-pick com adaptacoes |
| `e8b01263` | fix: checkpoint diffs never resolve (#595) | `8f9a519f` | Cherry-pick |
| `13eeb07f` | prevent squashing some know errors | `fce79c74` | Cherry-pick |
| `ddd98876` | fix: invalidate workspace entry cache (#796) | `0fb73621` | Cherry-pick |
| `9e891d2e` | Display application version (#720) | `528227ac` | Cherry-pick |
| `2c351726` | fix(contracts): align terminal restart (#597) | `facb2c66` | Cherry-pick |
| `9becb3f4` | fix(server): skip auth check Codex (#649) | `3451f6b8` | Cherry-pick |
| `1c290767` | fix: commit default git action (#642) | `b0b78ad8` | Cherry-pick |
| `1e9bac7f` | Sync desktop native theme (#800) | `20e7ac27` | Cherry-pick |
| `b37279ca` | fix: Codex overrides footer overflow (#707) | `f402c91b` | Cherry-pick |
| `dfd41da2` | Fix Windows keybindings font size (#786) | `6913e0c5` | Cherry-pick |
| `1031a226` | Fix cross-repo PR detection (#788) | `94c6d2f6` | Cherry-pick |
| `90d9a2ad` | fix: map gitignore to ini Shiki (#848) | `5f23a89e` | Cherry-pick |
| `9e4e2219` | added eggfriedrice24 to vouched (#869) | `f7c418b6` | Cherry-pick |
| `7ddcb239` | feat: persist diff panel state (#875) | `8000acb2` | Cherry-pick |
| `bbab1fc8` | chore(release): prepare v0.0.10 | `cadc92e8` | Cherry-pick |
| `2ac73565` | chore(release): align package versions (#933) | `f1ab2335` | Cherry-pick |
| `ff6a66dc` | Use live thread activities sidebar (#919) | `6e33de2f` | Cherry-pick |
| `8636ea0e` | Add maria-rcks to contributors | `05440b63` | Cherry-pick |
| `774cff9a` | ci: add pull request size labels (#901) | `ae32b221` | Cherry-pick |
| `065ef922` | Require bun fmt for completion | `78a13e86` | Cherry-pick |

## Historico de syncs

### 2026-03-16 — Sync 2 commits simples

- `e6d9a271` fix(github): fix bug report issue template for screenshots (#1109)
- `765c1dc9` fix(desktop): backfill SSH_AUTH_SOCK from login shell on macOS (#972)

### 2026-03-15 — PR #27: sync 5 upstream commits

- `cc2ab000` chore: add .idea/ to .gitignore (#1077)
- `4b811dae` Fixed Typos in Agents.md (#1120)
- `6d76865e` fix: tighten node engine range for node:sqlite compat (#1096)
- `8b8e8b38` fix(web): unify focus ring styles across sidebar and app (#1079)
- `2bb71f41` feat(web): add scroll to bottom pill in chat view (#619)

### 2026-03-14 — PR #22: sync upstream commits (v0.0.11 catchup)

~20 commits incluindo: worktree dropdown (#1001), Astro 6 (#1005), issue templates (#896),
Actions dialog (#912), Antigravity editor (#841), block image plan mode (#621),
vite-plugin-react (#1002), diff worker defer (#934), clipboard hook (#1006),
oxfmt upgrade (#1010), Codex tool-call icons (#988), timestamp format (#855),
thread env mode (#892), composer autocomplete (#936), preferred editor (#662)

### 2026-03-12 — PR #13: cherry-pick 14 upstream commits

Incluindo: dev runner fix (#986), fuzzy workspace search (#256), PlanSidebar cleanup (#949),
Linux icon (#807), WebSocket logging (#948), code highlighting logging (#951),
project removal copy (#981), new-thread shortcuts, stop-generation cursor (#900)

### 2026-03-12 — PR #12: cherry-pick 7 upstream commits

Incluindo: Ymit24 vouched (#959), logo macOS (#960), response duration (#866),
diff panel fix (#937), Plan mode cursor (#867), selective staging (#872), preferred editor (#662)
