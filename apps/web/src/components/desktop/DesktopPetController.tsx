import type { DesktopPetOverlaySettings } from "@t3tools/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { resolveDesktopPetActivity } from "../../desktopPetActivity";
import { buildDesktopPetOverlayState } from "../../desktopPetModel";
import { selectSidebarThreadsAcrossEnvironments, useStore } from "../../store";

const DEFAULT_SETTINGS: DesktopPetOverlaySettings = {
  enabled: false,
  position: null,
};

function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reducedMotion;
}

export function DesktopPetController() {
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge?.petOverlay;
  const threads = useStore(useShallow(selectSidebarThreadsAcrossEnvironments));
  const reducedMotion = useReducedMotion();
  const [settings, setSettings] = useState<DesktopPetOverlaySettings>(DEFAULT_SETTINGS);
  const [livePosition, setLivePosition] = useState<DesktopPetOverlaySettings["position"]>(null);
  const lastPayloadRef = useRef<string>("");

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    void bridge.getSettings().then((nextSettings) => {
      if (!cancelled) {
        setSettings(nextSettings);
        setLivePosition(nextSettings.position);
      }
    });
    const unsubscribeSettings = bridge.onSettingsChanged((nextSettings) => {
      setSettings(nextSettings);
      setLivePosition(nextSettings.position);
    });
    const unsubscribeMoved = bridge.onMoved((position) => {
      setLivePosition(position);
    });
    return () => {
      cancelled = true;
      unsubscribeSettings();
      unsubscribeMoved();
      void bridge.hide();
    };
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    const unsubscribe = window.desktopBridge?.onMenuAction((action) => {
      if (action === "show-pet") {
        void bridge.setEnabled(true).then((nextSettings) => {
          setSettings(nextSettings);
          setLivePosition(nextSettings.position);
        });
      }
    });
    return () => unsubscribe?.();
  }, [bridge]);

  const activityState = useMemo(() => resolveDesktopPetActivity(threads), [threads]);
  const overlayState = useMemo(
    () =>
      buildDesktopPetOverlayState({
        activityState,
        settings,
        position: livePosition,
        reducedMotion,
      }),
    [activityState, livePosition, reducedMotion, settings],
  );

  useEffect(() => {
    if (!bridge) return;
    const payload = JSON.stringify(overlayState);
    if (payload === lastPayloadRef.current) return;
    lastPayloadRef.current = payload;

    if (!settings.enabled) {
      void bridge.hide();
      return;
    }
    void bridge.setState(overlayState);
  }, [bridge, overlayState, settings.enabled]);

  return null;
}
