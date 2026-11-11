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
  productName: "ZCode Win7 Experimental",
  electronVersion: runtime.version,
  electronDist: process.env.ZCODE_WIN7_ELECTRON_DIST,
  extraMetadata: {
    ...base.extraMetadata,
    name: "zcode-win7-experimental",
    main: "out/win7-bootstrap.mjs",
    zcodeWin7Runtime: runtime,
  },
  extraResources: [
    ...base.extraResources,
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
    executableName: "ZCode Win7 Experimental",
    target: ["nsis", "zip"],
    artifactName: "ZCode-Win7-Offline-Experimental-${version}-${arch}.${ext}",
  },
  nsis: { ...base.nsis, runAfterFinish: false, deleteAppDataOnUninstall: false },
  publish: null,
};
