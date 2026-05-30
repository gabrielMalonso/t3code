import { errorMessage } from "../shared/errors";
import { isT3ComposerBridgeStatusResult } from "../shared/messages";
import type {
  SavedImage,
  T3ComposerBridgeStatusResult,
  T3ComposerDeliveryResult,
} from "../shared/types";

const T3_COMPOSER_INTAKE_REQUEST_TYPE = "t3code.composer-intake.request.v1";
const T3_COMPOSER_INTAKE_RESPONSE_TYPE = "t3code.composer-intake.response.v1";
const DEFAULT_T3_ORIGIN = "http://127.0.0.1:3773";
const DEFAULT_T3_COMPOSER_INTAKE_ENDPOINT = `${DEFAULT_T3_ORIGIN}/api/annotations/composer-intake`;
const DEFAULT_T3_COMPOSER_STATUS_ENDPOINT = `${DEFAULT_T3_COMPOSER_INTAKE_ENDPOINT}/status`;
const LEGACY_T3_COMPOSER_INTAKE_ENDPOINT = `${DEFAULT_T3_ORIGIN}/api/pointnshoot/composer-intake`;
const LEGACY_T3_COMPOSER_STATUS_ENDPOINT = `${LEGACY_T3_COMPOSER_INTAKE_ENDPOINT}/status`;
const T3_TAB_URL_PATTERNS = ["http://127.0.0.1/*", "http://localhost/*"];
const T3_COMPOSER_DELIVERY_TIMEOUT_MS = 1_500;
const T3_COMPOSER_HTTP_TIMEOUT_MS = 1_500;
const T3_COMPOSER_STATUS_TIMEOUT_MS = 1_500;
const T3_COMPOSER_OPEN_TIMEOUT_MS = 5_000;

type T3ComposerEndpoint = {
  kind: "annotations" | "legacy-pointnshoot";
  intakeEndpoint: string;
  statusEndpoint: string;
  extensionIdHeader: "x-annotations-extension-id" | "x-pointnshoot-extension-id";
  source: T3ComposerIntakePayload["source"];
};

const T3_COMPOSER_ENDPOINTS: readonly T3ComposerEndpoint[] = [
  {
    kind: "annotations",
    intakeEndpoint: DEFAULT_T3_COMPOSER_INTAKE_ENDPOINT,
    statusEndpoint: DEFAULT_T3_COMPOSER_STATUS_ENDPOINT,
    extensionIdHeader: "x-annotations-extension-id",
    source: "annotations",
  },
  {
    kind: "legacy-pointnshoot",
    intakeEndpoint: LEGACY_T3_COMPOSER_INTAKE_ENDPOINT,
    statusEndpoint: LEGACY_T3_COMPOSER_STATUS_ENDPOINT,
    extensionIdHeader: "x-pointnshoot-extension-id",
    source: "pointnshoot",
  },
] as const;

