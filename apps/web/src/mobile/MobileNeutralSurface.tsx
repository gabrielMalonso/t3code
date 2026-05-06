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
import { useEffect, useState } from "react";

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
import { getMobilePlatformLabel } from "./platform";
import {
  createMobileProfileId,
  useMobileProfileStore,
  type MobileConnectionProfile,
} from "./profileStorage";
import {
  inferMobileConnectionModeFromPairingInput,
  resolveMobilePairingTarget,
  type MobileConnectionMode,
} from "./pairingTarget";

type BusyAction = "pair" | "connect" | "close" | "scan" | "remove" | null;
type PairingPanel = "code" | "paste" | null;
type NeutralView = "connections" | "pair";

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

async function scanQrCode(): Promise<string> {
  const module = (await import("@capacitor/barcode-scanner")) as unknown as {
    CapacitorBarcodeScanner?: {
      scanBarcode: (options: Record<string, unknown>) => Promise<{ ScanResult?: string }>;
    };
    CapacitorBarcodeScannerTypeHint?: Record<string, unknown>;
  };
  const scanner = module.CapacitorBarcodeScanner;
  if (!scanner) {
    throw new Error("Scanner QR indisponivel neste ambiente.");
  }
  const result = await scanner.scanBarcode({
    hint: module.CapacitorBarcodeScannerTypeHint?.QR_CODE ?? 17,
    scanInstructions: "Aponte para o QR de pareamento do T3 Code.",
    scanButton: false,
  });
  return result.ScanResult ?? "";
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
        throw new Error("Para LAN, cole o link completo de pareamento.");
      }
      if (
        requiresTailscaleHost({
          mode: input.mode,
        }) &&
        !hostValue
      ) {
        throw new Error("Informe o IP 100.x ou endereco .ts.net do desktop no Tailscale.");
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
          label.trim() || defaultProfileLabel({ backendLabel: descriptor.label, mode: input.mode }),
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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

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
    const inferredMode = inferMobileConnectionModeFromPairingInput(value);
    if (inferredMode) {
      setMode(inferredMode);
      setHost("");
    }
  }

  async function handlePastePairingLink() {
    setErrorMessage(null);
    try {
      const clipboardText = await navigator.clipboard?.readText?.();
      const trimmed = clipboardText?.trim() ?? "";
      if (trimmed) {
        applyPairingInput(trimmed);
      }
    } catch {
      // Clipboard permissions vary in WebViews. Keeping the input open is the useful fallback.
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
      ? "Abrindo scanner"
      : busyAction === "pair"
        ? "Pareando"
        : busyAction === "connect"
          ? "Conectando"
          : busyAction === "remove"
            ? "Removendo conexao"
            : showingConnections
              ? "Conexoes salvas"
              : "Pronto para parear";
  const inputLabel = pairingPanel === "code" ? "Codigo de pareamento" : "Nova conexao";
  const heroTitle = busy
    ? "Conectando..."
    : showingConnections
      ? "Escolha uma conexao"
      : hasSavedProfiles
        ? "Adicionar conexao"
        : "Conecte este celular";
  const heroDescription = showingConnections
    ? "Use LAN quando estiver na mesma rede, ou Tailscale quando estiver fora dela."
    : hasSavedProfiles
      ? "Escaneie outro QR ou use um codigo para salvar mais uma rota de acesso neste celular."
      : "Escaneie o QR do desktop ou use o codigo de pareamento para abrir seus projetos aqui.";

  return (
    <main className="h-dvh overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background text-foreground">
      <div className="mx-auto box-border flex min-h-dvh w-full max-w-md flex-col overflow-x-hidden px-5 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+2rem))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">Pareamento</h1>
            <p className="truncate text-sm text-muted-foreground">
              T3 Code mobile em {getMobilePlatformLabel()}
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
              Fechar
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
                        {isConnecting ? "Conectando" : isActive ? "Conectado" : "Conectar"}
                      </Button>
                      <Button
                        className="h-11 w-11 rounded-full text-destructive hover:text-destructive"
                        variant="outline"
                        aria-label={`Esquecer conexao ${profile.label}`}
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
                Adicionar nova conexao
              </Button>
            </section>
          ) : (
            <div className="grid w-full gap-4">
              <button
                type="button"
                className="group mx-auto grid aspect-square w-full max-w-56 place-items-center rounded-[2rem] border border-border bg-card/70 p-7 text-muted-foreground shadow-sm transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-60"
                onClick={handleScan}
                disabled={busy}
                aria-label="Escanear QR Code"
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
                  Escanear QR Code
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
                  Parear com codigo
                </Button>
                {hasSavedProfiles ? (
                  <Button
                    className="h-11 rounded-full text-sm"
                    variant="ghost"
                    onClick={() => setNeutralView("connections")}
                    disabled={busy}
                  >
                    <Link className="size-4" />
                    Ver conexoes salvas
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
                  ? "Na LAN, cole o link completo. No Tailscale, cole o link ou codigo e informe o endereco Tailscale."
                  : "Escolha como voce quer reconhecer esta conexao no celular."}
              </DialogDescription>
            </DialogHeader>

            <DialogPanel className="min-w-0 overflow-hidden">
              <form
                className="grid min-w-0 gap-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handlePair();
                }}
              >
                <Input
                  autoFocus
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Nome opcional da conexao"
                  disabled={busy}
                />

                <PairingModeSelector mode={mode} busy={busy} onModeChange={setMode} />

                {pairingPanel === "code" ? (
                  <div className="grid gap-2">
                    <Input
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      value={pairingInput}
                      onChange={(event) => applyPairingInput(event.target.value)}
                      placeholder={
                        mode === "lan" ? "Link completo de pareamento" : "Link ou codigo"
                      }
                      disabled={busy}
                      className="h-13 text-center font-mono text-base"
                    />
                    <Button
                      type="button"
                      className="h-9 justify-start rounded-full px-3 text-xs text-muted-foreground"
                      variant="ghost"
                      onClick={handlePastePairingLink}
                      disabled={busy}
                    >
                      <Clipboard className="size-3.5" />
                      Colar link completo
                    </Button>
                    <p className="px-1 text-xs leading-5 text-muted-foreground">
                      {mode === "lan"
                        ? "Na LAN, use o link completo copiado no desktop."
                        : "O link fornece o token; o endereco Tailscale fica no campo abaixo."}
                    </p>
                  </div>
                ) : null}

                {pairingPanel === "code" ? (
                  <div className="grid gap-3">
                    {showTailscaleHost ? (
                      <>
                        <Input
                          value={host}
                          onChange={(event) => setHost(event.target.value)}
                          placeholder="100.x.y.z:3774 ou macbook.ts.net:3774"
                          disabled={busy}
                          inputMode="url"
                        />
                        <p className="px-1 text-xs leading-5 text-muted-foreground">
                          Obrigatorio quando voce quer salvar esta conexao como Tailscale.
                        </p>
                      </>
                    ) : null}
                  </div>
                ) : showTailscaleHost ? (
                  <div className="grid gap-2">
                    <Input
                      value={host}
                      onChange={(event) => setHost(event.target.value)}
                      placeholder="100.x.y.z:3774 ou macbook.ts.net:3774"
                      disabled={busy}
                      inputMode="url"
                    />
                    <p className="px-1 text-xs leading-5 text-muted-foreground">
                      Informe o endereco Tailscale que este celular deve usar.
                    </p>
                  </div>
                ) : null}
              </form>
            </DialogPanel>

            <DialogFooter>
              <Button
                className="h-11 rounded-full"
                variant="outline"
                onClick={() => closePairingPanel(false)}
                disabled={busyAction === "pair"}
              >
                Cancelar
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
                Parear agora
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
              <DialogTitle>Esquecer conexao?</DialogTitle>
              <DialogDescription>
                Esta conexao sera removida deste celular. Para usar de novo, sera preciso parear
                novamente pelo QR ou codigo.
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
                Cancelar
              </Button>
              <Button
                className="h-11 rounded-full"
                variant="destructive"
                onClick={handleRemoveProfile}
                disabled={busyAction === "remove"}
              >
                {busyAction === "remove" ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                Esquecer conexao
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
