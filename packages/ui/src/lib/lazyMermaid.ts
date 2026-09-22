import type { DiagramPlugin } from "@streamdown/mermaid";

// 静态导入 Mermaid 会让首页提前解析所有图表依赖。保留插件接口，
// 到实际 render 时再加载；模块缓存复用原实例，安全配置仍由原插件负责。
export const mermaid: DiagramPlugin = {
  name: "mermaid",
  type: "diagram",
  language: "mermaid",
  getMermaid(config) {
    return {
      initialize(nextConfig) {
        config = nextConfig;
      },
      async render(id, source) {
        const renderConfig = config;
        const { mermaid } = await import("@streamdown/mermaid");
        return mermaid.getMermaid(renderConfig).render(id, source);
      },
    };
  },
};
