import {
  ChevronDown,
  Clipboard,
  Link,
  LoaderCircle,
  PlugZap,
  QrCode,
  RefreshCw,
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
import { Textarea } from "../components/ui/textarea";
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
import { resolveMobilePairingTarget, type MobileConnectionMode } from "./pairingTarget";

type BusyAction = "pair" | "connect" | "close" | "scan" | null;
type PairingPanel = "code" | "paste" | null;

function modeLabel(mode: MobileConnectionMode): string {
  return mode === "tailscale" ? "Tailscale" : "LAN";
}

function defaultProfileLabel(input: {
  readonly backendLabel: string;
  readonly mode: MobileConnectionMode;
}): string {
  return `${input.backendLabel} (${modeLabel(input.mode)})`;
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void profileStore.hydrate();
  }, [profileStore]);

  async function handlePair() {
    setBusyAction("pair");
    setErrorMessage(null);
    try {
      const target = resolveMobilePairingTarget({
        pairingUrlOrToken: pairingInput,
        host,
      });
      const descriptor = await fetchRemoteEnvironmentDescriptor({
        httpBaseUrl: target.httpBaseUrl,
      });
      const bearerSession = await bootstrapRemoteBearerSession({
        httpBaseUrl: target.httpBaseUrl,
        credential: target.credential,
      });
      const profile: MobileConnectionProfile = {
        profileId: createMobileProfileId(mode),
        environmentId: descriptor.environmentId,
        label: label.trim() || defaultProfileLabel({ backendLabel: descriptor.label, mode }),
        mode,
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
      setAdvancedOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  function closePairingPanel(open: boolean) {
    if (open) {
      return;
    }
    setPairingPanel(null);
    setAdvancedOpen(false);
  }

  async function handleScan() {
    setBusyAction("scan");
    setErrorMessage(null);
    try {
      const scanned = await scanQrCode();
      if (scanned) {
        setPairingInput(scanned);
        const resolved = resolveMobilePairingTarget({
          pairingUrlOrToken: scanned,
          host,
        });
        setHost((current) => current || resolved.suggestedHttpBaseUrl || "");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePastePairingInput() {
    setPairingPanel("paste");
    setErrorMessage(null);
    try {
      const clipboardText = await navigator.clipboard?.readText?.();
      if (clipboardText?.trim()) {
        setPairingInput(clipboardText.trim());
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

  const busy = busyAction !== null;
  const savedProfiles = profileStore.profiles;
  const currentStatus =
    busyAction === "scan"
      ? "Abrindo scanner"
      : busyAction === "pair"
        ? "Pareando"
        : busyAction === "connect"
          ? "Conectando"
          : "Pronto para parear";
  const inputLabel = pairingPanel === "code" ? "Codigo de pareamento" : "URL/token de pareamento";
  const inputPlaceholder =
    pairingPanel === "code" ? "Cole o codigo mostrado no desktop" : "Cole a URL ou token do QR";

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+2rem))] pt-[max(1.25rem,env(safe-area-inset-top))]">
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
            <h2 className="text-3xl font-semibold tracking-tight">
              {busy ? "Conectando..." : "Conecte este celular"}
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-base leading-relaxed text-muted-foreground">
              Escaneie o QR do desktop ou cole a URL de pareamento para abrir seus projetos aqui.
            </p>
          </div>

          <button
            type="button"
            className="group grid aspect-square w-full max-w-56 place-items-center rounded-[2rem] border border-border bg-card/70 p-7 text-muted-foreground shadow-sm transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-60"
            onClick={handleScan}
            disabled={busy}
            aria-label="Escanear QR Code"
          >
            <div className="grid size-full place-items-center rounded-2xl border border-border/80 bg-background/45 transition-colors group-hover:border-primary/50">
              <QrCode className="size-16" />
            </div>
          </button>

          <div className="grid w-full gap-2 pb-4">
            <Button className="h-14 rounded-full text-base" onClick={handleScan} disabled={busy}>
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
            <Button
              className="h-11 rounded-full text-sm text-muted-foreground"
              variant="ghost"
              onClick={handlePastePairingInput}
              disabled={busy}
            >
              <Clipboard className="size-4" />
              Colar URL/token
            </Button>
          </div>
        </section>

        <Dialog open={pairingPanel !== null} onOpenChange={closePairingPanel}>
          <DialogPopup className="max-w-md data-ending-style:translate-y-8 data-starting-style:translate-y-10 max-sm:data-ending-style:translate-y-full max-sm:data-starting-style:translate-y-full">
            <DialogHeader>
              <DialogTitle>{inputLabel}</DialogTitle>
              <DialogDescription>
                {pairingPanel === "code"
                  ? "Digite o codigo mostrado no desktop e confirme o host desta conexao."
                  : "Cole a URL ou token do QR para salvar esta conexao no celular."}
              </DialogDescription>
            </DialogHeader>

            <DialogPanel>
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handlePair();
                }}
              >
                <PairingModeSelector mode={mode} busy={busy} onModeChange={setMode} />

                {pairingPanel === "code" ? (
                  <Input
                    autoFocus
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    value={pairingInput}
                    onChange={(event) => setPairingInput(event.target.value)}
                    placeholder={inputPlaceholder}
                    disabled={busy}
                    className="h-13 text-center font-mono text-base"
                  />
                ) : (
                  <Textarea
                    autoFocus
                    value={pairingInput}
                    onChange={(event) => setPairingInput(event.target.value)}
                    placeholder={inputPlaceholder}
                    disabled={busy}
                    className="min-h-28 resize-none"
                  />
                )}

                {pairingPanel === "code" ? (
                  <div className="grid gap-3">
                    <Input
                      value={host}
                      onChange={(event) => setHost(event.target.value)}
                      placeholder={
                        mode === "tailscale"
                          ? "100.x.y.z:3774 ou macbook.ts.net:3774"
                          : "192.168.15.12:3774"
                      }
                      disabled={busy}
                      inputMode="url"
                    />
                    <Input
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                      placeholder="Nome opcional do profile"
                      disabled={busy}
                    />
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground"
                      onClick={() => setAdvancedOpen((current) => !current)}
                      disabled={busy}
                    >
                      <span>Host e nome do profile</span>
                      <ChevronDown
                        className={`size-4 transition-transform ${
                          advancedOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {advancedOpen ? (
                      <div className="grid gap-3">
                        <Input
                          value={host}
                          onChange={(event) => setHost(event.target.value)}
                          placeholder={
                            mode === "tailscale"
                              ? "100.x.y.z:3774 ou macbook.ts.net:3774"
                              : "192.168.15.12:3774"
                          }
                          disabled={busy}
                          inputMode="url"
                        />
                        <Input
                          value={label}
                          onChange={(event) => setLabel(event.target.value)}
                          placeholder="Nome opcional do profile"
                          disabled={busy}
                        />
                      </div>
                    ) : null}
                  </>
                )}
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
              <Button className="h-11 rounded-full" onClick={handlePair} disabled={busy}>
                {busyAction === "pair" ? <LoaderCircle className="animate-spin" /> : <PlugZap />}
                Parear agora
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>

        {(errorMessage ?? runtime.errorMessage) ? (
          <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive">
            {errorMessage ?? runtime.errorMessage}
          </div>
        ) : null}

        <section className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Profiles salvos</h2>
            <span className="text-xs text-muted-foreground">{savedProfiles.length} profiles</span>
          </div>
          {savedProfiles.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Nenhum profile salvo ainda.
            </div>
          ) : (
            savedProfiles.map((profile) => (
              <div
                key={profile.profileId}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{profile.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{profile.httpBaseUrl}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 rounded-full"
                  onClick={() => handleConnect(profile.profileId)}
                  disabled={busy || runtime.activeProfileId !== null}
                >
                  {busyAction === "connect" ? <RefreshCw className="animate-spin" /> : <Link />}
                  Conectar
                </Button>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
