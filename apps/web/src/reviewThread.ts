export interface ReviewThreadAvailabilityInput {
  hasActiveThread: boolean;
  hasActiveProject: boolean;
  isServerThread: boolean;
  isSendBusy: boolean;
  isConnecting: boolean;
}

export type StartThreadWithPromptProgress =
  | "before-thread-create"
  | "thread-created"
  | "turn-started";

export function canRequestReviewThread(
  input: ReviewThreadAvailabilityInput,
): boolean {
  return (
    input.hasActiveThread &&
    input.hasActiveProject &&
    input.isServerThread &&
    !input.isSendBusy &&
    !input.isConnecting
  );
}

export function shouldDeleteThreadAfterStartFailure(
  progress: StartThreadWithPromptProgress,
): boolean {
  return progress === "thread-created";
}
