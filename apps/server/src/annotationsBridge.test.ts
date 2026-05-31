import { ANNOTATIONS_BRIDGE_DELIVER_REQUEST_TYPE } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  addApprovedBridgeClientRecord,
  isAnnotationsBridgeImagePngName,
  validateBridgeImage,
} from "./annotationsBridge.ts";

it("accepts extensionless Chrome download paths when the image name is PNG", () => {
  assert.isTrue(
    isAnnotationsBridgeImagePngName({
      path: "/var/folders/test/temporary-download-artifact",
      name: "capture.png",
    }),
  );
});

it("rejects bridge image names that do not identify a PNG", () => {
  assert.isFalse(
    isAnnotationsBridgeImagePngName({
      path: "/var/folders/test/temporary-download-artifact",
      name: "capture",
    }),
  );
});

it.effect("rejects image paths that cannot be statted", () =>
  Effect.gen(function* () {
    const fileSystem = {
      stat: () => Effect.fail({ _tag: "MissingStat" as const }),
    } as unknown as Parameters<typeof validateBridgeImage>[0];

    const result = yield* validateBridgeImage(fileSystem, {
      type: ANNOTATIONS_BRIDGE_DELIVER_REQUEST_TYPE,
      requestId: "annotations-missing-image",
      prompt: "# UI Note",
      image: {
        path: "/missing/capture.png",
        name: "capture.png",
        mimeType: "image/png",
      },
    });

    assert.deepEqual(result, {
      ok: false,
      message: "Annotations bridge image file was not found.",
    });
  }),
);

it("revokes previous active clients for the same extension install when pairing again", () => {
  const nextRecords = addApprovedBridgeClientRecord(
    [
      {
        clientId: "older-client",
        clientInstallId: "install-1",
        clientName: "Annotations",
        extensionId: "abcdefghijklmnopabcdefghijklmnop",
        origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
        browser: "Chrome",
        createdAtEpochMs: 1,
        lastSeenAtEpochMs: null,
        revokedAtEpochMs: null,
        tokenHash: "older-token-hash",
      },
      {
        clientId: "other-client",
        clientInstallId: "install-2",
        clientName: "Annotations",
        extensionId: "abcdefghijklmnopabcdefghijklmnop",
        origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
        browser: "Chrome",
        createdAtEpochMs: 2,
        lastSeenAtEpochMs: null,
        revokedAtEpochMs: null,
        tokenHash: "other-token-hash",
      },
    ],
    {
      clientId: "new-client",
      clientInstallId: "install-1",
      clientName: "Annotations",
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
      browser: "Chrome",
      createdAtEpochMs: 3,
      lastSeenAtEpochMs: null,
      revokedAtEpochMs: null,
      tokenHash: "new-token-hash",
    },
    4,
  );

  assert.equal(nextRecords.length, 3);
  assert.equal(nextRecords[0]?.revokedAtEpochMs, 4);
  assert.equal(nextRecords[1]?.revokedAtEpochMs, null);
  assert.equal(nextRecords[2]?.clientId, "new-client");
  assert.equal(nextRecords[2]?.revokedAtEpochMs, null);
});
