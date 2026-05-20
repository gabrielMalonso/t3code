#!/usr/bin/env bash
set -euo pipefail

REPO="/Volumes/SSD1TB/Projetos/t3code"
APP_NAME="T3 Code (Alpha)"
APP_PATH="/Applications/${APP_NAME}.app"
RELEASE_DIR="${REPO}/release"
PACKAGE_JSON="${REPO}/apps/desktop/package.json"
MOUNT_POINT=""

cleanup() {
  if [[ -n "${MOUNT_POINT}" && -d "${MOUNT_POINT}" ]]; then
    hdiutil detach "${MOUNT_POINT}" -quiet >/dev/null 2>&1 || true
    rmdir "${MOUNT_POINT}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cd "${REPO}"

osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true
sleep 1
pkill -x "${APP_NAME}" >/dev/null 2>&1 || true

rm -rf "${APP_PATH}"

VERSION="$(bun -e 'const pkg=require(process.argv[1]); console.log(pkg.version)' "${PACKAGE_JSON}")"

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

echo "${APP_NAME} ${INSTALLED_VERSION} (${INSTALLED_BUILD})"
