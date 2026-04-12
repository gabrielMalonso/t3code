const FALLBACK_TERMINAL_FONT_FAMILY =
  '"JetBrainsMono Nerd Font", "JetBrains Mono", "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';

export function readT3codeTerminalFontFamily(): string {
  if (typeof window === "undefined") {
    return FALLBACK_TERMINAL_FONT_FAMILY;
  }

  const configuredFontFamily = getComputedStyle(document.documentElement)
    .getPropertyValue("--terminal-font-family")
    .trim();

  return configuredFontFamily.length > 0 ? configuredFontFamily : FALLBACK_TERMINAL_FONT_FAMILY;
}
