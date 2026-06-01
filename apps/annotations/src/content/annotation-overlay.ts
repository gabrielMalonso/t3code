import { COPY } from "../shared/copy";
import { formatDiagnostics, formatFallbackText } from "../shared/diagnostics";
import type { CaptureFallback, Rect } from "../shared/types";

export type OverlayRefs = {
  host: HTMLElement;
  eventShield: HTMLDivElement;
  hud: HTMLElement;
  hudPickButton: HTMLButtonElement;
  bridgeStatus: HTMLSpanElement;
  hudCloseButton: HTMLButtonElement;
  hoverBox: HTMLDivElement;
  lockedBox: HTMLDivElement;
  badge: HTMLDivElement;
  panel: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  debugButton: HTMLButtonElement;
  primaryButton: HTMLButtonElement;
  toast: HTMLDivElement;
  fallback: HTMLDivElement;
};

export type FallbackHandlers = {
  onClose: () => void;
};

export type BridgeStatusPresentation = {
  state: "checking" | "connected" | "warning" | "error";
  label: string;
  title?: string;
};

export function renderOverlayChrome(shadow: ShadowRoot): OverlayRefs {
  shadow.innerHTML = `
    <style>${overlayCss()}</style>
    <div class="event-shield" part="event-shield" data-testid="annotations-event-shield"></div>
    <nav class="hud" part="hud" aria-label="${COPY.hudTitle}" data-testid="annotations-hud">
      <span class="hud-mark" aria-hidden="true">/</span>
      <button class="hud-pick" type="button" aria-pressed="false" data-testid="annotations-pick">
        <span class="hud-pick-dot" aria-hidden="true"></span>
        ${COPY.pick}
      </button>
      <span class="bridge-status is-checking" title="${COPY.bridgeChecking}" data-testid="annotations-bridge-status" hidden>${COPY.bridgeChecking}</span>
      <button class="hud-close" type="button" aria-label="${COPY.closeOverlay}" data-testid="annotations-close">×</button>
    </nav>
    <div class="box hover" part="hover"></div>
    <div class="box locked" part="locked"></div>
    <div class="badge" part="badge"></div>
    <section class="panel" part="panel" aria-label="Annotations">
      <label class="label" for="annotations-comment">${COPY.commentLabel}</label>
      <div class="composer-field">
        <textarea id="annotations-comment" aria-label="${COPY.commentLabel}" placeholder="${COPY.commentPlaceholder}" spellcheck="true"></textarea>
        <div class="composer-actions">
          <button class="icon-button debug-toggle" type="button" aria-label="${COPY.debug}" aria-pressed="false" title="${COPY.debugMode}" data-testid="annotations-debug">
            <svg class="bug-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M5.5 5.75V4.8a2.5 2.5 0 0 1 5 0v.95M4.8 1.8l1.35 1.35M11.2 1.8 9.85 3.15"
                stroke="currentColor"
                stroke-width="1.45"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M4.75 6.05h6.5A2.75 2.75 0 0 1 14 8.8v1.45A3.75 3.75 0 0 1 10.25 14h-4.5A3.75 3.75 0 0 1 2 10.25V8.8a2.75 2.75 0 0 1 2.75-2.75Z"
                stroke="currentColor"
                stroke-width="1.45"
                stroke-linejoin="round"
              />
              <path
                d="M8 8.4v5.1M2 8.8H.8M15.2 8.8H14M2 11.3H.8M15.2 11.3H14"
                stroke="currentColor"
                stroke-width="1.45"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <button class="icon-button primary" type="button" aria-label="${COPY.capture}" title="${COPY.capture}">
            <svg class="send-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <svg class="send-spinner" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle
                cx="7"
                cy="7"
                r="5.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-dasharray="20 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </section>
    <section class="fallback" part="fallback" aria-label="${COPY.fallbackTitle}"></section>
    <div class="toast" part="toast" role="status" aria-live="polite"></div>
  `;

  const host = shadow.host as HTMLElement;
  return {
    host,
    eventShield: mustFind<HTMLDivElement>(shadow, ".event-shield"),
    hud: mustFind<HTMLElement>(shadow, ".hud"),
    hudPickButton: mustFind<HTMLButtonElement>(shadow, ".hud-pick"),
    bridgeStatus: mustFind<HTMLSpanElement>(shadow, ".bridge-status"),
    hudCloseButton: mustFind<HTMLButtonElement>(shadow, ".hud-close"),
    hoverBox: mustFind<HTMLDivElement>(shadow, ".hover"),
    lockedBox: mustFind<HTMLDivElement>(shadow, ".locked"),
    badge: mustFind<HTMLDivElement>(shadow, ".badge"),
    panel: mustFind<HTMLDivElement>(shadow, ".panel"),
    textarea: mustFind<HTMLTextAreaElement>(shadow, "textarea"),
    debugButton: mustFind<HTMLButtonElement>(shadow, ".debug-toggle"),
    primaryButton: mustFind<HTMLButtonElement>(shadow, ".primary"),
    toast: mustFind<HTMLDivElement>(shadow, ".toast"),
    fallback: mustFind<HTMLDivElement>(shadow, ".fallback"),
  };
}

