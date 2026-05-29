import type { ComposerFileReference } from "./t3code-custom/file-references";

export const EXTERNAL_COMPOSER_INTAKE_REQUEST_TYPE = "t3code.composer-intake.request.v1";
export const EXTERNAL_COMPOSER_INTAKE_RESPONSE_TYPE = "t3code.composer-intake.response.v1";

export const EXTERNAL_COMPOSER_INTAKE_MAX_PROMPT_LENGTH = 100_000;
const EXTERNAL_COMPOSER_INTAKE_MAX_PATH_LENGTH = 4_096;

export type ExternalComposerIntakeSource = "pointnshoot";
export type ExternalComposerIntakeAction = "insert";

export type ExternalComposerIntakeImage = {
  readonly path: string;
  readonly name?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
  readonly width?: number;
  readonly height?: number;
};

export type ExternalComposerIntakeRequest = {
  readonly type: typeof EXTERNAL_COMPOSER_INTAKE_REQUEST_TYPE;
  readonly requestId: string;
  readonly source: ExternalComposerIntakeSource;
  readonly action: ExternalComposerIntakeAction;
  readonly prompt: string;
  readonly append: boolean;
  readonly focus: boolean;
  readonly image: ExternalComposerIntakeImage | null;
};

export type ExternalComposerIntakeValidation =
  | { readonly ok: true; readonly request: ExternalComposerIntakeRequest }
  | { readonly ok: false; readonly requestId: string | null; readonly reason: string };

export type ExternalComposerIntakeResponse =
  | {
      readonly type: typeof EXTERNAL_COMPOSER_INTAKE_RESPONSE_TYPE;
      readonly requestId: string;
      readonly ok: true;
      readonly status: "inserted";
    }
  | {
      readonly type: typeof EXTERNAL_COMPOSER_INTAKE_RESPONSE_TYPE;
      readonly requestId: string;
      readonly ok: false;
      readonly reason: string;
    };

export function validateExternalComposerIntakeMessage(
  value: unknown,
): ExternalComposerIntakeValidation {
  if (!isRecord(value) || value.type !== EXTERNAL_COMPOSER_INTAKE_REQUEST_TYPE) {
    return { ok: false, requestId: null, reason: "unsupported-message" };
  }

  const requestId = typeof value.requestId === "string" ? value.requestId : null;
  if (!requestId || requestId.length > 120) {
    return { ok: false, requestId, reason: "invalid-request-id" };
  }

  if (value.source !== "pointnshoot") {
    return { ok: false, requestId, reason: "unsupported-source" };
  }

  if (value.action !== undefined && value.action !== "insert") {
    return { ok: false, requestId, reason: "unsupported-action" };
  }

  if (typeof value.prompt !== "string") {
    return { ok: false, requestId, reason: "invalid-prompt" };
  }

  const prompt = value.prompt.trim();
  if (prompt.length === 0) {
    return { ok: false, requestId, reason: "empty-prompt" };
  }
  if (prompt.length > EXTERNAL_COMPOSER_INTAKE_MAX_PROMPT_LENGTH) {
    return { ok: false, requestId, reason: "prompt-too-large" };
  }

  const image = normalizeExternalComposerIntakeImage(value.image);
  if (image === false) {
    return { ok: false, requestId, reason: "invalid-image" };
  }

  return {
    ok: true,
    request: {
      type: EXTERNAL_COMPOSER_INTAKE_REQUEST_TYPE,
      requestId,
      source: "pointnshoot",
      action: "insert",
      prompt,
      append: value.append !== false,
      focus: value.focus !== false,
      image,
    },
  };
}

export function appendExternalComposerIntakePrompt(input: {
  readonly currentPrompt: string;
  readonly incomingPrompt: string;
  readonly append: boolean;
}): string {
  const incomingPrompt = input.incomingPrompt.trim();
  if (!input.append || input.currentPrompt.trim().length === 0) {
    return incomingPrompt;
  }
  return `${input.currentPrompt.trimEnd()}\n\n${incomingPrompt}`;
}

export function composerFileReferenceFromExternalIntake(input: {
  readonly image: ExternalComposerIntakeImage | null;
  readonly id: string;
}): ComposerFileReference | null {
  const image = input.image;
  if (!image) return null;

  return {
    id: input.id,
    name: image.name?.trim() || basenameFromPath(image.path) || "pointnshoot.png",
    path: image.path,
    mimeType: image.mimeType?.trim() || "image/png",
    sizeBytes: typeof image.sizeBytes === "number" && image.sizeBytes >= 0 ? image.sizeBytes : 0,
  };
}

export function buildExternalComposerIntakeResponse(
  requestId: string,
  result: { readonly ok: true } | { readonly ok: false; readonly reason: string },
): ExternalComposerIntakeResponse {
  if (result.ok) {
    return {
      type: EXTERNAL_COMPOSER_INTAKE_RESPONSE_TYPE,
      requestId,
      ok: true,
      status: "inserted",
    };
  }
  return {
    type: EXTERNAL_COMPOSER_INTAKE_RESPONSE_TYPE,
    requestId,
    ok: false,
    reason: result.reason,
  };
}

function normalizeExternalComposerIntakeImage(
  value: unknown,
): ExternalComposerIntakeImage | null | false {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return false;
  if (typeof value.path !== "string") return false;

  const path = value.path.trim();
  if (path.length === 0 || path.length > EXTERNAL_COMPOSER_INTAKE_MAX_PATH_LENGTH) return false;

  return {
    path,
    ...(typeof value.name === "string" && value.name.trim().length > 0
      ? { name: value.name.trim().slice(0, 255) }
      : {}),
    ...(typeof value.mimeType === "string" && value.mimeType.trim().length > 0
      ? { mimeType: value.mimeType.trim().slice(0, 120) }
      : {}),
    ...(typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes)
      ? { sizeBytes: Math.max(0, value.sizeBytes) }
      : {}),
    ...(typeof value.width === "number" && Number.isFinite(value.width)
      ? { width: Math.max(0, value.width) }
      : {}),
    ...(typeof value.height === "number" && Number.isFinite(value.height)
      ? { height: Math.max(0, value.height) }
      : {}),
  };
}

function basenameFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
