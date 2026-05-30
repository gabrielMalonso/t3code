type UserActivationState = {
  isActive: boolean;
  hasBeenActive: boolean;
};

type NavigatorWithUserActivation = Navigator & {
  userActivation?: UserActivationState;
};

export function clipboardCapabilityDetails(): Record<string, string | number | boolean | null> {
  const userActivation = (navigator as NavigatorWithUserActivation).userActivation;

  return {
    hasNavigatorClipboard: Boolean(navigator.clipboard),
    hasClipboardWrite: typeof navigator.clipboard?.write === "function",
    hasClipboardItem: typeof ClipboardItem !== "undefined",
    isSecureContext,
    documentVisibilityState: document.visibilityState,
    documentHasFocus: document.hasFocus(),
    activeElement: describeElement(document.activeElement),
    userActivationIsActive: userActivation?.isActive ?? null,
    userActivationHasBeenActive: userActivation?.hasBeenActive ?? null,
    userAgent: navigator.userAgent,
  };
}

function describeElement(element: Element | null): string | null {
  if (!element) return null;

  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = Array.from(element.classList).slice(0, 3);
  const className = classes.length > 0 ? `.${classes.join(".")}` : "";

  return `${tag}${id}${className}`;
}
