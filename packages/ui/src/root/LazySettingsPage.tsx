import { lazy, Suspense, type ComponentProps } from "react";
import { useAIbuddyIntl } from "@/i18n/IntlProvider.js";

// 两个设置入口共用延迟组件，避免任一静态导入把整套设置依赖带回首页。
const SettingsPage = lazy(() =>
  import("@/SettingsPage.js").then((module) => ({ default: module.SettingsPage })),
);

export function LazySettingsPage(props: ComponentProps<typeof SettingsPage>) {
  const { intl } = useAIbuddyIntl();
  return (
    <Suspense
      fallback={
        <div
          className="flex h-full items-center justify-center bg-background text-ui-base text-foreground-subtle"
          role="status"
          aria-busy="true"
        >
          {intl.formatMessage({ id: "common.loading" })}
        </div>
      }
    >
      <SettingsPage {...props} />
    </Suspense>
  );
}