export function showHud(refs: OverlayRefs): void {
  refs.hud.style.display = "flex";
  refs.hud.style.opacity = "1";
  refs.hud.style.pointerEvents = "auto";
}

export function hideHud(refs: OverlayRefs): void {
  refs.hud.style.opacity = "0";
  refs.hud.style.pointerEvents = "none";
  refs.hud.style.display = "none";
}

export function setPickActive(refs: OverlayRefs, active: boolean): void {
  refs.hudPickButton.setAttribute("aria-pressed", String(active));
  refs.hudPickButton.classList.toggle("is-active", active);
}

export function setDebugMode(refs: OverlayRefs, active: boolean): void {
  refs.debugButton.setAttribute("aria-pressed", String(active));
  refs.debugButton.classList.toggle("is-active", active);
}

export function setBridgeStatus(refs: OverlayRefs, status: BridgeStatusPresentation): void {
  refs.bridgeStatus.textContent = status.label;
  refs.bridgeStatus.title = status.title ?? status.label;
  refs.bridgeStatus.hidden = status.state === "checking" || status.state === "connected";
  refs.bridgeStatus.classList.toggle("is-checking", status.state === "checking");
  refs.bridgeStatus.classList.toggle("is-connected", status.state === "connected");
  refs.bridgeStatus.classList.toggle("is-warning", status.state === "warning");
  refs.bridgeStatus.classList.toggle("is-error", status.state === "error");
}

export function setPageInteractionBlocked(refs: OverlayRefs, blocked: boolean): void {
  refs.eventShield.style.display = blocked ? "block" : "none";
  refs.eventShield.style.pointerEvents = blocked ? "auto" : "none";
}

export function showPanel(refs: OverlayRefs, rect: Rect): void {
  const panelWidth = Math.min(340, Math.max(280, window.innerWidth - 24));
  const rightSpace = window.innerWidth - (rect.x + rect.width);
  const left =
    rightSpace > panelWidth + 18
      ? rect.x + rect.width + 12
      : Math.min(window.innerWidth - panelWidth - 12, Math.max(12, rect.x));
  const below = rect.y + rect.height + 12;
  const above = rect.y - 178;
  const top = below + 170 < window.innerHeight ? below : Math.max(12, above);

  Object.assign(refs.panel.style, {
    display: "block",
    opacity: "1",
    pointerEvents: "auto",
    width: `${panelWidth}px`,
    transform: `translate(${Math.round(left)}px, ${Math.round(top)}px)`,
  });
}

export function hidePanel(refs: OverlayRefs): void {
  refs.panel.style.opacity = "0";
  refs.panel.style.pointerEvents = "none";
  refs.panel.style.display = "none";
}

export function showBadge(refs: OverlayRefs, label: string, rect: Rect): void {
  refs.badge.textContent = label;
  const top = rect.y > 28 ? rect.y - 28 : rect.y + rect.height + 8;
  const left = Math.min(window.innerWidth - 24, Math.max(8, rect.x));
  Object.assign(refs.badge.style, {
    display: "block",
    opacity: "1",
    transform: `translate(${Math.round(left)}px, ${Math.round(top)}px)`,
  });
}

export function hideBadge(refs: OverlayRefs): void {
  refs.badge.style.opacity = "0";
  refs.badge.style.display = "none";
}

export function showToast(refs: OverlayRefs, message: string, timeoutMs = 2200): void {
  refs.toast.textContent = message;
  refs.toast.style.display = "block";
  refs.toast.style.opacity = "1";
  window.setTimeout(() => {
    refs.toast.style.opacity = "0";
  }, timeoutMs);
}

