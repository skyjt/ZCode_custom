import {
  aibuddyProtocolMethods,
  aibuddyPluginsReferenceCatalogResultSchema,
  type AIbuddyPluginsReferenceCatalogParams,
} from "@aibuddy/shared";
import type { AIbuddyProtocolClient } from "#src/aibuddy-agent/aibuddyProtocolClient.js";

/** 旧协议严格校验响应；新展示字段走独立入口，只有 -32601 能证明旧 Agent 不支持。 */
export async function requestPluginReferenceCatalog(
  client: Pick<AIbuddyProtocolClient, "request">,
  params: AIbuddyPluginsReferenceCatalogParams,
) {
  try {
    return await client.request(
      aibuddyProtocolMethods.pluginsReferenceCatalogWithCategory,
      params,
      aibuddyPluginsReferenceCatalogResultSchema,
    );
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === -32601))
      throw error;
    return client.request(
      aibuddyProtocolMethods.pluginsReferenceCatalog,
      params,
      aibuddyPluginsReferenceCatalogResultSchema,
    );
  }
}
