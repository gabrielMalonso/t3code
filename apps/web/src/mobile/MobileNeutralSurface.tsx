import { Link, PlugZap, QrCode, RefreshCw, Unplug } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "../components/ui/button";
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

function modeLabel(mode: MobileConnectionMode): string {
  return mode === "tailscale" ? "Tailscale" : "LAN";
}

function defaultProfileLabel(input: {
  readonly backendLabel: string;
  readonly mode: MobileConnectionMode;
}): string {
  return `${input.backendLabel} (${modeLabel(input.mode)})`;
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
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void profileStore.hydrate();
  }, [profileStore]);

  const profilesByMode = useMemo(
    () => ({
      tailscale: profileStore.profiles.filter((profile) => profile.mode === "tailscale"),
      lan: profileStore.profiles.filter((profile) => profile.mode === "lan"),
    }),
    [profileStore.profiles],
  );

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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
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

  return (
    <main className="min-h-dvh bg-background px-4 py-5 text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Mobile {getMobilePlatformLabel()}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">T3 Code</h1>
          </div>
          {runtime.activeProfileId ? (
            <Button variant="outline" size="sm" onClick={handleClose} disabled={busy}>
              <Unplug />
              Fechar
            </Button>
          ) : null}
        </header>

        <section className="rounded-lg border border-border bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            {(["tailscale", "lan"] as const).map((entry) => (
              <Button
                key={entry}
                variant={mode === entry ? "default" : "outline"}
                onClick={() => setMode(entry)}
                disabled={busy}
              >
                {modeLabel(entry)}
              </Button>
            ))}
          </div>

          <div className="mt-4 grid gap-3">
            <Input
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder={
                mode === "tailscale"
                  ? "100.x.y.z:3774 ou macbook.ts.net:3774"
                  : "192.168.15.12:3774"
              }
              disabled={busy}
            />
            <Textarea
              value={pairingInput}
              onChange={(event) => setPairingInput(event.target.value)}
              placeholder="URL de pareamento ou token"
              disabled={busy}
            />
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Nome opcional do profile"
              disabled={busy}
            />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handlePair} disabled={busy}>
                <PlugZap />
                Parear
              </Button>
              <Button variant="outline" onClick={handleScan} disabled={busy}>
                <QrCode />
                QR
              </Button>
            </div>
          </div>
        </section>

        {(errorMessage ?? runtime.errorMessage) ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive">
            {errorMessage ?? runtime.errorMessage}
          </div>
        ) : null}

        <section className="grid gap-3">
          {(["tailscale", "lan"] as const).map((entry) => (
            <div key={entry} className="rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{modeLabel(entry)}</h2>
                <span className="text-xs text-muted-foreground">
                  {profilesByMode[entry].length} profiles
                </span>
              </div>
              <div className="grid gap-2">
                {profilesByMode[entry].length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum profile salvo.</p>
                ) : (
                  profilesByMode[entry].map((profile) => (
                    <div
                      key={profile.profileId}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{profile.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {profile.httpBaseUrl}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleConnect(profile.profileId)}
                        disabled={busy || runtime.activeProfileId !== null}
                      >
                        {busyAction === "connect" ? <RefreshCw /> : <Link />}
                        Conectar
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