export function setCapturing(refs: OverlayRefs, capturing: boolean): void {
  refs.primaryButton.disabled = capturing;
  refs.debugButton.disabled = capturing;
  refs.textarea.disabled = capturing;
  refs.primaryButton.classList.toggle("is-capturing", capturing);
  refs.primaryButton.setAttribute("aria-label", capturing ? COPY.copying : COPY.capture);
  refs.primaryButton.title = capturing ? COPY.copying : COPY.capture;
}

export function showFallback(
  refs: OverlayRefs,
  fallback: CaptureFallback,
  handlers: FallbackHandlers,
): void {
  const fallbackText = formatFallbackText(fallback.markdownPrompt, fallback.diagnostics);
  const diagnostics = formatDiagnostics(fallback.diagnostics);
  const clipboardBlocked = diagnostics.includes("clipboard:writeText:error");
  const diagnosticsBlock = diagnostics
    ? `<details class="fallback-diagnostics" open>
        <summary>Detalhes técnicos</summary>
        <pre>${escapeHtml(diagnostics)}</pre>
      </details>`
    : "";

  refs.fallback.innerHTML = `
    <div class="fallback-head">
      <strong>${COPY.fallbackTitle}</strong>
      <button class="fallback-close" type="button" aria-label="Fechar">×</button>
    </div>
    ${clipboardBlocked ? `<p class="fallback-note">${COPY.fallbackManual}</p>` : ""}
    <textarea class="fallback-text" aria-label="Prompt markdown">${escapeHtml(fallbackText)}</textarea>
    ${diagnosticsBlock}
  `;

  refs.fallback.style.display = "block";
  refs.fallback.style.opacity = "1";
  refs.fallback.style.pointerEvents = "auto";
  refs.fallback
    .querySelector<HTMLButtonElement>(".fallback-close")
    ?.addEventListener("click", handlers.onClose);
  const textarea = refs.fallback.querySelector<HTMLTextAreaElement>(".fallback-text");
  textarea?.focus({ preventScroll: true });
  textarea?.select();
}

export function hideFallback(refs: OverlayRefs): void {
  refs.fallback.style.opacity = "0";
  refs.fallback.style.pointerEvents = "none";
  refs.fallback.style.display = "none";
  refs.fallback.innerHTML = "";
}

