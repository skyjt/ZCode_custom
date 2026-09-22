import { z } from "zod";

/**
 * AIbuddy agent 提供方的单一真源。
 *
 * 类型 AIbuddyProvider、运行时 schema aibuddyProviderSchema 都从这里派生,
 * 避免各处内联 z.enum([...]) 副本随新增/删除 provider 漂移。
 * 本模块只依赖 zod(叶子),可被 validation / aibuddy-protocol 等无环引用。
 */
const AIBUDDY_PROVIDERS = ["glm"] as const;

export const aibuddyProviderSchema = z.enum(AIBUDDY_PROVIDERS);

export type AIbuddyProvider = (typeof AIBUDDY_PROVIDERS)[number];
