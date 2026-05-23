#!/usr/bin/env bash
set -euo pipefail

REPO="/Volumes/SSD1TB/Projetos/t3code"
APP_NAME="T3 Code (Alpha)"
APP_ID="com.t3tools.t3code"
APP_PATH="/Applications/${APP_NAME}.app"
APP_PROCESS_PATTERN="/Applications/T3 Code \\(Alpha\\)\\.app/Contents"
RELEASE_DIR="${REPO}/release"
PACKAGE_JSON="${REPO}/apps/desktop/package.json"
USERDATA_DIR="${T3CODE_USERDATA_DIR:-${HOME}/.t3/userdata}"
APP_SUPPORT_DIR="${T3CODE_APP_SUPPORT_DIR:-${HOME}/Library/Application Support/t3code}"
DATA_BACKUP_ROOT="${T3CODE_DATA_BACKUP_ROOT:-${HOME}/Desktop/t3code-data-backups}"
TCC_RESET_MODE="${T3CODE_RESET_TCC_ON_REINSTALL:-auto}"
MOUNT_POINT=""
DATA_BACKUP_DIR=""
TCC_RESET_NEEDED="0"

cleanup() {
  if [[ -n "${MOUNT_POINT}" && -d "${MOUNT_POINT}" ]]; then
    hdiutil detach "${MOUNT_POINT}" -quiet >/dev/null 2>&1 || true
    rmdir "${MOUNT_POINT}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

state_db_path() {
  printf "%s/state.sqlite" "${USERDATA_DIR}"
}

checkpoint_state_db() {
  local db
  db="$(state_db_path)"
  if [[ -f "${db}" ]] && command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${db}" "PRAGMA wal_checkpoint(FULL);" >/dev/null 2>&1 || true
  fi
}

list_data_files() {
  local target
  for target in \
    "${USERDATA_DIR}/state.sqlite" \
    "${USERDATA_DIR}/state.sqlite-wal" \
    "${USERDATA_DIR}/state.sqlite-shm" \
    "${USERDATA_DIR}/environment-id" \
    "${USERDATA_DIR}/keybindings.json" \
    "${USERDATA_DIR}/server-runtime.json" \
    "${USERDATA_DIR}/attachments" \
    "${APP_SUPPORT_DIR}/Local Storage"; do
    if [[ -f "${target}" ]]; then
      printf "%s\n" "${target}"
    elif [[ -d "${target}" ]]; then
      find "${target}" -type f -print
    fi
  done
}

write_data_fingerprint() {
  local output="$1"
  list_data_files |
    LC_ALL=C sort |
    while IFS= read -r file; do
      shasum -a 256 "${file}"
    done >"${output}"
}

write_data_summary() {
  local output="$1"
  local db
  db="$(state_db_path)"
  {
    printf "userdata_dir=%s\n" "${USERDATA_DIR}"
    printf "app_support_dir=%s\n" "${APP_SUPPORT_DIR}"
    if [[ -f "${db}" ]]; then
      printf "state.sqlite_bytes=%s\n" "$(wc -c <"${db}" | tr -d ' ')"
      if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "${db}" <<'SQL' 2>/dev/null || true
SELECT 'projection_projects=' || count(*) FROM projection_projects;
SELECT 'projection_threads=' || count(*) FROM projection_threads;
SELECT 'projection_thread_messages=' || count(*) FROM projection_thread_messages;
SELECT 'orchestration_events=' || count(*) FROM orchestration_events;
SELECT 'provider_session_runtime=' || count(*) FROM provider_session_runtime;
PRAGMA integrity_check;
SQL
      fi
    else
      printf "state.sqlite=missing\n"
    fi
    if [[ -d "${APP_SUPPORT_DIR}/Local Storage" ]]; then
      printf "local_storage_files=%s\n" "$(
        find "${APP_SUPPORT_DIR}/Local Storage" -type f | wc -l | tr -d ' '
      )"
    else
      printf "local_storage=missing\n"
    fi
  } >"${output}"
}

is_false_env_value() {
  case "${1:-}" in
    0 | false | FALSE | no | NO | off | OFF)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

resolve_macos_signing_identity() {
  if [[ -n "${T3CODE_DESKTOP_MAC_SIGNING_IDENTITY:-}" ]]; then
    printf "%s\n" "${T3CODE_DESKTOP_MAC_SIGNING_IDENTITY}"
    return 0
  fi

  if ! command -v security >/dev/null 2>&1; then
    return 1
  fi

  local identities
  identities="$(security find-identity -v -p codesigning 2>/dev/null || true)"

  local identity
  for pattern in \
    '"Developer ID Application:' \
    '"Apple Development:' \
    '"Apple Distribution:'; do
    identity="$(printf "%s\n" "${identities}" | awk -F '"' -v pattern="${pattern}" '$0 ~ pattern { print $2; exit }')"
    if [[ -n "${identity}" ]]; then
      printf "%s\n" "${identity}"
      return 0
    fi
  done

  return 1
}

