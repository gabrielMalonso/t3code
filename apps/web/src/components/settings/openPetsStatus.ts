import type { OpenPetsRuntimeStatus } from "@t3tools/contracts";

export type OpenPetsStatusTone = "muted" | "success" | "warning" | "error";

export interface OpenPetsStatusPresentation {
  readonly label: string;
  readonly description: string;
  readonly tone: OpenPetsStatusTone;
}

export function describeOpenPetsStatus(
  status: OpenPetsRuntimeStatus | null,
  loading: boolean,
  loadError: string | null,
): OpenPetsStatusPresentation {
  if (loading && status === null) {
    return {
      label: "Loading",
      description: "Checking OpenPets.",
      tone: "muted",
    };
  }
  if (loadError) {
    return {
      label: "Status unavailable",
      description: loadError,
      tone: "warning",
    };
  }
  if (status === null) {
    return {
      label: "Not checked",
      description: "OpenPets status has not been checked yet.",
      tone: "muted",
    };
  }
  if (!status.supported) {
    return {
      label: "macOS only",
      description: "OpenPets currently runs on macOS.",
      tone: "muted",
    };
  }
  if (!status.enabled) {
    return {
      label: "Disabled",
      description: "Turn it on to send T3 Code progress to OpenPets.",
      tone: "muted",
    };
  }
  if (!status.cliAvailable) {
    return {
      label: "CLI not found",
      description: "Install OpenPets, then choose Install CLI from the paw menu.",
      tone: "warning",
    };
  }
  if (!status.petReachable) {
    return {
      label: "Pet not reachable",
      description: "Launch OpenPets from Applications and start the pet.",
      tone: "warning",
    };
  }
  if (status.lastError) {
    return {
      label: "Last send failed",
      description: status.lastError,
      tone: "error",
    };
  }
  return {
    label: "Ready",
    description: status.lastEventAt ? `Last update ${status.lastEventAt}` : "OpenPets is ready.",
    tone: "success",
  };
}
