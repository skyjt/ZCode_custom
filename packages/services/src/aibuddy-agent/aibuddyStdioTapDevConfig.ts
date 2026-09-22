import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AIbuddyStdioTapDevState } from "@aibuddy/shared";
import { getAppConfigDir } from "#src/paths.js";
import { isEffectiveDevelopmentNodeEnv } from "#src/runtime-tools/nodeEnv.js";

interface AIbuddyStdioTapStateFile {
  enabled?: boolean;
}

function isAIbuddyStdioTapDevVisible(): boolean {
  return isEffectiveDevelopmentNodeEnv();
}

function getAIbuddyStdioTapDevDir(): string {
  return join(getAppConfigDir(), "dev");
}

export function getAIbuddyStdioTapDevLogDir(): string {
  return join(getAIbuddyStdioTapDevDir(), "stdio-traffic");
}

function getAIbuddyStdioTapDevStatePath(): string {
  return join(getAIbuddyStdioTapDevDir(), "aibuddy-stdio-tap.json");
}

function readStateFile(path: string): AIbuddyStdioTapStateFile {
  if (!existsSync(path)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as AIbuddyStdioTapStateFile) : {};
  } catch {
    return {};
  }
}

export function readAIbuddyStdioTapDevState(): AIbuddyStdioTapDevState {
  const visible = isAIbuddyStdioTapDevVisible();
  const statePath = getAIbuddyStdioTapDevStatePath();
  const fileState = readStateFile(statePath);
  return {
    enabled: visible && fileState.enabled === true,
    visible,
    logDir: getAIbuddyStdioTapDevLogDir(),
    statePath,
  };
}

export function setAIbuddyStdioTapDevEnabled(enabled: boolean): AIbuddyStdioTapDevState {
  const visible = isAIbuddyStdioTapDevVisible();
  const statePath = getAIbuddyStdioTapDevStatePath();
  mkdirSync(getAIbuddyStdioTapDevDir(), { recursive: true });
  writeFileSync(
    statePath,
    `${JSON.stringify(
      {
        // 开发态 stdio 抓包是高频原始协议帧，只能通过显式开关写旁路文件，避免误进生产日志。
        enabled: visible && enabled,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  return readAIbuddyStdioTapDevState();
}
