import { errorMessage } from "../shared/errors";
import { isT3ComposerBridgeStatusResult } from "../shared/messages";
import type {
  SavedImage,
  T3ComposerBridgeStatusResult,
  T3ComposerDeliveryResult,
} from "../shared/types";

const T3_COMPOSER_INTAKE_REQUEST_TYPE = "t3code.external-composer-intake.request.v1";
const T3_BRIDGE_DELIVER_REQUEST_TYPE = "t3code.annotations.bridge.deliver.v1";
const T3_BRIDGE_PROTOCOL_VERSION = 1;
const DEFAULT_T3_ORIGIN = "http://127.0.0.1:3773";
const T3_BRIDGE_MANIFEST_ENDPOINT = `${DEFAULT_T3_ORIGIN}/api/annotations/bridge/manifest`;
const T3_BRIDGE_PAIRING_REQUEST_ENDPOINT = `${DEFAULT_T3_ORIGIN}/api/annotations/bridge/v1/pairing/request`;
const T3_BRIDGE_PAIRING_STATUS_ENDPOINT = `${DEFAULT_T3_ORIGIN}/api/annotations/bridge/v1/pairing/status`;
const T3_BRIDGE_DELIVER_ENDPOINT = `${DEFAULT_T3_ORIGIN}/api/annotations/bridge/v1/deliver`;
const T3_BRIDGE_STATUS_ENDPOINT = `${DEFAULT_T3_ORIGIN}/api/annotations/bridge/v1/status`;
const T3_BRIDGE_DELIVER_TIMEOUT_MS = 5_000;
const T3_BRIDGE_STATUS_TIMEOUT_MS = 1_500;
const T3_BRIDGE_CLIENT_INSTALL_ID_STORAGE_KEY = "t3BridgeClientInstallId";
const T3_BRIDGE_TOKEN_STORAGE_KEY = "t3BridgeToken";
const T3_BRIDGE_PENDING_PAIRING_STORAGE_KEY = "t3BridgePendingPairing";

export type T3ComposerIntakePayload = {
  type: typeof T3_COMPOSER_INTAKE_REQUEST_TYPE;
  requestId: string;
  source: "annotations";
  action: "insert";
  append: true;
  focus: true;
  prompt: string;
  image: {
    path: string;
    name: string;
    mimeType: "image/png";
    sizeBytes: number;
    width: number;
    height: number;
  };
};

type T3ComposerFetch = typeof fetch;
type T3BridgePendingPairing = {
  requestId: string;
  pollSecret: string;
  expiresAtEpochMs: number;
};
type T3BridgeManifest = {
  protocolVersion: number;
  appVersion: string;
  pairingRequired: boolean;
  bridgeEnabled: boolean;
  status: "ready" | "disabled" | "remote-blocked";
};
type T3BridgeFailureResult = { ok: false; reason: string; message?: string };
type T3BridgeTokenResult = { ok: true; token: string } | T3BridgeFailureResult;
type T3ComposerDiagnosticSink = (diagnostic: {
  level: "info" | "warn";
  step: string;
  message: string;
  details: Record<string, unknown>;
}) => void;

export type T3ComposerStatusOptions = {
  requestId?: string;
  reason?: string;
};

type T3BridgeDeliverResponse =
  | {
      ok: true;
      requestId: string;
    }
  | {
      ok: false;
      reason: string;
      message?: string;
    };

export async function deliverToT3Composer(
  input: {
    markdownPrompt: string;
    savedImage: SavedImage;
    requestId?: string;
  },
  fetchApi: T3ComposerFetch = globalThis.fetch.bind(globalThis),
  onDiagnostic?: T3ComposerDiagnosticSink,
): Promise<T3ComposerDeliveryResult> {
  const payload = buildT3ComposerIntakePayload(input);
  logT3Delivery(
    "info",
    "delivery:start",
    {
      requestId: payload.requestId,
      endpoint: T3_BRIDGE_DELIVER_ENDPOINT,
      imagePath: payload.image.path,
      imageBytes: payload.image.sizeBytes,
    },
    onDiagnostic,
  );

  const bridgeDelivery = await deliverPayloadToBridge(fetchApi, payload, onDiagnostic);
  logT3Delivery(
    bridgeDelivery.ok ? "info" : "warn",
    "delivery:bridge-result",
    {
      requestId: payload.requestId,
      ...deliveryLogDetails(bridgeDelivery),
    },
    onDiagnostic,
  );
  return bridgeDelivery;
}