export type T3ComposerIntakePayload = {
  type: typeof T3_COMPOSER_INTAKE_REQUEST_TYPE;
  requestId: string;
  source: "annotations" | "pointnshoot";
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

type T3ComposerBridgeResponse =
  | {
      type: typeof T3_COMPOSER_INTAKE_RESPONSE_TYPE;
      requestId: string;
      ok: true;
      status: "inserted";
    }
  | {
      type: typeof T3_COMPOSER_INTAKE_RESPONSE_TYPE;
      requestId: string;
      ok: false;
      reason: string;
    };

export type T3ComposerDeliveryTab = Pick<
  chrome.tabs.Tab,
  "active" | "id" | "pendingUrl" | "status" | "title" | "url" | "windowId"
>;

type T3ComposerExecuteScriptDetails = {
  target: { tabId: number };
  func: typeof postT3ComposerIntakeRequest;
  args: [T3ComposerIntakePayload, typeof T3_COMPOSER_INTAKE_RESPONSE_TYPE, number];
};

type T3ComposerExecuteScriptResult = {
  result?: unknown;
};

export type T3ComposerDeliveryChrome = {
  tabs: {
    query(queryInfo: chrome.tabs.QueryInfo): Promise<T3ComposerDeliveryTab[]>;
    create(createProperties: chrome.tabs.CreateProperties): Promise<T3ComposerDeliveryTab>;
    get(tabId: number): Promise<T3ComposerDeliveryTab>;
    update(
      tabId: number,
      updateProperties: chrome.tabs.UpdateProperties,
    ): Promise<T3ComposerDeliveryTab>;
    onUpdated: {
      addListener(listener: Parameters<typeof chrome.tabs.onUpdated.addListener>[0]): void;
      removeListener(listener: Parameters<typeof chrome.tabs.onUpdated.removeListener>[0]): void;
    };
  };
  scripting: {
    executeScript(
      details: T3ComposerExecuteScriptDetails,
    ): Promise<T3ComposerExecuteScriptResult[]>;
  };
};

type T3ComposerFetch = typeof fetch;
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

type T3ComposerHttpBridgeResponse =
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
  chromeApi: T3ComposerDeliveryChrome = readChromeApi(),
  fetchApi: T3ComposerFetch = globalThis.fetch.bind(globalThis),
  onDiagnostic?: T3ComposerDiagnosticSink,
): Promise<T3ComposerDeliveryResult> {
  const payload = buildT3ComposerIntakePayload(input);
  logT3Delivery(
    "info",
    "delivery:start",
    {
      requestId: payload.requestId,
      endpoint: DEFAULT_T3_COMPOSER_INTAKE_ENDPOINT,
      imagePath: payload.image.path,
      imageBytes: payload.image.sizeBytes,
    },
    onDiagnostic,
  );

  const httpDelivery = await deliverPayloadToHttpBridge(fetchApi, payload, onDiagnostic);
  logT3Delivery(
    httpDelivery.ok ? "info" : "warn",
    "delivery:http-result",
    {
      requestId: payload.requestId,
      ...deliveryLogDetails(httpDelivery),
    },
    onDiagnostic,
  );
  if (httpDelivery.ok) return httpDelivery;
  if (!shouldUseTabFallbackAfterHttp(httpDelivery)) return httpDelivery;

  const candidateTabs = sortCandidateTabs(
    await chromeApi.tabs.query({
      url: T3_TAB_URL_PATTERNS,
      windowType: "normal",
    }),
  );
  logT3Delivery(
    "info",
    "delivery:tab-candidates",
    {
      requestId: payload.requestId,
      count: candidateTabs.length,
      tabs: candidateTabs.map(tabLogDetails),
    },
    onDiagnostic,
  );

  for (const tab of candidateTabs) {
    logT3Delivery(
      "info",
      "delivery:tab-attempt",
      {
        requestId: payload.requestId,
        tab: tabLogDetails(tab),
      },
      onDiagnostic,
    );
    const result = await deliverPayloadToTab(chromeApi, tab, payload);
    logT3Delivery(
      result.ok ? "info" : "warn",
      "delivery:tab-result",
      {
        requestId: payload.requestId,
        tab: tabLogDetails(tab),
        ...deliveryLogDetails(result),
      },
      onDiagnostic,
    );
    if (result.ok) return result;
  }

  try {
    const created = await chromeApi.tabs.create({ url: DEFAULT_T3_ORIGIN, active: false });
    logT3Delivery(
      "info",
      "delivery:open-t3-tab",
      {
        requestId: payload.requestId,
        tab: tabLogDetails(created),
      },
      onDiagnostic,
    );
    await waitForTabReady(chromeApi, created.id, T3_COMPOSER_OPEN_TIMEOUT_MS);
    const result = await deliverPayloadToTab(chromeApi, created, payload, { focusOnSuccess: true });
    logT3Delivery(
      result.ok ? "info" : "warn",
      "delivery:opened-tab-result",
      {
        requestId: payload.requestId,
        tab: tabLogDetails(created),
        ...deliveryLogDetails(result),
      },
      onDiagnostic,
    );
    return result;
  } catch (error) {
    logT3Delivery(
      "warn",
      "delivery:open-t3-failed",
      {
        requestId: payload.requestId,
        message: errorMessage(error),
      },
      onDiagnostic,
    );
    return {
      ok: false,
      requestId: payload.requestId,
      reason: "t3-open-failed",
      message: errorMessage(error),
    };
  }
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
      endpoint: DEFAULT_T3_COMPOSER_STATUS_ENDPOINT,
    },
    onDiagnostic,
  );

  const status = await fetchT3ComposerStatus(fetchApi, onDiagnostic);
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
      name:
        basenameFromPath(input.savedImage.filename) ||
        basenameFromPath(input.savedImage.requestedFilename) ||
        "annotations.png",
      mimeType: "image/png",
      sizeBytes: input.savedImage.imageBytes,
      width: input.savedImage.width,
      height: input.savedImage.height,
    },
  };
}

