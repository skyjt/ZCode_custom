import { resolve } from "node:path";
import base from "../../packages/desktop/electron-builder.config.js";
import { runtime } from "./build.mjs";

if (
  !process.env.ZCODE_WIN7_ELECTRON_DIST ||
  process.env.ZCODE_AUTO_UPDATE !== "0" ||
  process.env.ZCODE_PREVIEW_IDENTITY !== "1"
) {
  throw new Error(
    "Use node scripts/win7/build.mjs to build the isolated Win7 experimental edition",
  );
}

export default {
  ...base,
  appId: "dev.zcode.app.win7.experimental",
  productName: "aibuddy7se",
  electronVersion: runtime.version,
  electronDist: process.env.ZCODE_WIN7_ELECTRON_DIST,
  extraMetadata: {
    ...base.extraMetadata,
    name: "zcode-win7-experimental",
    description: "aibuddy7se · Win7 特别版",
    main: "out/win7-bootstrap.mjs",
    zcodeWin7Runtime: runtime,
  },
  extraResources: [
    ...base.extraResources.filter(
      (item) => !["icon.png", "icon_windows.png", "tray_icon.ico"].includes(item.to),
    ),
    ...["icon.png", "icon_windows.png"].map((name) => ({
      from: resolve(import.meta.dirname, "branding", name),
      to: name,
    })),
    { from: resolve(import.meta.dirname, "branding/icon.ico"), to: "tray_icon.ico" },
    { from: resolve(import.meta.dirname, "system-self-test.cjs"), to: "win7/system-self-test.cjs" },
    { from: resolve(import.meta.dirname, "runtime-smoke.cjs"), to: "win7/runtime-smoke.cjs" },
    { from: resolve(import.meta.dirname, "runtime.json"), to: "win7/runtime.json" },
    {
      from: resolve(import.meta.dirname, "../../.cache/win7-offline-tools"),
      to: "offline-tools",
      filter: ["**/*"],
    },
    {
      from: resolve(import.meta.dirname, "offline-skills"),
      to: "glm/packages/bundled-skills/skills",
      filter: ["**/*"],
    },
  ],
  win: {
    ...base.win,
    executableName: "aibuddy7se",
    icon: resolve(import.meta.dirname, "branding/icon.ico"),
    target: ["nsis", "zip"],
    artifactName: "aibuddy7se-${version}-win7-intranet-${arch}.${ext}",
  },
  nsis: {
    ...base.nsis,
    installerIcon: resolve(import.meta.dirname, "branding/icon.ico"),
    uninstallerIcon: resolve(import.meta.dirname, "branding/icon.ico"),
    installerHeaderIcon: resolve(import.meta.dirname, "branding/icon.ico"),
    runAfterFinish: false,
    deleteAppDataOnUninstall: false,
  },
  publish: null,
};
