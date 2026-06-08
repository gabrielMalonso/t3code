import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  createBuildConfig,
  resolveGitHubPublishConfig,
  createStagePnpmConfig,
  resolveDesktopRuntimeDependencies,
  resolveBuildOptions,
  resolveDesktopBuildIconAssets,
  resolveDesktopProductName,
  resolveDesktopUpdateChannel,
  resolveMockUpdateServerPort,
  resolveMockUpdateServerUrl,
  normalizeMacSigningIdentityName,
} from "./build-desktop-artifact.ts";
import { BRAND_ASSET_PATHS } from "./lib/brand-assets.ts";

it.layer(NodeServices.layer)("build-desktop-artifact", (it) => {
  it("resolves the dedicated nightly updater channel from nightly versions", () => {
    assert.equal(resolveDesktopUpdateChannel("0.0.17-nightly.20260413.42"), "nightly");
    assert.equal(resolveDesktopUpdateChannel("0.0.17"), "latest");
  });

  it("switches desktop packaging product names to nightly for nightly builds", () => {
    assert.equal(resolveDesktopProductName("0.0.17"), "T3 Code (Alpha)");
    assert.equal(resolveDesktopProductName("0.0.17-nightly.20260413.42"), "T3 Code (Nightly)");
  });

  it("requires an explicit desktop update repository before publishing updater metadata", () => {
    const previousUpdateRepository = process.env.T3CODE_DESKTOP_UPDATE_REPOSITORY;
    const previousGitHubRepository = process.env.GITHUB_REPOSITORY;

    try {
      delete process.env.T3CODE_DESKTOP_UPDATE_REPOSITORY;
      process.env.GITHUB_REPOSITORY = "pingdotgg/t3code";
      assert.equal(resolveGitHubPublishConfig("latest"), undefined);

      process.env.T3CODE_DESKTOP_UPDATE_REPOSITORY = "gabrielalonso/t3code-custom";
      assert.deepStrictEqual(resolveGitHubPublishConfig("nightly"), {
        provider: "github",
        owner: "gabrielalonso",
        repo: "t3code-custom",
        releaseType: "prerelease",
        channel: "nightly",
      });
    } finally {
      if (previousUpdateRepository === undefined) {
        delete process.env.T3CODE_DESKTOP_UPDATE_REPOSITORY;
      } else {
        process.env.T3CODE_DESKTOP_UPDATE_REPOSITORY = previousUpdateRepository;
      }

      if (previousGitHubRepository === undefined) {
        delete process.env.GITHUB_REPOSITORY;
      } else {
        process.env.GITHUB_REPOSITORY = previousGitHubRepository;
      }
    }
  });

  it("switches desktop packaging icons to the nightly artwork for nightly versions", () => {
    assert.deepStrictEqual(resolveDesktopBuildIconAssets("0.0.17"), {
      macIconPng: BRAND_ASSET_PATHS.productionMacIconPng,
      linuxIconPng: BRAND_ASSET_PATHS.productionLinuxIconPng,
      windowsIconIco: BRAND_ASSET_PATHS.productionWindowsIconIco,
    });

    assert.deepStrictEqual(resolveDesktopBuildIconAssets("0.0.17-nightly.20260413.42"), {
      macIconPng: BRAND_ASSET_PATHS.nightlyMacIconPng,
      linuxIconPng: BRAND_ASSET_PATHS.nightlyLinuxIconPng,
      windowsIconIco: BRAND_ASSET_PATHS.nightlyWindowsIconIco,
    });
  });

  it("omits bundled workspace packages from staged desktop dependencies", () => {
    assert.deepStrictEqual(
      resolveDesktopRuntimeDependencies(
        {
          "@effect/platform-node": "catalog:",
          "@t3tools/contracts": "workspace:*",
          "@t3tools/shared": "workspace:*",
          "@t3tools/ssh": "workspace:*",
          "@t3tools/tailscale": "workspace:*",
          effect: "catalog:",
          electron: "41.5.0",
        },
        {
          "@effect/platform-node": "4.0.0-beta.59",
          effect: "4.0.0-beta.59",
        },
      ),
      {
        "@effect/platform-node": "4.0.0-beta.59",
        effect: "4.0.0-beta.59",
      },
    );
  });

  it("carries only staged dependency patch metadata into staged desktop installs", () => {
    assert.deepStrictEqual(
      createStagePnpmConfig(
        {
          "@expo/metro-config@56.0.13": "patches/@expo%2Fmetro-config@56.0.13.patch",
          "@pierre/diffs@1.1.20": "patches/@pierre%2Fdiffs@1.1.20.patch",
          "alchemy@2.0.0-beta.49": "patches/alchemy@2.0.0-beta.49.patch",
          "effect@4.0.0-beta.73": "patches/effect@4.0.0-beta.73.patch",
        },
        {
          "@pierre/diffs": "1.1.20",
          effect: "4.0.0-beta.73",
        },
      ),
      {
        patchedDependencies: {
          "@pierre/diffs@1.1.20": "patches/@pierre%2Fdiffs@1.1.20.patch",
          "effect@4.0.0-beta.73": "patches/effect@4.0.0-beta.73.patch",
        },
      },
    );

    assert.equal(
      createStagePnpmConfig(
        {
          "@expo/metro-config@56.0.13": "patches/@expo%2Fmetro-config@56.0.13.patch",
        },
        { effect: "4.0.0-beta.73" },
      ),
      undefined,
    );
  });

  it("falls back to the default mock update port when the configured port is blank", () => {
    assert.equal(resolveMockUpdateServerUrl(undefined), "http://localhost:3000");
    assert.equal(resolveMockUpdateServerUrl(4123), "http://localhost:4123");
  });

  it.effect("normalizes mock update server ports from env-style strings", () =>
    Effect.gen(function* () {
      assert.equal(yield* resolveMockUpdateServerPort(undefined), undefined);
      assert.equal(yield* resolveMockUpdateServerPort(""), undefined);
      assert.equal(yield* resolveMockUpdateServerPort("   "), undefined);
      assert.equal(yield* resolveMockUpdateServerPort("4123"), 4123);
    }),
  );

  it.effect("rejects non-numeric or out-of-range mock update ports", () =>
    Effect.gen(function* () {
      const invalidPorts = ["abc", "12.5", "0", "65536"];
      for (const port of invalidPorts) {
        const exit = yield* Effect.exit(resolveMockUpdateServerPort(port));
        assert.equal(exit._tag, "Failure");
      }
    }),
  );

  it.effect("preserves explicit false boolean flags over true env defaults", () =>
    Effect.gen(function* () {
      const resolved = yield* resolveBuildOptions({
        platform: Option.some("mac"),
        target: Option.none(),
        arch: Option.some("arm64"),
        buildVersion: Option.none(),
        macSigningIdentity: Option.none(),
        outputDir: Option.some("release-test"),
        skipBuild: Option.some(false),
        keepStage: Option.some(false),
        signed: Option.some(false),
        verbose: Option.some(false),
        mockUpdates: Option.some(false),
        mockUpdateServerPort: Option.none(),
      }).pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                T3CODE_DESKTOP_SKIP_BUILD: "true",
                T3CODE_DESKTOP_KEEP_STAGE: "true",
                T3CODE_DESKTOP_SIGNED: "true",
                T3CODE_DESKTOP_VERBOSE: "true",
                T3CODE_DESKTOP_MOCK_UPDATES: "true",
              },
            }),
          ),
        ),
      );

      assert.equal(resolved.skipBuild, false);
      assert.equal(resolved.keepStage, false);
      assert.equal(resolved.signed, false);
      assert.equal(resolved.verbose, false);
      assert.equal(resolved.mockUpdates, false);
    }),
  );

  it.effect("resolves a pinned macOS signing identity from env", () =>
    Effect.gen(function* () {
      const resolved = yield* resolveBuildOptions({
        platform: Option.some("mac"),
        target: Option.none(),
        arch: Option.some("arm64"),
        buildVersion: Option.none(),
        macSigningIdentity: Option.none(),
        outputDir: Option.none(),
        skipBuild: Option.none(),
        keepStage: Option.none(),
        signed: Option.none(),
        verbose: Option.none(),
        mockUpdates: Option.none(),
        mockUpdateServerPort: Option.none(),
      }).pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                T3CODE_DESKTOP_MAC_SIGNING_IDENTITY:
                  "Developer ID Application: Example Developer (TEAMID1234)",
              },
            }),
          ),
        ),
      );

      assert.equal(resolved.macSigningIdentity, "Example Developer (TEAMID1234)");
    }),
  );

  it("normalizes Apple certificate prefixes from macOS signing identities", () => {
    assert.equal(
      normalizeMacSigningIdentityName("Developer ID Application: Example Developer (TEAMID1234)"),
      "Example Developer (TEAMID1234)",
    );
    assert.equal(
      normalizeMacSigningIdentityName("Apple Development: Example Developer (TEAMID1234)"),
      "Example Developer (TEAMID1234)",
    );
    assert.equal(
      normalizeMacSigningIdentityName("Apple Distribution: Example Developer (TEAMID1234)"),
      "Example Developer (TEAMID1234)",
    );
    assert.equal(
      normalizeMacSigningIdentityName("Example Developer (TEAMID1234)"),
      "Example Developer (TEAMID1234)",
    );
  });

  it.effect("pins the macOS signing identity only when signing is enabled", () =>
    Effect.gen(function* () {
      const signedConfig = yield* createBuildConfig(
        "mac",
        "dmg",
        "0.0.17",
        true,
        "Developer ID Application: Example Developer (TEAMID1234)",
        false,
        undefined,
      );
      const signedMacConfig = signedConfig.mac as {
        readonly entitlements?: string;
        readonly entitlementsInherit?: string;
        readonly extendInfo?: { readonly NSAppleEventsUsageDescription?: string };
        readonly hardenedRuntime?: boolean;
        readonly identity?: string;
      };
      assert.equal(signedMacConfig.identity, "Example Developer (TEAMID1234)");
      assert.equal(
        signedMacConfig.extendInfo?.NSAppleEventsUsageDescription,
        "T3 Code uses Apple Events to let computer-use tools inspect and control local apps when you ask them to.",
      );
      assert.equal(signedMacConfig.entitlements, "apps/desktop/resources/entitlements.mac.plist");
      assert.equal(
        signedMacConfig.entitlementsInherit,
        "apps/desktop/resources/entitlements.mac.inherit.plist",
      );
      assert.equal(signedMacConfig.hardenedRuntime, true);

      const unsignedConfig = yield* createBuildConfig(
        "mac",
        "dmg",
        "0.0.17",
        false,
        "Developer ID Application: Example Developer (TEAMID1234)",
        false,
        undefined,
      );
      const unsignedMacConfig = unsignedConfig.mac as {
        readonly entitlements?: string;
        readonly entitlementsInherit?: string;
        readonly extendInfo?: { readonly NSAppleEventsUsageDescription?: string };
        readonly hardenedRuntime?: boolean;
        readonly identity?: string;
      };
      assert.equal(unsignedMacConfig.identity, undefined);
      assert.equal(
        unsignedMacConfig.extendInfo?.NSAppleEventsUsageDescription,
        "T3 Code uses Apple Events to let computer-use tools inspect and control local apps when you ask them to.",
      );
      assert.equal(unsignedMacConfig.entitlements, undefined);
      assert.equal(unsignedMacConfig.entitlementsInherit, undefined);
      assert.equal(unsignedMacConfig.hardenedRuntime, undefined);
    }),
  );
});