async function deliverPayloadToTab(
  chromeApi: T3ComposerDeliveryChrome,
  tab: T3ComposerDeliveryTab,
  payload: T3ComposerIntakePayload,
  options: { focusOnSuccess?: boolean } = {},
): Promise<T3ComposerDeliveryResult> {
  if (typeof tab.id !== "number") {
    return {
      ok: false,
      requestId: payload.requestId,
      reason: "tab-id-missing",
      message: "Chrome returned a tab without an id.",
    };
  }

  try {
    const injectionResults = await chromeApi.scripting.executeScript({
      target: { tabId: tab.id },
      func: postT3ComposerIntakeRequest,
      args: [payload, T3_COMPOSER_INTAKE_RESPONSE_TYPE, T3_COMPOSER_DELIVERY_TIMEOUT_MS],
    });
    const response = injectionResults[0]?.result;
    if (!isT3ComposerBridgeResponse(response, payload.requestId)) {
      return {
        ok: false,
        requestId: payload.requestId,
        reason: "t3-no-response",
        message: responseToMessage(response),
      };
    }

    if (!response.ok) {
      return { ok: false, requestId: payload.requestId, reason: response.reason };
    }

    if (options.focusOnSuccess) {
      await chromeApi.tabs.update(tab.id, { active: true }).catch(() => tab);
    }

    return {
      ok: true,
      requestId: payload.requestId,
      tabId: tab.id,
      url: tab.url ?? tab.pendingUrl ?? null,
      mode: "tab",
    };
  } catch (error) {
    return {
      ok: false,
      requestId: payload.requestId,
      reason: "t3-injection-failed",
      message: errorMessage(error),
    };
  }
}

async function deliverPayloadToHttpBridge(
  fetchApi: T3ComposerFetch,
  payload: T3ComposerIntakePayload,
  onDiagnostic?: T3ComposerDiagnosticSink,
): Promise<T3ComposerDeliveryResult> {
  let lastResult: T3ComposerDeliveryResult | null = null;

  for (const endpoint of T3_COMPOSER_ENDPOINTS) {
    const result = await deliverPayloadToHttpBridgeEndpoint(fetchApi, payload, endpoint);
    lastResult = result;
    logT3Delivery(
      result.ok ? "info" : "warn",
      "delivery:http-endpoint-result",
      {
        requestId: payload.requestId,
        endpointKind: endpoint.kind,
        endpoint: endpoint.intakeEndpoint,
        ...deliveryLogDetails(result),
      },
      onDiagnostic,
    );
    if (result.ok) return result;
    if (!shouldTryNextHttpEndpoint(result)) return result;
  }

  return (
    lastResult ?? {
      ok: false,
      requestId: payload.requestId,
      reason: "t3-http-failed",
      message: "No T3 Composer HTTP endpoints were attempted.",
    }
  );
}

