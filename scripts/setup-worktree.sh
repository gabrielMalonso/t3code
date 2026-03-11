#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Prepare a T3 Code git worktree for local development.

Usage:
  ./scripts/setup-worktree.sh
  ./scripts/setup-worktree.sh <target-worktree>
  ./scripts/setup-worktree.sh <target-worktree> --source <source-worktree>
  ./scripts/setup-worktree.sh <target-worktree> --skip-install

What it does:
  - copies local repo env/config files that are commonly missing in a new worktree
  - copies local editor directories if present (.cursor, .idea)
  - writes worktree-specific T3CODE_DEV_INSTANCE and T3CODE_STATE_DIR into .env.local
  - creates an isolated .t3/dev state directory inside the target worktree
  - checks bun/node/codex prerequisites
  - runs bun install in the target worktree (unless --skip-install is set)
EOF
}

log() {
  printf '==> %s\n' "$*"
}

warn() {
  printf 'WARNING: %s\n' "$*" >&2
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

resolve_abs_dir() {
  local dir="$1"
  [[ -d "$dir" ]] || die "Directory does not exist: $dir"
  (
    cd "$dir" >/dev/null 2>&1
    pwd -P
  )
}

resolve_repo_root() {
  local dir="$1"
  git -C "$dir" rev-parse --show-toplevel 2>/dev/null || die "Not inside a git repository: $dir"
}

resolve_git_common_dir() {
  local dir="$1"
  (
    cd "$dir" >/dev/null 2>&1
    cd "$(git rev-parse --git-common-dir)" >/dev/null 2>&1
    pwd -P
  )
}

detect_primary_worktree() {
  local dir="$1"
  local primary

  primary="$(
    git -C "$dir" worktree list --porcelain 2>/dev/null |
      awk '/^worktree / { print substr($0, 10); exit }'
  )"

  [[ -n "$primary" ]] || die "Failed to detect the primary worktree for: $dir"
  resolve_abs_dir "$primary"
}

copy_file_if_present() {
  local relative_path="$1"
  local source_file="$SOURCE_ROOT/$relative_path"
  local target_file="$TARGET_ROOT/$relative_path"

  [[ -f "$source_file" ]] || return 0

  mkdir -p "$(dirname "$target_file")"
  cp "$source_file" "$target_file"
  COPIED_ITEMS+=("$relative_path")
}

copy_dir_if_present() {
  local relative_path="$1"
  local source_dir="$SOURCE_ROOT/$relative_path"
  local target_dir="$TARGET_ROOT/$relative_path"

  [[ -d "$source_dir" ]] || return 0

  mkdir -p "$target_dir"
  cp -R "$source_dir"/. "$target_dir"/
  COPIED_ITEMS+=("$relative_path/")
}