export async function readT3ComposerStatus(
  options: T3ComposerStatusOptions = {},
  fetchApi: T3ComposerFetch = globalThis.fetch.bind(globalThis),
  onDiagnostic?: T3ComposerDiagnosticSink,
): Promise<T3ComposerBridgeStatusResult> {
  logT3Delivery(
    "info",
    "status:start",
    {
      requestId: options.requestId ?? null,
      reason: options.reason ?? null,
      endpoint: T3_BRIDGE_STATUS_ENDPOINT,
    },
    onDiagnostic,
  );

  const status = await fetchT3BridgeStatus(fetchApi, onDiagnostic);
  logT3Delivery(
    status.ok ? "info" : "warn",
    "status:result",
    {
      requestId: options.requestId ?? null,
      reason: options.reason ?? null,
      ...statusLogDetails(status),
    },
    onDiagnostic,
  );
  return status;
}

export function buildT3ComposerIntakePayload(input: {
  markdownPrompt: string;
  savedImage: SavedImage;
  requestId?: string;
}): T3ComposerIntakePayload {
  return {
    type: T3_COMPOSER_INTAKE_REQUEST_TYPE,
    requestId: input.requestId ?? createRequestId(input.savedImage),
    source: "annotations",
    action: "insert",
    append: true,
    focus: true,
    prompt: input.markdownPrompt,
    image: {
      path: input.savedImage.filename,
      name: imageNameFromSavedImage(input.savedImage),
      mimeType: "image/png",
      sizeBytes: input.savedImage.imageBytes,
      width: input.savedImage.width,
      height: input.savedImage.height,
    },
  };
}

