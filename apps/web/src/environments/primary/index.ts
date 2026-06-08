export {
  getPrimaryKnownEnvironment,
  readPrimaryEnvironmentDescriptor,
  resetPrimaryEnvironmentDescriptorForTests,
  resolveInitialPrimaryEnvironmentDescriptor,
  usePrimaryEnvironmentId,
  writePrimaryEnvironmentDescriptor,
  __resetPrimaryEnvironmentBootstrapForTests,
  __resetPrimaryEnvironmentDescriptorBootstrapForTests,
} from "./context";

export {
  resolveInitialPrimaryEnvironmentDescriptor as ensurePrimaryEnvironmentReady,
  writePrimaryEnvironmentDescriptor as updatePrimaryEnvironmentDescriptor,
} from "./context";

export {
  approveAnnotationsBridgePairing,
  createServerPairingCredential,
  fetchSessionState,
  listAnnotationsBridgeClients,
  listAnnotationsBridgePendingPairings,
  listServerClientSessions,
  listServerPairingLinks,
  peekPairingTokenFromUrl,
  rejectAnnotationsBridgePairing,
  resolveInitialServerAuthGateState,
  revokeAnnotationsBridgeClient,
  revokeOtherServerClientSessions,
  revokeServerClientSession,
  revokeServerPairingLink,
  stripPairingTokenFromUrl,
  submitServerAuthCredential,
  takePairingTokenFromUrl,
  type ServerClientSessionRecord,
  type ServerPairingLinkRecord,
  __resetServerAuthBootstrapForTests,
} from "./auth";

export { refreshPrimarySessionState, usePrimarySessionState } from "./sessionState";

export { resolvePrimaryEnvironmentHttpUrl, isLoopbackHostname } from "./target";