copy_local_env_files() {
  local env_names=(
    ".env"
    ".env.local"
    ".env.development"
    ".env.development.local"
    ".env.production"
    ".env.production.local"
    ".env.test"
    ".env.test.local"
  )

  local path
  while IFS= read -r path; do
    path="${path#./}"
    case "$path" in
      .git/*|node_modules/*|.turbo/*|release/*|build/*|apps/*/dist/*|packages/*/dist/*) continue ;;
    esac

    local name
    name="$(basename "$path")"
    local matches=false
    for candidate in "${env_names[@]}"; do
      if [[ "$name" == "$candidate" ]]; then
        matches=true
        break
      fi
    done

    [[ "$matches" == true ]] || continue
    copy_file_if_present "$path"
  done < <(cd "$SOURCE_ROOT" && find . -type f \( -name ".env" -o -name ".env.*" \) | sort)
}

ensure_worktree_env_block() {
  local env_file="$TARGET_ROOT/.env.local"
  local temp_file
  temp_file="$(mktemp)"

  if [[ -f "$env_file" ]]; then
    awk '
      BEGIN { in_managed_block = 0 }
      /^# >>> t3code worktree bootstrap >>>$/ { in_managed_block = 1; next }
      /^# <<< t3code worktree bootstrap <<<$/{ in_managed_block = 0; next }
      in_managed_block { next }
      /^(T3CODE_DEV_INSTANCE|T3CODE_PORT_OFFSET|T3CODE_STATE_DIR|T3CODE_PORT|PORT|VITE_WS_URL|VITE_DEV_SERVER_URL|ELECTRON_RENDERER_PORT)=/ { next }
      { print }
    ' "$env_file" >"$temp_file"
  else
    : >"$temp_file"
  fi

  if [[ -s "$temp_file" ]]; then
    printf '\n' >>"$temp_file"
  fi

  cat >>"$temp_file" <<EOF
# >>> t3code worktree bootstrap >>>
T3CODE_DEV_INSTANCE=$WORKTREE_INSTANCE
T3CODE_STATE_DIR=.t3/dev
# <<< t3code worktree bootstrap <<<
EOF

  mv "$temp_file" "$env_file"
}

print_prereq_status() {
  local bun_version
  local node_version
  local expected_bun_version
  local expected_node_range

  bun_version="$(bun --version 2>/dev/null || true)"
  node_version="$(node --version 2>/dev/null || true)"
  expected_bun_version="$(
    node -e '
      const fs = require("fs");
      const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const match = /^bun@(.+)$/.exec(pkg.packageManager ?? "");
      process.stdout.write(match ? match[1] : "");
    ' "$TARGET_ROOT/package.json"
  )"
  expected_node_range="$(
    node -e '
      const fs = require("fs");
      const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      process.stdout.write(String(pkg.engines?.node ?? ""));
    ' "$TARGET_ROOT/package.json"
  )"

  log "bun version: ${bun_version:-missing}"
  log "node version: ${node_version:-missing}"
  if [[ -n "$expected_bun_version" ]]; then
    log "expected bun version: $expected_bun_version"
    if [[ -n "$bun_version" && "$bun_version" != "$expected_bun_version" ]]; then
      warn "Installed bun version ($bun_version) does not match packageManager bun@$expected_bun_version"
    fi
  fi
  if [[ -n "$expected_node_range" ]]; then
    log "expected node range: $expected_node_range"
  fi

  if command -v codex >/dev/null 2>&1; then
    log "codex binary: $(command -v codex)"
  else
    warn "Codex CLI is not on PATH. The UI can start, but provider sessions will fail until \`codex\` is installed."
  fi

  if [[ -f "${HOME:-}/.codex/auth.json" ]]; then
    log "codex auth: found ${HOME:-}/.codex/auth.json"
  else
    warn "Codex auth was not found at ${HOME:-}/.codex/auth.json. You will need to authenticate Codex before chats work."
  fi
}

SOURCE_ROOT=""
TARGET_ROOT=""
SKIP_INSTALL=false
COPIED_ITEMS=()
SOURCE_ARG=""
TARGET_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      [[ $# -ge 2 ]] || die "--source requires a path"
      SOURCE_ARG="$2"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      die "Unknown flag: $1"
      ;;
    *)
      if [[ -n "$TARGET_ARG" ]]; then
        die "Only one target worktree path can be provided"
      fi
      TARGET_ARG="$1"
      shift
      ;;
  esac
done

require_command git
require_command bun
require_command node

if [[ -z "$TARGET_ARG" ]]; then
  TARGET_ARG="$PWD"
fi

TARGET_ARG="$(resolve_abs_dir "$TARGET_ARG")"
if [[ -z "$SOURCE_ARG" ]]; then
  SOURCE_ARG="$(detect_primary_worktree "$TARGET_ARG")"
fi
SOURCE_ARG="$(resolve_abs_dir "$SOURCE_ARG")"

SOURCE_ROOT="$(resolve_repo_root "$SOURCE_ARG")"
TARGET_ROOT="$(resolve_repo_root "$TARGET_ARG")"

SOURCE_COMMON_DIR="$(resolve_git_common_dir "$SOURCE_ROOT")"
TARGET_COMMON_DIR="$(resolve_git_common_dir "$TARGET_ROOT")"

[[ "$SOURCE_COMMON_DIR" == "$TARGET_COMMON_DIR" ]] || die "Source and target must belong to the same git worktree repository"

[[ -f "$TARGET_ROOT/package.json" ]] || die "Target does not look like the monorepo root: $TARGET_ROOT"
[[ -f "$TARGET_ROOT/scripts/dev-runner.ts" ]] || die "Target is missing scripts/dev-runner.ts: $TARGET_ROOT"

WORKTREE_NAME="$(basename "$TARGET_ROOT")"
WORKTREE_SLUG="$(printf '%s' "$WORKTREE_NAME" | tr -cs '[:alnum:]' '-' | sed 's/^-*//; s/-*$//' | tr '[:upper:]' '[:lower:]')"
WORKTREE_HASH="$(printf '%s' "$TARGET_ROOT" | cksum | awk '{print $1}')"
if [[ -z "$WORKTREE_SLUG" ]]; then
  WORKTREE_SLUG="worktree"
fi
WORKTREE_INSTANCE="${WORKTREE_SLUG}-${WORKTREE_HASH}"

log "Preparing worktree: $TARGET_ROOT"
log "Using source checkout: $SOURCE_ROOT"
log "Worktree instance id: $WORKTREE_INSTANCE"

copy_local_env_files
copy_file_if_present ".npmrc"
copy_file_if_present ".envrc"
copy_file_if_present ".node-version"
copy_file_if_present ".nvmrc"
copy_file_if_present ".tool-versions"
copy_dir_if_present ".cursor"
copy_dir_if_present ".idea"

mkdir -p "$TARGET_ROOT/.t3/dev"
ensure_worktree_env_block

print_prereq_status

if [[ "$SKIP_INSTALL" == false ]]; then
  log "Running bun install in target worktree..."
  (
    cd "$TARGET_ROOT"
    bun install
  )
else
  log "Skipping bun install (--skip-install)"
fi

if [[ ${#COPIED_ITEMS[@]} -gt 0 ]]; then
  log "Copied local items:"
  printf '  - %s\n' "${COPIED_ITEMS[@]}"
else
  log "No local env/config files needed copying from the source checkout"
fi

log "Prepared .env.local with isolated dev state at $TARGET_ROOT/.t3/dev"
log "Next step: cd \"$TARGET_ROOT\" && bun dev"