async function deliverPayloadToBridge(
  fetchApi: T3ComposerFetch,
  payload: T3ComposerIntakePayload,
  onDiagnostic?: T3ComposerDiagnosticSink,
): Promise<T3ComposerDeliveryResult> {
  const tokenResult = await ensureT3BridgeToken(fetchApi, onDiagnostic);
  if (!tokenResult.ok) {
    return {
      ok: false,
      requestId: payload.requestId,
      reason: tokenResult.reason,
      message: tokenResult.message,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), T3_BRIDGE_DELIVER_TIMEOUT_MS);
  try {
    const response = await fetchApi(T3_BRIDGE_DELIVER_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenResult.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(toT3BridgeDeliverPayload(payload)),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as T3BridgeDeliverResponse | null;
    if (response.ok && body?.ok) {
      return {
        ok: true,
        requestId: payload.requestId,
        url: T3_BRIDGE_DELIVER_ENDPOINT,
      };
    }

    if (response.status === 401) {
      await clearT3BridgeToken();
    }

    const reason = body?.ok === false ? body.reason : "delivery-failed";
    return {
      ok: false,
      requestId: payload.requestId,
      reason,
      message:
        body?.ok === false
          ? (body.message ??
            `HTTP ${response.status} ${response.statusText || "response"}: ${reason}`)
          : `HTTP ${response.status} ${response.statusText || "response"}`,
    };
  } catch (error) {
    return {
      ok: false,
      requestId: payload.requestId,
      reason: "app-unreachable",
      message: errorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchT3BridgeStatus(
  fetchApi: T3ComposerFetch,
  onDiagnostic?: T3ComposerDiagnosticSink,
): Promise<T3ComposerBridgeStatusResult> {
  const tokenResult = await ensureT3BridgeToken(fetchApi, onDiagnostic);
  if (!tokenResult.ok) {
    return {
      ok: false,
      reason: tokenResult.reason,
      message: tokenResult.message,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), T3_BRIDGE_STATUS_TIMEOUT_MS);
  try {
    const response = await fetchApi(T3_BRIDGE_STATUS_ENDPOINT, {
      method: "GET",
      headers: {
        authorization: `Bearer ${tokenResult.token}`,
      },
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as unknown;
    if (isT3ComposerBridgeStatusResult(body)) return body;

    if (response.status === 401) {
      await clearT3BridgeToken();
    }

    return {
      ok: false,
      reason: response.status === 401 ? "unauthorized" : "app-unreachable",
      message: response.ok
        ? "T3 status bridge returned a malformed response."
        : `HTTP ${response.status} ${response.statusText || "response"}`,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "app-unreachable",
      message: errorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureT3BridgeToken(
  fetchApi: T3ComposerFetch,
  onDiagnostic?: T3ComposerDiagnosticSink,
): Promise<T3BridgeTokenResult> {
  const manifest = await fetchT3BridgeManifest(fetchApi);
  if (!manifest.ok) return manifest;
  if (manifest.manifest.protocolVersion !== T3_BRIDGE_PROTOCOL_VERSION) {
    return {
      ok: false,
      reason: "protocol-version-mismatch",
      message: `T3 bridge protocol ${manifest.manifest.protocolVersion} is not supported.`,
    };
  }
  if (!manifest.manifest.bridgeEnabled) {
    return {
      ok: false,
      reason: "bridge-disabled",
      message: "Annotations bridge is disabled in T3 Code.",
    };
  }
  if (manifest.manifest.status === "remote-blocked") {
    return {
      ok: false,
      reason: "remote-bridge-disabled",
      message: "Annotations bridge is blocked while T3 Code is network-reachable.",
    };
  }

  const token = await readT3BridgeToken();
  if (token) return { ok: true, token };

  const pendingToken = await resumeT3BridgePairing(fetchApi, onDiagnostic);
  if (pendingToken.ok) return pendingToken;
  if (pendingToken.reason === "pairing-pending") return pendingToken;

  return requestT3BridgePairing(fetchApi, onDiagnostic);
}

async function fetchT3BridgeManifest(
  fetchApi: T3ComposerFetch,
): Promise<{ ok: true; manifest: T3BridgeManifest } | T3BridgeFailureResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), T3_BRIDGE_STATUS_TIMEOUT_MS);
  try {
    const response = await fetchApi(T3_BRIDGE_MANIFEST_ENDPOINT, {
      method: "GET",
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok || !isT3BridgeManifest(body)) {
      return {
        ok: false,
        reason: "app-unreachable",
        message: response.ok
          ? "T3 bridge manifest returned a malformed response."
          : `HTTP ${response.status} ${response.statusText || "response"}`,
      };
    }
    return { ok: true, manifest: body };
  } catch (error) {
    return {
      ok: false,
      reason: "app-unreachable",
      message: errorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function resumeT3BridgePairing(
  fetchApi: T3ComposerFetch,
  onDiagnostic?: T3ComposerDiagnosticSink,
): Promise<T3BridgeTokenResult> {
  const pending = await readT3BridgePendingPairing();
  if (!pending) {
    return { ok: false, reason: "not-paired" };
  }
  if (pending.expiresAtEpochMs <= Date.now()) {
    await clearT3BridgePendingPairing();
    return { ok: false, reason: "pairing-expired" };
  }

  const result = await pollT3BridgePairing(fetchApi, pending);
  logT3Delivery(
    result.ok ? "info" : "warn",
    "pairing:poll",
    {
      requestId: pending.requestId,
      reason: result.ok ? null : result.reason,
    },
    onDiagnostic,
  );
  return result;
}

async function requestT3BridgePairing(
  fetchApi: T3ComposerFetch,
  onDiagnostic?: T3ComposerDiagnosticSink,
): Promise<T3BridgeTokenResult> {
  const clientInstallId = await readOrCreateT3BridgeClientInstallId();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), T3_BRIDGE_STATUS_TIMEOUT_MS);
  try {
    const response = await fetchApi(T3_BRIDGE_PAIRING_REQUEST_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        protocolVersion: T3_BRIDGE_PROTOCOL_VERSION,
        clientInstallId,
        clientName: "Annotations",
        extensionId: readExtensionId(),
        browser: navigator.userAgent,
      }),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      requestId?: unknown;
      pollSecret?: unknown;
      expiresAtEpochMs?: unknown;
      reason?: unknown;
      message?: unknown;
    } | null;

    if (response.ok && body?.ok === true && isPendingPairingBody(body)) {
      const pending = {
        requestId: body.requestId,
        pollSecret: body.pollSecret,
        expiresAtEpochMs: body.expiresAtEpochMs,
      };
      await writeT3BridgePendingPairing(pending);
      logT3Delivery(
        "info",
        "pairing:requested",
        { requestId: pending.requestId, expiresAtEpochMs: pending.expiresAtEpochMs },
        onDiagnostic,
      );
      return {
        ok: false,
        reason: "pairing-pending",
        message: "Approve Annotations in T3 Code Settings > Connections.",
      };
    }

    return {
      ok: false,
      reason: typeof body?.reason === "string" ? body.reason : "app-unreachable",
      message:
        typeof body?.message === "string"
          ? body.message
          : `HTTP ${response.status} ${response.statusText || "response"}`,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "app-unreachable",
      message: errorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function pollT3BridgePairing(
  fetchApi: T3ComposerFetch,
  pending: T3BridgePendingPairing,
): Promise<T3BridgeTokenResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), T3_BRIDGE_STATUS_TIMEOUT_MS);
  try {
    const response = await fetchApi(T3_BRIDGE_PAIRING_STATUS_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requestId: pending.requestId,
        pollSecret: pending.pollSecret,
      }),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      token?: unknown;
      reason?: unknown;
      message?: unknown;
      status?: unknown;
    } | null;

    if (response.ok && body?.ok === true && typeof body.token === "string") {
      await writeT3BridgeToken(body.token);
      await clearT3BridgePendingPairing();
      return { ok: true, token: body.token };
    }

    const reason = typeof body?.reason === "string" ? body.reason : "pairing-pending";
    if (reason === "pairing-rejected" || reason === "pairing-expired") {
      await clearT3BridgePendingPairing();
    }
    return {
      ok: false,
      reason,
      message:
        typeof body?.message === "string"
          ? body.message
          : reason === "pairing-pending"
            ? "Approve Annotations in T3 Code Settings > Connections."
            : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "app-unreachable",
      message: errorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toT3BridgeDeliverPayload(payload: T3ComposerIntakePayload) {
  return {
    type: T3_BRIDGE_DELIVER_REQUEST_TYPE,
    requestId: payload.requestId,
    action: payload.action,
    append: payload.append,
    focus: payload.focus,
    prompt: payload.prompt,
    image: payload.image,
  };
}

function readExtensionId(): string {
  return globalThis.chrome?.runtime?.id ?? "";
}

let memoryBridgeStorage: Record<string, unknown> = {};

export function __resetT3BridgeStorageForTests(): void {
  memoryBridgeStorage = {};
}

export function __setT3BridgeTokenForTests(token: string): void {
  memoryBridgeStorage = { ...memoryBridgeStorage, [T3_BRIDGE_TOKEN_STORAGE_KEY]: token };
}

function readStorageArea(): chrome.storage.StorageArea | null {
  return globalThis.chrome?.storage?.local ?? null;
}

async function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  const storage = readStorageArea();
  if (!storage) {
    return Object.fromEntries(keys.map((key) => [key, memoryBridgeStorage[key]]));
  }
  return (await storage.get(keys)) as Record<string, unknown>;
}

async function storageSet(items: Record<string, unknown>): Promise<void> {
  const storage = readStorageArea();
  if (!storage) {
    memoryBridgeStorage = { ...memoryBridgeStorage, ...items };
    return;
  }
  await storage.set(items);
}

async function storageRemove(keys: string | string[]): Promise<void> {
  const storage = readStorageArea();
  const keyList = Array.isArray(keys) ? keys : [keys];
  if (!storage) {
    memoryBridgeStorage = Object.fromEntries(
      Object.entries(memoryBridgeStorage).filter(([key]) => !keyList.includes(key)),
    );
    return;
  }
  await storage.remove(keys);
}

async function readOrCreateT3BridgeClientInstallId(): Promise<string> {
  const values = await storageGet([T3_BRIDGE_CLIENT_INSTALL_ID_STORAGE_KEY]);
  const existing = values[T3_BRIDGE_CLIENT_INSTALL_ID_STORAGE_KEY];
  if (typeof existing === "string" && existing.trim().length > 0) return existing;

  const next = createBridgeRandomId();
  await storageSet({ [T3_BRIDGE_CLIENT_INSTALL_ID_STORAGE_KEY]: next });
  return next;
}

async function readT3BridgeToken(): Promise<string | null> {
  const values = await storageGet([T3_BRIDGE_TOKEN_STORAGE_KEY]);
  const token = values[T3_BRIDGE_TOKEN_STORAGE_KEY];
  return typeof token === "string" && token.trim().length > 0 ? token : null;
}

async function writeT3BridgeToken(token: string): Promise<void> {
  await storageSet({ [T3_BRIDGE_TOKEN_STORAGE_KEY]: token });
}

async function clearT3BridgeToken(): Promise<void> {
  await storageRemove(T3_BRIDGE_TOKEN_STORAGE_KEY);
}

async function readT3BridgePendingPairing(): Promise<T3BridgePendingPairing | null> {
  const values = await storageGet([T3_BRIDGE_PENDING_PAIRING_STORAGE_KEY]);
  const pending = values[T3_BRIDGE_PENDING_PAIRING_STORAGE_KEY];
  return isT3BridgePendingPairing(pending) ? pending : null;
}

async function writeT3BridgePendingPairing(pending: T3BridgePendingPairing): Promise<void> {
  await storageSet({ [T3_BRIDGE_PENDING_PAIRING_STORAGE_KEY]: pending });
}

async function clearT3BridgePendingPairing(): Promise<void> {
  await storageRemove(T3_BRIDGE_PENDING_PAIRING_STORAGE_KEY);
}

function createBridgeRandomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `annotations-${Date.now()}-${Math.random()}`;
}

function isT3BridgeManifest(value: unknown): value is T3BridgeManifest {
  return (
    isRecord(value) &&
    typeof value.protocolVersion === "number" &&
    typeof value.appVersion === "string" &&
    typeof value.pairingRequired === "boolean" &&
    typeof value.bridgeEnabled === "boolean" &&
    (value.status === "ready" || value.status === "disabled" || value.status === "remote-blocked")
  );
}

function isPendingPairingBody(value: {
  requestId?: unknown;
  pollSecret?: unknown;
  expiresAtEpochMs?: unknown;
}): value is { requestId: string; pollSecret: string; expiresAtEpochMs: number } {
  return (
    typeof value.requestId === "string" &&
    typeof value.pollSecret === "string" &&
    typeof value.expiresAtEpochMs === "number"
  );
}

function isT3BridgePendingPairing(value: unknown): value is T3BridgePendingPairing {
  return (
    isRecord(value) &&
    typeof value.requestId === "string" &&
    typeof value.pollSecret === "string" &&
    typeof value.expiresAtEpochMs === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function basenameFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1);
}

function imageNameFromSavedImage(savedImage: SavedImage): string {
  const actualName = basenameFromPath(savedImage.filename);
  const requestedName = basenameFromPath(savedImage.requestedFilename);
  if (isPngName(actualName)) return actualName;
  if (isPngName(requestedName)) return requestedName;
  return actualName || requestedName || "annotations.png";
}

function isPngName(name: string): boolean {
  return name.toLowerCase().endsWith(".png");
}

function createRequestId(savedImage: SavedImage): string {
  const randomSuffix = crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(16).slice(2);
  return `annotations-${savedImage.downloadId}-${randomSuffix}`;
}

function logT3Delivery(
  level: "info" | "warn",
  step: string,
  details: Record<string, unknown>,
  onDiagnostic?: T3ComposerDiagnosticSink,
): void {
  console.warn("[Annotations][T3]", level, step, details);
  onDiagnostic?.({
    level,
    step,
    message: `T3 Composer delivery ${step}.`,
    details,
  });
}

function deliveryLogDetails(result: T3ComposerDeliveryResult): Record<string, unknown> {
  if (result.ok) {
    return {
      ok: true,
      url: result.url,
    };
  }

  return {
    ok: false,
    requestId: result.requestId ?? null,
    reason: result.reason,
    message: result.message ?? null,
  };
}

function statusLogDetails(result: T3ComposerBridgeStatusResult): Record<string, unknown> {
  if (!result.ok) {
    return {
      ok: false,
      statusReason: result.reason,
      message: result.message ?? null,
    };
  }

  return {
    ok: true,
    connected: result.connected,
    statusReason: result.reason,
    checkedAtEpochMs: result.checkedAtEpochMs,
    targetThreadId: result.target?.threadId ?? null,
    targetThreadTitle: result.target?.threadTitle ?? null,
    targetClientKind: result.target?.clientKind ?? null,
  };
}