function mustFind<T extends Element>(root: ShadowRoot, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Annotations UI missing ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function overlayCss(): string {
  return `
    :host {
      --annotations-bg: #0b0e14;
      --annotations-field: #0f141b;
      --annotations-ink: #e6e1cf;
      --annotations-muted: #8a9199;
      --annotations-line: #2d3640;
      --annotations-accent: #ffb454;
      --annotations-accent-soft: rgba(255, 180, 84, 0.18);
      --annotations-shell: #0b0e14;
      --annotations-shell-line: #1f2430;
      --annotations-shell-muted: #59c2ff;
      --annotations-success: #aad94c;
      --annotations-danger: #f07178;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }

    * { box-sizing: border-box; }

    .event-shield {
      position: fixed;
      inset: 0;
      display: none;
      pointer-events: none;
      background: transparent;
      z-index: 0;
    }

    .hud {
      position: fixed;
      left: 50%;
      bottom: 16px;
      display: none;
      align-items: center;
      gap: 4px;
      min-height: 32px;
      max-width: calc(100vw - 24px);
      transform: translateX(-50%);
      border: 1px solid var(--annotations-shell-line);
      border-radius: 9px;
      background: rgba(11, 14, 20, 0.94);
      color: var(--annotations-ink);
      padding: 3px;
      pointer-events: auto;
      z-index: 4;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.34);
      transition: opacity 140ms ease;
      backdrop-filter: blur(14px);
    }

    .hud-mark {
      display: grid;
      place-items: center;
      width: 22px;
      height: 26px;
      color: var(--annotations-accent);
      font: 760 18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .hud button {
      appearance: none;
      border: 1px solid var(--annotations-shell-line);
      box-shadow: none;
      cursor: pointer;
      font: 650 12px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      outline: none;
      transition:
        background 120ms ease,
        border-color 120ms ease,
        color 120ms ease;
    }

    .hud-pick {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 26px;
      border-radius: 6px;
      background: rgba(89, 194, 255, 0.07);
      color: var(--annotations-ink);
      padding: 0 9px;
    }

    .hud-pick:hover {
      border-color: rgba(89, 194, 255, 0.42);
      background: rgba(89, 194, 255, 0.12);
    }

    .hud-pick.is-active {
      border-color: rgba(255, 180, 84, 0.46);
      background: rgba(255, 180, 84, 0.13);
      color: var(--annotations-accent);
    }

    .hud-pick-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--annotations-shell-muted);
      box-shadow: 0 0 0 2px rgba(89, 194, 255, 0.16);
    }

    .hud-pick.is-active .hud-pick-dot {
      background: var(--annotations-accent);
      box-shadow: 0 0 0 2px rgba(255, 180, 84, 0.18), 0 0 12px rgba(255, 180, 84, 0.34);
    }

    .bridge-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: clamp(132px, 42vw, 280px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border: 1px solid rgba(255, 180, 84, 0.18);
      border-radius: 6px;
      padding: 0 8px;
      height: 26px;
      font-size: 11px;
      font-weight: 650;
      background: rgba(15, 20, 27, 0.72);
    }

    .bridge-status[hidden] {
      display: none;
    }

    .bridge-status::before {
      content: "";
      flex: 0 0 auto;
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: rgba(230, 225, 207, 0.46);
    }

    .bridge-status.is-connected {
      color: var(--annotations-success);
    }

    .bridge-status.is-connected::before {
      background: var(--annotations-success);
      box-shadow: 0 0 9px rgba(170, 217, 76, 0.42);
    }

    .bridge-status.is-warning {
      color: var(--annotations-accent);
      border-color: rgba(255, 180, 84, 0.32);
      background: rgba(255, 180, 84, 0.08);
    }

    .bridge-status.is-warning::before {
      background: var(--annotations-accent);
    }

    .bridge-status.is-error {
      color: var(--annotations-danger);
      border-color: rgba(240, 113, 120, 0.34);
      background: rgba(240, 113, 120, 0.08);
    }

    .bridge-status.is-error::before {
      background: var(--annotations-danger);
    }

    .hud-close {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      background: transparent;
      color: rgba(230, 225, 207, 0.68);
      padding: 0;
      font-size: 17px;
      line-height: 1;
    }

    .hud-close:hover {
      background: rgba(89, 194, 255, 0.1);
      color: var(--annotations-ink);
    }

    .box {
      position: fixed;
      top: 0;
      left: 0;
      display: none;
      pointer-events: none;
      z-index: 2;
      border-radius: 4px;
      transition: transform 150ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease;
    }

    .hover {
      border: 2px solid var(--annotations-accent);
      box-shadow: 0 0 0 1px rgba(255, 180, 84, 0.24), 0 0 0 6px var(--annotations-accent-soft);
    }

    .locked {
      border: 2px solid var(--annotations-accent);
      box-shadow: inset 0 0 0 1px rgba(230, 225, 207, 0.7), 0 0 0 9999px rgba(11, 14, 20, 0.1);
    }

    .badge {
      position: fixed;
      top: 0;
      left: 0;
      display: none;
      max-width: min(520px, calc(100vw - 16px));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      pointer-events: none;
      z-index: 3;
      background: var(--annotations-field);
      color: var(--annotations-ink);
      border: 1px solid rgba(255, 180, 84, 0.25);
      border-radius: 6px;
      padding: 4px 8px;
      font: 600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.34);
    }

    .panel,
    .fallback {
      position: fixed;
      top: 0;
      left: 0;
      display: none;
      background: var(--annotations-bg);
      color: var(--annotations-ink);
      border: 1px solid var(--annotations-line);
      border-radius: 8px;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.44), 0 3px 12px rgba(0, 0, 0, 0.28);
      z-index: 5;
    }

    .panel {
      padding: 12px;
      transition: opacity 120ms ease;
    }

    .label {
      display: block;
      margin-bottom: 7px;
      color: var(--annotations-muted);
      font-size: 12px;
      font-weight: 650;
    }

    .composer-field {
      position: relative;
      border: 1px solid var(--annotations-line);
      border-radius: 7px;
      background: var(--annotations-field);
      transition:
        border-color 120ms ease,
        box-shadow 120ms ease;
    }

    .composer-field:focus-within {
      border-color: var(--annotations-accent);
      box-shadow: 0 0 0 3px var(--annotations-accent-soft);
    }

    .composer-field textarea {
      display: block;
      width: 100%;
      min-height: 96px;
      max-height: 180px;
      resize: none;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: var(--annotations-ink);
      padding: 9px 10px 48px;
      font: 500 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      outline: none;
    }

    .composer-actions {
      position: absolute;
      right: 8px;
      bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 7px;
    }

    .panel button,
    .fallback button {
      height: 30px;
      border-radius: 7px;
      border: 1px solid var(--annotations-line);
      padding: 0 10px;
      font: 650 12px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      cursor: pointer;
    }

    .panel button:disabled,
    .fallback button:disabled {
      cursor: not-allowed;
      opacity: 0.58;
    }

    .panel button.icon-button {
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 32px;
      flex: 0 0 32px;
      border-radius: 999px;
      padding: 0;
      transition:
        background 120ms ease,
        border-color 120ms ease,
        color 120ms ease,
        opacity 120ms ease,
        transform 120ms ease;
    }

    .panel button.icon-button:hover:not(:disabled) {
      transform: scale(1.05);
    }

    .panel button.icon-button:disabled {
      transform: none;
    }

    .panel button.primary {
      background: var(--annotations-accent);
      border-color: var(--annotations-accent);
      color: #0b0e14;
    }

    .panel button.primary:hover:not(:disabled) {
      background: #ffc16c;
      border-color: #ffc16c;
      transform: scale(1.05);
    }

    .send-icon,
    .send-spinner {
      grid-area: 1 / 1;
    }

    .send-spinner {
      display: none;
      animation: annotations-spin 760ms linear infinite;
    }

    .panel button.primary.is-capturing .send-icon {
      display: none;
    }

    .panel button.primary.is-capturing .send-spinner {
      display: block;
    }

    .debug-toggle {
      background: rgba(89, 194, 255, 0.08);
      color: var(--annotations-muted);
    }

    .debug-toggle:hover {
      background: rgba(89, 194, 255, 0.13);
      border-color: rgba(89, 194, 255, 0.32);
      color: var(--annotations-ink);
    }

    .debug-toggle.is-active {
      border-color: rgba(255, 180, 84, 0.56);
      background: var(--annotations-accent-soft);
      color: var(--annotations-accent);
    }

    .toast {
      position: fixed;
      right: 14px;
      bottom: 14px;
      display: none;
      max-width: min(360px, calc(100vw - 28px));
      pointer-events: none;
      background: var(--annotations-field);
      color: var(--annotations-ink);
      border: 1px solid var(--annotations-line);
      border-radius: 8px;
      padding: 9px 11px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.38);
      transition: opacity 160ms ease;
    }

    .fallback {
      right: 14px;
      bottom: 14px;
      left: auto;
      top: auto;
      width: min(520px, calc(100vw - 28px));
      max-height: min(760px, calc(100vh - 28px));
      padding: 12px;
      overflow: auto;
    }

    .fallback .primary {
      min-width: 96px;
    }

    .fallback-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 13px;
    }

    .fallback-note {
      margin: 0 0 10px;
      border-radius: 7px;
      background: var(--annotations-accent-soft);
      color: var(--annotations-ink);
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 650;
      line-height: 1.35;
    }

    .fallback-close {
      width: 28px;
      padding: 0;
      background: transparent;
    }

    .fallback-image {
      display: block;
      width: 100%;
      max-height: 320px;
      object-fit: contain;
      background: var(--annotations-field);
      border: 1px solid var(--annotations-line);
      border-radius: 6px;
    }

    .fallback-empty {
      display: grid;
      place-items: center;
      height: 120px;
      border: 1px solid var(--annotations-line);
      border-radius: 6px;
      color: var(--annotations-muted);
      background: var(--annotations-field);
      font-size: 13px;
    }

    .fallback-text {
      width: 100%;
      min-height: 140px;
      margin-top: 10px;
      resize: vertical;
      border: 1px solid var(--annotations-line);
      border-radius: 7px;
      background: var(--annotations-field);
      color: var(--annotations-ink);
      padding: 9px 10px;
      outline: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }

    .fallback-text:focus {
      border-color: var(--annotations-accent);
      box-shadow: 0 0 0 3px var(--annotations-accent-soft);
    }

    .fallback-diagnostics {
      margin-top: 10px;
      border: 1px solid var(--annotations-line);
      border-radius: 7px;
      background: var(--annotations-field);
      color: var(--annotations-ink);
      overflow: hidden;
    }

    .fallback-diagnostics summary {
      cursor: pointer;
      padding: 8px 10px;
      color: var(--annotations-muted);
      font-size: 12px;
      font-weight: 650;
    }

    .fallback-diagnostics pre {
      max-height: 180px;
      overflow: auto;
      margin: 0;
      padding: 0 10px 10px;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--annotations-ink);
      font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    @keyframes annotations-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;
}
