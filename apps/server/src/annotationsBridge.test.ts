import { assert, it } from "@effect/vitest";

import {
  addApprovedBridgeClientRecord,
  isAnnotationsBridgeImagePngName,
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
