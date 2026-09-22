import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";
import { AIbuddyAboutLogo } from "@/components/ui/AIbuddyAboutLogo.js";

interface RootStartupLoadingProps {
  label: string;
  children?: ReactNode;
  busy?: boolean;
}

export function RootStartupLoading({ label, children, busy = true }: RootStartupLoadingProps) {
  return (
    <div
      // Web 端全局 html/body/#root 为 Electron 透明背景让路，React 接管后会替换 HTML 启动壳。
      // 这里必须由阻塞态自身承接主题背景，否则远控链接会在 Root 恢复期间继续露出浏览器白底。
      className="flex h-full min-h-dvh flex-col items-center justify-center gap-6 bg-background text-foreground"
      role="status"
      aria-busy={busy}
      aria-label={label}
      data-testid="root-startup-loading"
    >
      <AIbuddyStartupLogoBadge />
      {children}
    </div>
  );
}

/** 初始化与引导共用品牌图标，图片自身包含圆角底板。 */
export function AIbuddyStartupLogoBadge({ animated = true }: { animated?: boolean }) {
  return (
    <AIbuddyAboutLogo
      className={cn("size-24", animated && "motion-safe:animate-pulse [animation-delay:3s]")}
    />
  );
}
