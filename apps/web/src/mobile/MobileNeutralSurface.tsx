import {
  Clipboard,
  Globe2,
  Link,
  LoaderCircle,
  PlugZap,
  QrCode,
  RefreshCw,
  Trash2,
  Unplug,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import {
  bootstrapRemoteBearerSession,
  fetchRemoteEnvironmentDescriptor,
} from "../environments/remote/api";
import { activateMobileProfile, closeActiveMobileProfile, useMobileRuntimeStore } from "./runtime";
import { parseMobilePairingDeepLink } from "./deepLink";
import { getMobilePlatformLabel } from "./platform";
import {
  createMobileProfileId,
  useMobileProfileStore,
  type MobileConnectionProfile,
} from "./profileStorage";
import {
  inferMobileConnectionModeFromPairingInput,
  resolveMobilePairingTarget,
  shouldRequireExplicitMobileHost,
  type MobileConnectionMode,
} from "./pairingTarget";

type BusyAction = "pair" | "connect" | "close" | "scan" | "remove" | null;
type PairingPanel = "code" | "paste" | null;
type NeutralView = "connections" | "pair";

const PENDING_NATIVE_DEEP_LINK_STORAGE_KEY = "t3code:pending-mobile-deep-link:v1";

function modeLabel(mode: MobileConnectionMode): string {
  return mode === "tailscale" ? "Tailscale" : "LAN";
}

function defaultProfileLabel(input: {
  readonly backendLabel: string;
  readonly mode: MobileConnectionMode;
}): string {
  return `${input.backendLabel} (${modeLabel(input.mode)})`;
}

function isPairingUrl(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.includes("://") || trimmed.startsWith("/");
}

function requiresTailscaleHost(input: { readonly mode: MobileConnectionMode }): boolean {
  return input.mode === "tailscale";
}

function PairingModeSelector(props: {
  readonly mode: MobileConnectionMode;
  readonly busy: boolean;
  readonly onModeChange: (mode: MobileConnectionMode) => void;
}) {
  return (
    <div className="relative grid grid-cols-2 gap-2 overflow-hidden rounded-full bg-muted p-1">
      <span
        aria-hidden="true"
        className={`absolute bottom-1 top-1 w-[calc(50%-0.375rem)] rounded-full bg-primary shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none ${
          props.mode === "lan" ? "translate-x-[calc(100%+0.5rem)]" : "translate-x-0"
        } left-1`}
      />
      {(["tailscale", "lan"] as const).map((entry) => (
        <button
          key={entry}
          type="button"
          className={`relative z-10 h-8 rounded-full px-3 text-sm font-medium transition-colors duration-200 motion-reduce:transition-none ${
            props.mode === entry ? "text-primary-foreground" : "text-muted-foreground"
          }`}
          onClick={() => props.onModeChange(entry)}
          disabled={props.busy}
        >
          {modeLabel(entry)}
        </button>
      ))}
    </div>
  );
}

function PairingFieldGroup(props: {
  readonly label: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-2">
      <div className="flex min-w-0 items-end justify-between gap-3 px-1">
        <div className="min-w-0 text-left">
          <p className="text-xs font-medium text-foreground">{props.label}</p>
          {props.description ? (
            <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{props.description}</p>
          ) : null}
        </div>
        {props.action ? <div className="shrink-0">{props.action}</div> : null}
      </div>
      {props.children}
    </section>
  );
}

async function scanQrCode(): Promise<string> {
  const module = (await import("@capacitor/barcode-scanner")) as unknown as {
    CapacitorBarcodeScanner?: {
      scanBarcode: (options: Record<string, unknown>) => Promise<{ ScanResult?: string }>;
    };
    CapacitorBarcodeScannerTypeHint?: Record<string, unknown>;
  };
  const scanner = module.CapacitorBarcodeScanner;
  if (!scanner) {
    throw new Error("QR scanning is not available in this environment.");
  }
  const result = await scanner.scanBarcode({
    hint: module.CapacitorBarcodeScannerTypeHint?.QR_CODE ?? 17,
    scanInstructions: "Point your camera at the T3 Code pairing QR.",
    scanButton: false,
  });
  return result.ScanResult ?? "";
}

async function readClipboardText(): Promise<string> {
  try {
    const module = (await import("@capacitor/clipboard")) as unknown as {
      Clipboard?: {
        read: () => Promise<{ value?: string }>;
      };
    };
    const value = await module.Clipboard?.read();
    if (value?.value) {
      return value.value;
    }
  } catch {
    // Web fallback below.
  }
  return (await navigator.clipboard?.readText?.()) ?? "";
}

async function takePendingNativeDeepLink(): Promise<string | null> {
  try {
    const module = (await import("@capacitor/preferences")) as unknown as {
      Preferences?: {
        get: (options: { key: string }) => Promise<{ value: string | null }>;
        remove: (options: { key: string }) => Promise<void>;
      };
    };
    const preferences = module.Preferences;
    if (!preferences) {
      return null;
    }

    const result = await preferences.get({ key: PENDING_NATIVE_DEEP_LINK_STORAGE_KEY });
    const value = result.value?.trim() ?? "";
    if (value) {
      await preferences.remove({ key: PENDING_NATIVE_DEEP_LINK_STORAGE_KEY });
      return value;
    }
  } catch {
    // Non-Capacitor previews do not expose native preferences.
  }

  return null;
}

export function MobileNeutralSurface() {
  const profileStore = useMobileProfileStore();
  const runtime = useMobileRuntimeStore();
  const [mode, setMode] = useState<MobileConnectionMode>("tailscale");
  const [pairingInput, setPairingInput] = useState("");
  const [host, setHost] = useState("");
  const [label, setLabel] = useState("");
  const [pairingPanel, setPairingPanel] = useState<PairingPanel>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [neutralView, setNeutralView] = useState<NeutralView>("connections");
  const [profileToRemove, setProfileToRemove] = useState<MobileConnectionProfile | null>(null);
  const handledDeepLinksRef = useRef<Set<string>>(new Set());
  const pendingDeepLinksRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    void profileStore.hydrate();
  }, [profileStore]);

  useEffect(() => {
    const root = document.getElementById("root");
    const previous = {
      bodyHeight: document.body.style.height,
      bodyOverflow: document.body.style.overflow,
      bodyOverflowY: document.body.style.overflowY,
      htmlOverflowY: document.documentElement.style.overflowY,
      rootHeight: root?.style.height ?? "",
      rootMinHeight: root?.style.minHeight ?? "",
      rootOverflowY: root?.style.overflowY ?? "",
    };

    document.documentElement.style.overflowY = "auto";
    document.body.style.height = "auto";
    document.body.style.overflow = "auto";
    document.body.style.overflowY = "auto";
    if (root) {
      root.style.height = "auto";
      root.style.minHeight = "100%";
      root.style.overflowY = "visible";
    }

    return () => {
      document.documentElement.style.overflowY = previous.htmlOverflowY;
      document.body.style.height = previous.bodyHeight;
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.overflowY = previous.bodyOverflowY;
      if (root) {
        root.style.height = previous.rootHeight;
        root.style.minHeight = previous.rootMinHeight;
        root.style.overflowY = previous.rootOverflowY;
      }
    };
  }, []);

  const savedProfiles = profileStore.profiles;

  useEffect(() => {
    if (!profileStore.hydrated) {
      return;
    }
    if (savedProfiles.length === 0) {
      setNeutralView("pair");
    }
  }, [profileStore.hydrated, savedProfiles.length]);

  const pairWithInput = useCallback(
    async function pairWithInput(input: {
      readonly pairingInput: string;
      readonly host: string;
      readonly mode: MobileConnectionMode;
    }) {
      setBusyAction("pair");
      setErrorMessage(null);
      try {
        const pairingInputValue = input.pairingInput.trim();
        const hostValue = input.host.trim();
        if (input.mode === "lan" && !isPairingUrl(pairingInputValue)) {
          throw new Error("For LAN, paste the full pairing link.");
        }
        if (shouldRequireExplicitMobileHost({ ...input, pairingInput: pairingInputValue })) {
          throw new Error("Enter the desktop's 100.x IP or .ts.net address.");
        }

        const target = resolveMobilePairingTarget({
          pairingUrlOrToken: pairingInputValue,
          host: input.mode === "lan" ? "" : hostValue,
        });
        const descriptor = await fetchRemoteEnvironmentDescriptor({
          httpBaseUrl: target.httpBaseUrl,
        });
        const bearerSession = await bootstrapRemoteBearerSession({
          httpBaseUrl: target.httpBaseUrl,
          credential: target.credential,
        });
        const profile: MobileConnectionProfile = {
          profileId: createMobileProfileId(input.mode),
          environmentId: descriptor.environmentId,
          label:
            label.trim() ||
            defaultProfileLabel({ backendLabel: descriptor.label, mode: input.mode }),
          mode: input.mode,
          httpBaseUrl: target.httpBaseUrl,
          wsBaseUrl: target.wsBaseUrl,
          bearerToken: bearerSession.sessionToken,
          sessionExpiresAt: String(bearerSession.expiresAt),
          createdAt: new Date().toISOString(),
          lastConnectedAt: null,
        };
        await profileStore.upsert(profile);
        setPairingInput("");
        setLabel("");
        setHost(target.httpBaseUrl);
        await activateMobileProfile(profile.profileId);
        setPairingPanel(null);
        setNeutralView("connections");
        return true;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setBusyAction(null);
      }
    },
    [label, profileStore],
  );

  const handleIncomingPairingDeepLink = useCallback(
    async (url: string) => {
      if (handledDeepLinksRef.current.has(url) || pendingDeepLinksRef.current.has(url)) {
        return;
      }

      const parsed = parseMobilePairingDeepLink(url);
      if (!parsed) {
        return;
      }

      pendingDeepLinksRef.current.add(url);
      setNeutralView("pair");
      setPairingPanel("code");
      setPairingInput(parsed.pairingInput);
      setHost(parsed.host);
      setMode(parsed.mode);
      try {
        const paired = await pairWithInput({
          pairingInput: parsed.pairingInput,
          host: parsed.host,
          mode: parsed.mode,
        });
        if (paired) {
          handledDeepLinksRef.current.add(url);
        }
      } finally {
        pendingDeepLinksRef.current.delete(url);
      }
    },
    [pairWithInput],
  );

  useEffect(() => {
    let disposed = false;
    let pendingPoll: number | null = null;
    let pendingPollStop: number | null = null;
    const listeners: Array<{ remove: () => Promise<void> }> = [];

    function stopPendingPoll() {
      if (pendingPoll !== null) {
        window.clearInterval(pendingPoll);
        pendingPoll = null;
      }
      if (pendingPollStop !== null) {
        window.clearTimeout(pendingPollStop);
        pendingPollStop = null;
      }
    }

    async function takeAndHandlePendingNativeDeepLink() {
      const pendingUrl = await takePendingNativeDeepLink();
      if (!disposed && pendingUrl) {
        void handleIncomingPairingDeepLink(pendingUrl);
      }
    }

    async function registerAppUrlHandlers() {
      try {
        const module = (await import("@capacitor/app")) as {
          App?: {
            addListener: (
              eventName: "appUrlOpen" | "resume",
              listenerFunc: (event: unknown) => void,
            ) => Promise<{ remove: () => Promise<void> }>;
            getLaunchUrl: () => Promise<{ url?: string }>;
          };
        };
        const app = module.App;
        if (!app || disposed) {
          return;
        }

        void takeAndHandlePendingNativeDeepLink();

        const launch = await app.getLaunchUrl();
        if (!disposed && launch.url) {
          void handleIncomingPairingDeepLink(launch.url);
        }

        listeners.push(
          await app.addListener("appUrlOpen", (event) => {
            const url =
              typeof event === "object" &&
              event !== null &&
              "url" in event &&
              typeof event.url === "string"
                ? event.url
                : "";
            if (!disposed) {
              if (url) {
                void handleIncomingPairingDeepLink(url);
              }
              void takeAndHandlePendingNativeDeepLink();
            }
          }),
        );
        listeners.push(
          await app.addListener("resume", () => {
            if (!disposed) {
              void takeAndHandlePendingNativeDeepLink();
            }
          }),
        );

        pendingPoll = window.setInterval(() => {
          void takeAndHandlePendingNativeDeepLink();
        }, 500);
        pendingPollStop = window.setTimeout(stopPendingPoll, 5000);
      } catch {
        void takeAndHandlePendingNativeDeepLink();
      }
    }

    void registerAppUrlHandlers();
    return () => {
      disposed = true;
      stopPendingPoll();
      for (const listener of listeners) {
        void listener.remove();
      }
    };
  }, [handleIncomingPairingDeepLink]);

  async function handlePair() {
    await pairWithInput({ pairingInput, host, mode });
  }

  function closePairingPanel(open: boolean) {
    if (open) {
      return;
    }
    setPairingPanel(null);
  }

  async function handleScan() {
    setBusyAction("scan");
    setErrorMessage(null);
    try {
      const scanned = await scanQrCode();
      const trimmed = scanned.trim();
      if (!trimmed) {
        return;
      }

      setPairingInput(trimmed);
      if (isPairingUrl(trimmed)) {
        setMode(inferMobileConnectionModeFromPairingInput(trimmed) ?? mode);
        setHost("");
        setLabel("");
        setPairingPanel("paste");
        return;
      }

      setPairingPanel("code");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  function applyPairingInput(value: string) {
    setPairingInput(value);
  }

  async function handlePastePairingLink() {
    setErrorMessage(null);
    try {
      const clipboardText = await readClipboardText();
      const trimmed = clipboardText?.trim() ?? "";
      if (trimmed) {
        applyPairingInput(trimmed);
      } else {
        setErrorMessage("Your clipboard is empty.");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not read from the clipboard.",
      );
    }
  }

  async function handleConnect(profileId: string) {
    setBusyAction("connect");
    setErrorMessage(null);
    try {
      await activateMobileProfile(profileId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClose() {
    setBusyAction("close");
    setErrorMessage(null);
    try {
      await closeActiveMobileProfile();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemoveProfile() {
    if (!profileToRemove) {
      return;
    }

    setBusyAction("remove");
    setErrorMessage(null);
    try {
      if (runtime.activeProfileId === profileToRemove.profileId) {
        await closeActiveMobileProfile();
      }
      await profileStore.remove(profileToRemove.profileId);
      setProfileToRemove(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  const busy = busyAction !== null;
  const pairingInputIsUrl = pairingInput.trim() ? isPairingUrl(pairingInput) : false;
  const mustFillTailscaleHost = requiresTailscaleHost({ mode });
  const showTailscaleHost = mode === "tailscale";
  const hasSavedProfiles = savedProfiles.length > 0;
  const showingConnections = neutralView === "connections" && hasSavedProfiles;
  const currentStatus =
    busyAction === "scan"
      ? "Opening scanner"
      : busyAction === "pair"
        ? "Pairing"
        : busyAction === "connect"
          ? "Connecting"
          : busyAction === "remove"
            ? "Removing connection"
            : showingConnections
              ? "Saved connections"
              : "Ready to pair";
  const inputLabel = pairingPanel === "code" ? "Pair with code" : "New connection";
  const heroTitle = busy
    ? "Connecting..."
    : showingConnections
      ? "Choose a connection"
      : hasSavedProfiles
        ? "Add a connection"
        : "Connect this phone";
  const heroDescription = showingConnections
    ? "Use LAN on the same network, or Tailscale when you are away."
    : hasSavedProfiles
      ? "Scan another QR code or enter a pairing code to save another connection."
      : "Scan the desktop QR code or enter a pairing code to open your projects here.";

  return (
    <main className="min-h-dvh overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background text-foreground">
      <div className="mx-auto box-border flex min-h-full w-full max-w-md flex-col overflow-x-hidden px-5 pt-5 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+2rem))]">
        <header className="flex items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">Pairing</h1>
            <p className="truncate text-sm text-muted-foreground">
              T3 Code mobile on {getMobilePlatformLabel()}
            </p>
          </div>
          {runtime.activeProfileId ? (
            <Button
              className="ml-auto"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={busy}
            >
              <Unplug />
              Close
            </Button>
          ) : null}
        </header>

        <section className="flex flex-1 flex-col items-center justify-start gap-4 pb-7 pt-6 text-center">
          <img
            src="/t3-app-icon.png"
            alt="T3 Code"
            className="size-24 rounded-[1.5rem] shadow-2xl shadow-black/35"
          />

          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
            {busy ? (
              <LoaderCircle className="size-4 animate-spin text-primary" />
            ) : (
              <span className="size-2 rounded-full bg-emerald-400" />
            )}
            <span>{currentStatus}</span>
          </div>

          <div>
            <h2 className="text-3xl font-semibold tracking-tight">{heroTitle}</h2>
            <p className="mx-auto mt-2 max-w-xs text-base leading-relaxed text-muted-foreground">
              {heroDescription}
            </p>
          </div>

          {showingConnections ? (
            <section className="grid w-full max-w-full min-w-0 gap-3 text-left">
              {savedProfiles.map((profile) => {
                const isActive = runtime.activeProfileId === profile.profileId;
                const isConnecting =
                  busyAction === "connect" && isActive && runtime.status === "connecting";
                return (
                  <div
                    key={profile.profileId}
                    className={`grid w-full max-w-full min-w-0 gap-3 overflow-hidden rounded-2xl border bg-card p-4 shadow-sm ${
                      isActive ? "border-primary/50" : "border-border"
                    }`}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                        {profile.mode === "tailscale" ? (
                          <Globe2 className="size-5" />
                        ) : (
                          <Link className="size-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="min-w-0 truncate text-sm font-semibold">{profile.label}</p>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {modeLabel(profile.mode)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {profile.httpBaseUrl}
                        </p>
                      </div>
                    </div>
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] gap-2">
                      <Button
                        className="h-11 min-w-0 rounded-full"
                        onClick={() => handleConnect(profile.profileId)}
                        disabled={busy || (runtime.activeProfileId !== null && !isActive)}
                      >
                        {busyAction === "connect" && !isActive ? (
                          <RefreshCw className="animate-spin" />
                        ) : isConnecting ? (
                          <RefreshCw className="animate-spin" />
                        ) : (
                          <PlugZap />
                        )}
                        {isConnecting ? "Connecting" : isActive ? "Connected" : "Connect"}
                      </Button>
                      <Button
                        className="h-11 w-11 rounded-full text-destructive hover:text-destructive"
                        variant="outline"
                        aria-label={`Forget connection ${profile.label}`}
                        onClick={() => setProfileToRemove(profile)}
                        disabled={busy}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <Button
                className="h-11 rounded-full"
                variant="outline"
                onClick={() => setNeutralView("pair")}
                disabled={busy}
              >
                <QrCode className="size-4" />
                Add new connection
              </Button>
            </section>
          ) : (
            <div className="grid w-full gap-4">
              <button
                type="button"
                className="group mx-auto grid aspect-square w-full max-w-56 place-items-center rounded-[2rem] border border-border bg-card/70 p-7 text-muted-foreground shadow-sm transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-60"
                onClick={handleScan}
                disabled={busy}
                aria-label="Scan QR code"
              >
                <div className="grid size-full place-items-center rounded-2xl border border-border/80 bg-background/45 transition-colors group-hover:border-primary/50">
                  <QrCode className="size-16" />
                </div>
              </button>

              <div className="grid w-full gap-2 pb-4">
                <Button
                  className="h-14 rounded-full text-base"
                  onClick={handleScan}
                  disabled={busy}
                >
                  <QrCode className="size-5" />
                  Scan QR code
                </Button>
                <Button
                  className="h-14 rounded-full text-base"
                  variant="outline"
                  onClick={() => {
                    setPairingPanel("code");
                    setErrorMessage(null);
                  }}
                  disabled={busy}
                >
                  <PlugZap className="size-5" />
                  Pair with code
                </Button>
                {hasSavedProfiles ? (
                  <Button
                    className="h-11 rounded-full text-sm"
                    variant="ghost"
                    onClick={() => setNeutralView("connections")}
                    disabled={busy}
                  >
                    <Link className="size-4" />
                    View saved connections
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </section>

        <Dialog open={pairingPanel !== null} onOpenChange={closePairingPanel}>
          <DialogPopup className="w-[calc(100vw-2rem)] max-w-md overflow-hidden data-ending-style:translate-y-8 data-starting-style:translate-y-10 max-sm:min-h-[72dvh] max-sm:w-full max-sm:data-ending-style:translate-y-full max-sm:data-starting-style:translate-y-full">
            <DialogHeader>
              <DialogTitle>{inputLabel}</DialogTitle>
              <DialogDescription>
                {pairingPanel === "code"
                  ? "For LAN, paste the full link. For Tailscale, add its address below."
                  : "Name this connection and choose how it should connect."}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-6 py-1 pb-4">
              <form
                className="grid min-w-0 gap-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handlePair();
                }}
              >
                <PairingFieldGroup
                  label="Name"
                  description="Helps you recognize this connection later."
                >
                  <Input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Optional connection name"
                    disabled={busy}
                  />
                </PairingFieldGroup>

                <div className="grid gap-3">
                  <PairingFieldGroup
                    label="Connection type"
                    description="LAN uses the local link. Tailscale needs its own address."
                  >
                    <PairingModeSelector mode={mode} busy={busy} onModeChange={setMode} />
                  </PairingFieldGroup>
                </div>

                {pairingPanel === "code" ? (
                  <PairingFieldGroup
                    label={mode === "lan" ? "Local link" : "Token or link"}
                    description={
                      mode === "lan"
                        ? "Paste the full link from the desktop."
                        : "The link provides the token. Add the Tailscale address below."
                    }
                    action={
                      <Button
                        type="button"
                        className="h-8 rounded-full px-2.5 text-xs text-muted-foreground"
                        variant="ghost"
                        onClick={handlePastePairingLink}
                        disabled={busy}
                      >
                        <Clipboard className="size-3.5" />
                        Paste link
                      </Button>
                    }
                  >
                    <Input
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      value={pairingInput}
                      onChange={(event) => applyPairingInput(event.target.value)}
                      placeholder={mode === "lan" ? "Full pairing link" : "Link or code"}
                      disabled={busy}
                      className="h-13 text-center font-mono text-base"
                    />
                  </PairingFieldGroup>
                ) : null}

                {pairingPanel === "code" ? (
                  <>
                    {showTailscaleHost ? (
                      <PairingFieldGroup
                        label="Tailscale address"
                        description="Enter a 100.x IP or .ts.net name. We'll reuse the port from the pasted link."
                      >
                        <Input
                          value={host}
                          onChange={(event) => setHost(event.target.value)}
                          placeholder="100.x.y.z or macbook.ts.net"
                          disabled={busy}
                          inputMode="url"
                        />
                      </PairingFieldGroup>
                    ) : null}
                  </>
                ) : showTailscaleHost ? (
                  <PairingFieldGroup
                    label="Tailscale address"
                    description="Enter a 100.x IP or .ts.net name. We'll reuse the port from the pasted link."
                  >
                    <Input
                      value={host}
                      onChange={(event) => setHost(event.target.value)}
                      placeholder="100.x.y.z or macbook.ts.net"
                      disabled={busy}
                      inputMode="url"
                    />
                  </PairingFieldGroup>
                ) : null}

                {errorMessage ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-left text-sm leading-5 text-destructive">
                    {errorMessage}
                  </div>
                ) : null}
              </form>
            </div>

            <DialogFooter>
              <Button
                className="h-11 rounded-full"
                variant="outline"
                onClick={() => closePairingPanel(false)}
                disabled={busyAction === "pair"}
              >
                Cancel
              </Button>
              <Button
                className="h-11 rounded-full"
                onClick={handlePair}
                disabled={
                  busy ||
                  (pairingPanel === "code" && !pairingInput.trim()) ||
                  (pairingPanel === "code" && mode === "lan" && !pairingInputIsUrl) ||
                  (mustFillTailscaleHost && !host.trim())
                }
              >
                {busyAction === "pair" ? <LoaderCircle className="animate-spin" /> : <PlugZap />}
                Pair now
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>

        <Dialog
          open={profileToRemove !== null}
          onOpenChange={(open) => {
            if (!open && busyAction !== "remove") {
              setProfileToRemove(null);
            }
          }}
        >
          <DialogPopup className="max-w-md data-ending-style:translate-y-8 data-starting-style:translate-y-10 max-sm:data-ending-style:translate-y-full max-sm:data-starting-style:translate-y-full">
            <DialogHeader>
              <DialogTitle>Forget this connection?</DialogTitle>
              <DialogDescription>
                This removes it from this phone. To use it again, pair with a QR code or pairing
                code.
              </DialogDescription>
            </DialogHeader>

            {profileToRemove ? (
              <DialogPanel>
                <div className="min-w-0 rounded-2xl border border-border bg-card p-3">
                  <p className="truncate text-sm font-medium">{profileToRemove.label}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {profileToRemove.httpBaseUrl}
                  </p>
                </div>
              </DialogPanel>
            ) : null}

            <DialogFooter>
              <Button
                className="h-11 rounded-full"
                variant="outline"
                onClick={() => setProfileToRemove(null)}
                disabled={busyAction === "remove"}
              >
                Cancel
              </Button>
              <Button
                className="h-11 rounded-full"
                variant="destructive"
                onClick={handleRemoveProfile}
                disabled={busyAction === "remove"}
              >
                {busyAction === "remove" ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                Forget connection
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>

        {(errorMessage ?? runtime.errorMessage) ? (
          <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive">
            {errorMessage ?? runtime.errorMessage}
          </div>
        ) : null}
      </div>
    </main>
  );
}