async function deliverPayloadToHttpBridgeEndpoint(
  fetchApi: T3ComposerFetch,
  payload: T3ComposerIntakePayload,
  endpoint: T3ComposerEndpoint,
): Promise<T3ComposerDeliveryResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), T3_COMPOSER_HTTP_TIMEOUT_MS);
  const endpointPayload = payloadForEndpoint(payload, endpoint);

  try {
    const response = await fetchApi(endpoint.intakeEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [endpoint.extensionIdHeader]: readExtensionId(),
      },
      body: JSON.stringify(endpointPayload),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as T3ComposerHttpBridgeResponse | null;
    if (response.ok && body?.ok) {
      return {
        ok: true,
        requestId: payload.requestId,
        tabId: null,
        url: endpoint.intakeEndpoint,
        mode: "http",
      };
    }

    const reason = body?.ok === false ? body.reason : `t3-http-${response.status}`;
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
      reason: "t3-http-failed",
      message: errorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchT3ComposerStatus(
  fetchApi: T3ComposerFetch,
  onDiagnostic?: T3ComposerDiagnosticSink,
): Promise<T3ComposerBridgeStatusResult> {
  let lastStatus: T3ComposerBridgeStatusResult | null = null;

  for (const endpoint of T3_COMPOSER_ENDPOINTS) {
    const status = await fetchT3ComposerStatusEndpoint(fetchApi, endpoint);
    lastStatus = status;
    logT3Delivery(
      status.ok ? "info" : "warn",
      "status:endpoint-result",
      {
        endpointKind: endpoint.kind,
        endpoint: endpoint.statusEndpoint,
        ...statusLogDetails(status),
      },
      onDiagnostic,
    );
    if (status.ok) return status;
    if (!shouldTryNextStatusEndpoint(status)) return status;
  }

  return (
    lastStatus ?? {
      ok: false,
      reason: "t3-status-http-failed",
      message: "No T3 Composer status endpoints were attempted.",
    }
  );
}

async function fetchT3ComposerStatusEndpoint(
  fetchApi: T3ComposerFetch,
  endpoint: T3ComposerEndpoint,
): Promise<T3ComposerBridgeStatusResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), T3_COMPOSER_STATUS_TIMEOUT_MS);

  try {
    const response = await fetchApi(endpoint.statusEndpoint, {
      method: "GET",
      headers: {
        [endpoint.extensionIdHeader]: readExtensionId(),
      },
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as unknown;
    if (isT3ComposerBridgeStatusResult(body)) return body;

    return {
      ok: false,
      reason: `t3-status-http-${response.status}`,
      message: response.ok
        ? "T3 status bridge returned a malformed response."
        : `HTTP ${response.status} ${response.statusText || "response"}`,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "t3-status-http-failed",
      message: errorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function shouldUseTabFallbackAfterHttp(result: T3ComposerDeliveryResult): boolean {
  return !result.ok && isHttpEndpointCompatibilityFailure(result.reason);
}

function shouldTryNextHttpEndpoint(result: T3ComposerDeliveryResult): boolean {
  if (result.ok) return false;
  return isHttpEndpointCompatibilityFailure(result.reason);
}

function shouldTryNextStatusEndpoint(result: T3ComposerBridgeStatusResult): boolean {
  if (result.ok) return false;
  return (
    result.reason === "t3-status-http-failed" ||
    result.reason === "t3-status-http-200" ||
    result.reason === "t3-status-http-404" ||
    result.reason === "t3-status-http-405"
  );
}

function isHttpEndpointCompatibilityFailure(reason: string): boolean {
  return (
    reason === "annotations-extension-not-allowed" ||
    reason === "t3-http-failed" ||
    reason === "t3-http-200" ||
    reason === "t3-http-403" ||
    reason === "t3-http-404" ||
    reason === "t3-http-405"
  );
}

function payloadForEndpoint(
  payload: T3ComposerIntakePayload,
  endpoint: T3ComposerEndpoint,
): T3ComposerIntakePayload {
  if (payload.source === endpoint.source) return payload;
  return {
    ...payload,
    source: endpoint.source,
  };
}

function readExtensionId(): string {
  return globalThis.chrome?.runtime?.id ?? "";
}

function postT3ComposerIntakeRequest(
  payload: T3ComposerIntakePayload,
  responseType: typeof T3_COMPOSER_INTAKE_RESPONSE_TYPE,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve({
        type: responseType,
        requestId: payload.requestId,
        ok: false,
        reason: "t3-response-timeout",
      });
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    };

    const handleMessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (
        event.source !== window ||
        !data ||
        typeof data !== "object" ||
        (data as { type?: unknown }).type !== responseType ||
        (data as { requestId?: unknown }).requestId !== payload.requestId
      ) {
        return;
      }
      cleanup();
      resolve(data);
    };

    window.addEventListener("message", handleMessage);
    window.postMessage(payload, window.location.origin);
  });
}

