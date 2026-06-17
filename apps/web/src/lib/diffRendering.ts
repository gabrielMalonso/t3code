import { registerCustomTheme } from "@pierre/diffs";
import { parsePatchFiles } from "@pierre/diffs/utils/parsePatchFiles";
import type { FileDiffMetadata } from "@pierre/diffs/types";

import abyssTheme from "../themes/abyss-color-theme.json";
import ayuBlackTheme from "../themes/ayu-black-color-theme.json";
import darkHighContrastTheme from "../themes/dark-high-contrast-color-theme.json";
import draculaTheme from "../themes/dracula-color-theme.json";

export type AppSyntaxTheme =
  | "light"
  | "dark"
  | "abyss"
  | "darkHighContrast"
  | "dracula"
  | "ayuBlack";

export const DIFF_THEME_NAMES = {
  light: "pierre-light",
  dark: "pierre-dark",
  abyss: "t3code-abyss",
  darkHighContrast: "t3code-dark-high-contrast",
  dracula: "t3code-dracula",
  ayuBlack: "t3code-ayu-black",
} as const;

export type DiffThemeName = (typeof DIFF_THEME_NAMES)[keyof typeof DIFF_THEME_NAMES];

registerCustomTheme(DIFF_THEME_NAMES.abyss, async () => ({
  ...abyssTheme,
  name: DIFF_THEME_NAMES.abyss,
  type: "dark",
}));

registerCustomTheme(DIFF_THEME_NAMES.darkHighContrast, async () => ({
  ...darkHighContrastTheme,
  name: DIFF_THEME_NAMES.darkHighContrast,
  type: "dark",
}));

registerCustomTheme(DIFF_THEME_NAMES.dracula, async () => ({
  ...draculaTheme,
  name: DIFF_THEME_NAMES.dracula,
  type: "dark",
}));

registerCustomTheme(DIFF_THEME_NAMES.ayuBlack, async () => ({
  ...ayuBlackTheme,
  name: DIFF_THEME_NAMES.ayuBlack,
  type: "dark",
}));

export function resolveDiffThemeName(theme: AppSyntaxTheme): DiffThemeName {
  return DIFF_THEME_NAMES[theme];
}

const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;
const SECONDARY_HASH_SEED = 0x9e3779b9;
const SECONDARY_HASH_MULTIPLIER = 0x85ebca6b;

export function fnv1a32(
  input: string,
  seed = FNV_OFFSET_BASIS_32,
  multiplier = FNV_PRIME_32,
): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, multiplier) >>> 0;
  }
  return hash >>> 0;
}

export function buildPatchCacheKey(patch: string, scope = "diff-panel"): string {
  const normalizedPatch = patch.trim();
  const primary = fnv1a32(normalizedPatch, FNV_OFFSET_BASIS_32, FNV_PRIME_32).toString(36);
  const secondary = fnv1a32(
    normalizedPatch,
    SECONDARY_HASH_SEED,
    SECONDARY_HASH_MULTIPLIER,
  ).toString(36);
  return `${scope}:${normalizedPatch.length}:${primary}:${secondary}`;
}

export type RenderablePatch =
  | {
      kind: "files";
      files: FileDiffMetadata[];
    }
  | {
      kind: "raw";
      text: string;
      reason: string;
    };

export function getRenderablePatch(
  patch: string | undefined,
  cacheScope = "diff-panel",
): RenderablePatch | null {
  if (!patch) return null;
  const normalizedPatch = patch.trim();
  if (normalizedPatch.length === 0) return null;

  try {
    const parsedPatches = parsePatchFiles(
      normalizedPatch,
      buildPatchCacheKey(normalizedPatch, cacheScope),
    );
    const files = parsedPatches.flatMap((parsedPatch) => parsedPatch.files);
    if (files.length > 0) {
      return { kind: "files", files };
    }

    return {
      kind: "raw",
      text: normalizedPatch,
      reason: "Unsupported diff format. Showing raw patch.",
    };
  } catch {
    return {
      kind: "raw",
      text: normalizedPatch,
      reason: "Failed to parse patch. Showing raw patch.",
    };
  }
}

export function resolveFileDiffPath(fileDiff: FileDiffMetadata): string {
  const raw = fileDiff.name ?? fileDiff.prevName ?? "";
  if (raw.startsWith("a/") || raw.startsWith("b/")) {
    return raw.slice(2);
  }
  return raw;
}

export function buildFileDiffRenderKey(fileDiff: FileDiffMetadata): string {
  return fileDiff.cacheKey ?? `${fileDiff.prevName ?? "none"}:${fileDiff.name}`;
}

export function getDiffCollapseIconClassName(fileDiff: FileDiffMetadata): string {
  switch (fileDiff.type) {
    case "new":
      return "text-[var(--diffs-addition-base)]";
    case "deleted":
      return "text-[var(--diffs-deletion-base)]";
    case "change":
    case "rename-pure":
    case "rename-changed":
      return "text-[var(--diffs-modified-base)]";
    default:
      return "text-muted-foreground/80";
  }
}
