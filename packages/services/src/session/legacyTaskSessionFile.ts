import type { AIbuddySessionFile, AIbuddyTaskMeta } from "@aibuddy/shared";
import { aibuddySessionFileSchema, aibuddyTaskMetaSchema, aibuddyTaskModeSchema } from "@aibuddy/shared";

export type LegacyTaskSessionFile = Omit<AIbuddySessionFile, "meta"> & {
  meta: Omit<AIbuddyTaskMeta, "mode"> & { mode?: AIbuddyTaskMeta["mode"] };
};

const legacyTaskSessionFileSchema = aibuddySessionFileSchema.extend({
  // Claude 原生迁移会按清洗路径删除 meta.mode。
  // legacy snapshot 读取/写入仍要校验其它必需字段，但不能再强制把被过滤字段补回文件。
  meta: aibuddyTaskMetaSchema.extend({
    mode: aibuddyTaskModeSchema.optional(),
  }),
});

export function parseLegacyTaskSessionFile(input: unknown): LegacyTaskSessionFile {
  return legacyTaskSessionFileSchema.parse(input);
}

export function safeParseLegacyTaskSessionFile(input: unknown) {
  return legacyTaskSessionFileSchema.safeParse(input);
}