function sortCandidateTabs(tabs: T3ComposerDeliveryTab[]): T3ComposerDeliveryTab[] {
  return tabs
    .filter((tab) => typeof tab.id === "number")
    .toSorted((left, right) => tabScore(left) - tabScore(right));
}

function tabScore(tab: T3ComposerDeliveryTab): number {
  const url = tab.url ?? tab.pendingUrl ?? "";
  const title = tab.title ?? "";
  if (url.startsWith(DEFAULT_T3_ORIGIN)) return 0;
  if (/t3\s*code/i.test(title) || /t3code/i.test(url)) return 1;
  if (tab.active) return 8;
  return 10;
}

function waitForTabReady(
  chromeApi: T3ComposerDeliveryChrome,
  tabId: number | undefined,
  timeoutMs: number,
): Promise<void> {
  if (typeof tabId !== "number") return Promise.resolve();

  return chromeApi.tabs.get(tabId).then((tab) => {
    if (tab.status === "complete") return;

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve();
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        chromeApi.tabs.onUpdated.removeListener(handleUpdated);
      };

      const handleUpdated: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (
        updatedTabId,
        changeInfo,
      ) => {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        cleanup();
        resolve();
      };

      chromeApi.tabs.onUpdated.addListener(handleUpdated);
    });
  });
}

function isT3ComposerBridgeResponse(
  value: unknown,
  requestId: string,
): value is T3ComposerBridgeResponse {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === T3_COMPOSER_INTAKE_RESPONSE_TYPE &&
    (value as { requestId?: unknown }).requestId === requestId &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  );
}

function responseToMessage(value: unknown): string {
  if (value && typeof value === "object" && "reason" in value && typeof value.reason === "string") {
    return value.reason;
  }
  return "No T3 Composer bridge response was received.";
}

function basenameFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1);
}

function createRequestId(savedImage: SavedImage): string {
  const randomSuffix = crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(16).slice(2);
  return `annotations-${savedImage.downloadId}-${randomSuffix}`;
}

function readChromeApi(): T3ComposerDeliveryChrome {
  return chrome as unknown as T3ComposerDeliveryChrome;
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

function tabLogDetails(tab: T3ComposerDeliveryTab): Record<string, unknown> {
  return {
    id: tab.id ?? null,
    active: tab.active ?? null,
    status: tab.status ?? null,
    title: tab.title ?? null,
    url: tab.url ?? tab.pendingUrl ?? null,
    windowId: tab.windowId ?? null,
  };
}

function deliveryLogDetails(result: T3ComposerDeliveryResult): Record<string, unknown> {
  if (result.ok) {
    return {
      ok: true,
      mode: result.mode ?? null,
      tabId: result.tabId,
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