configure_macos_signing() {
  if is_false_env_value "${T3CODE_DESKTOP_SIGNED:-}"; then
    echo "Assinatura macOS desativada por T3CODE_DESKTOP_SIGNED=${T3CODE_DESKTOP_SIGNED}." >&2
    return 0
  fi

  local identity
  if ! identity="$(resolve_macos_signing_identity)" || [[ -z "${identity}" ]]; then
    echo "Nenhuma identidade de assinatura macOS encontrada. Instale um certificado Apple code signing ou defina T3CODE_DESKTOP_MAC_SIGNING_IDENTITY." >&2
    exit 1
  fi

  export T3CODE_DESKTOP_SIGNED=true
  export T3CODE_DESKTOP_MAC_SIGNING_IDENTITY="${identity}"
  echo "Assinatura macOS: ${identity}"
}

app_signature_is_adhoc() {
  local app="$1"
  if [[ ! -d "${app}" ]]; then
    return 1
  fi

  codesign -dv --verbose=4 "${app}" 2>&1 | grep -q "Signature=adhoc"
}

tcc_has_cdhash_only_entries() {
  local db="/Library/Application Support/com.apple.TCC/TCC.db"
  if [[ ! -r "${db}" ]] || ! command -v sqlite3 >/dev/null 2>&1; then
    return 1
  fi

  local count
  count="$(
    sqlite3 "${db}" \
      "select count(*) from access where client='${APP_ID}' and service in ('kTCCServiceAccessibility','kTCCServiceAppleEvents','kTCCServiceScreenCapture') and length(csreq)=40;" \
      2>/dev/null || true
  )"

  [[ "${count:-0}" =~ ^[0-9]+$ ]] && [[ "${count}" -gt 0 ]]
}

record_tcc_reset_need() {
  case "${TCC_RESET_MODE}" in
    always)
      TCC_RESET_NEEDED="1"
      return 0
      ;;
    never)
      TCC_RESET_NEEDED="0"
      return 0
      ;;
    auto)
      ;;
    *)
      echo "T3CODE_RESET_TCC_ON_REINSTALL deve ser auto, always ou never." >&2
      exit 1
      ;;
  esac

  if app_signature_is_adhoc "${APP_PATH}" || tcc_has_cdhash_only_entries; then
    TCC_RESET_NEEDED="1"
  fi
}

reset_tcc_if_needed() {
  if [[ "${TCC_RESET_NEEDED}" != "1" ]]; then
    return 0
  fi

  tccutil reset ScreenCapture "${APP_ID}" >/dev/null 2>&1 || true
  tccutil reset Accessibility "${APP_ID}" >/dev/null 2>&1 || true
  tccutil reset AppleEvents "${APP_ID}" >/dev/null 2>&1 || true
  echo "Permissões TCC resetadas para ${APP_ID}; o macOS pode pedir Screen Recording/Accessibility/Apple Events novamente."
}

verify_installed_signature() {
  local details
  if ! details="$(codesign -dv --verbose=4 "${APP_PATH}" 2>&1)"; then
    echo "Não foi possível ler a assinatura do app instalado." >&2
    exit 1
  fi

  if printf "%s\n" "${details}" | grep -q "Signature=adhoc"; then
    echo "O app instalado ainda está com assinatura ad-hoc; isso quebra permissões TCC após reinstalações." >&2
    exit 1
  fi

  if printf "%s\n" "${details}" | grep -q "TeamIdentifier=not set"; then
    echo "O app instalado não tem TeamIdentifier estável; isso quebra permissões TCC após reinstalações." >&2
    exit 1
  fi

  codesign --verify --deep --strict --verbose=2 "${APP_PATH}" >/dev/null
  if ! codesign -d --entitlements :- "${APP_PATH}" 2>/dev/null | grep -q "com.apple.security.automation.apple-events"; then
    echo "O app instalado não tem o entitlement com.apple.security.automation.apple-events; Computer Use via MCP pode travar em AppleEvents." >&2
    exit 1
  fi
  printf "%s\n" "${details}" | awk -F= '/^(Authority|TeamIdentifier|CDHash)=/ { print }'
}

backup_data_before_reinstall() {
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  DATA_BACKUP_DIR="${DATA_BACKUP_ROOT}/pre-reinstall-${stamp}"
  mkdir -p "${DATA_BACKUP_DIR}"

  checkpoint_state_db
  write_data_summary "${DATA_BACKUP_DIR}/before-summary.txt"
  write_data_fingerprint "${DATA_BACKUP_DIR}/before-fingerprint.sha256"

  if [[ -d "${USERDATA_DIR}" ]]; then
    ditto "${USERDATA_DIR}" "${DATA_BACKUP_DIR}/t3-userdata"
  fi
  if [[ -d "${APP_SUPPORT_DIR}/Local Storage" ]]; then
    mkdir -p "${DATA_BACKUP_DIR}/t3code-app-support"
    ditto "${APP_SUPPORT_DIR}/Local Storage" "${DATA_BACKUP_DIR}/t3code-app-support/Local Storage"
  fi
}

verify_data_unchanged_after_reinstall() {
  checkpoint_state_db
  write_data_summary "${DATA_BACKUP_DIR}/after-summary.txt"
  write_data_fingerprint "${DATA_BACKUP_DIR}/after-fingerprint.sha256"

  if ! cmp -s \
    "${DATA_BACKUP_DIR}/before-fingerprint.sha256" \
    "${DATA_BACKUP_DIR}/after-fingerprint.sha256"; then
    diff -u \
      "${DATA_BACKUP_DIR}/before-fingerprint.sha256" \
      "${DATA_BACKUP_DIR}/after-fingerprint.sha256" \
      >"${DATA_BACKUP_DIR}/fingerprint.diff" || true
    echo "Dados persistentes mudaram durante a reinstalação. Backup: ${DATA_BACKUP_DIR}" >&2
    echo "Diff: ${DATA_BACKUP_DIR}/fingerprint.diff" >&2
    exit 1
  fi
}

cd "${REPO}"

osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true
sleep 1
pkill -x "${APP_NAME}" >/dev/null 2>&1 || true
pkill -f "${APP_PROCESS_PATTERN}" >/dev/null 2>&1 || true
sleep 1

if pgrep -f "${APP_PROCESS_PATTERN}" >/dev/null 2>&1; then
  echo "${APP_NAME} ainda está rodando; abortando antes do backup de dados." >&2
  exit 1
fi

record_tcc_reset_need
backup_data_before_reinstall

rm -rf "${APP_PATH}"

VERSION="$(bun -e 'const pkg=require(process.argv[1]); console.log(pkg.version)' "${PACKAGE_JSON}")"
configure_macos_signing

mkdir -p "${RELEASE_DIR}"
find "${RELEASE_DIR}" -maxdepth 1 \( -type f -o -type d \) \
  -name "*${VERSION}*arm64*" \
  -exec rm -rf {} +

bun run dist:desktop:dmg:arm64 >/dev/null

DMG_PATH="$(
  find "${RELEASE_DIR}" -maxdepth 1 -type f -name "*${VERSION}*arm64*.dmg" -print0 |
    xargs -0 ls -t 2>/dev/null |
    head -n 1
)"

if [[ -z "${DMG_PATH}" ]]; then
  echo "DMG arm64 da versão ${VERSION} não encontrado em release/." >&2
  exit 1
fi

MOUNT_POINT="$(mktemp -d "/tmp/t3code-dmg.XXXXXX")"
hdiutil attach "${DMG_PATH}" -mountpoint "${MOUNT_POINT}" -nobrowse -readonly -quiet

DMG_APP="${MOUNT_POINT}/${APP_NAME}.app"
if [[ ! -d "${DMG_APP}" ]]; then
  echo "${APP_NAME}.app não encontrado dentro do DMG." >&2
  exit 1
fi

ditto "${DMG_APP}" "${APP_PATH}"
hdiutil detach "${MOUNT_POINT}" -quiet
rmdir "${MOUNT_POINT}" >/dev/null 2>&1 || true
MOUNT_POINT=""

INSTALLED_VERSION="$(defaults read "${APP_PATH}/Contents/Info" CFBundleShortVersionString 2>/dev/null || true)"
INSTALLED_BUILD="$(defaults read "${APP_PATH}/Contents/Info" CFBundleVersion 2>/dev/null || true)"

verify_installed_signature
reset_tcc_if_needed
verify_data_unchanged_after_reinstall

echo "${APP_NAME} ${INSTALLED_VERSION} (${INSTALLED_BUILD})"
echo "Dados preservados. Backup: ${DATA_BACKUP_DIR}"
