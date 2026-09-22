import { cn } from "@/components/lib/utils.js";
import appLogoUrl from "@/assets/aibuddy-icon.png";

export function AIbuddyAboutLogo({ className }: { className?: string }) {
  return (
    <img
      src={appLogoUrl}
      width="256"
      height="256"
      alt=""
      className={cn("shrink-0 object-contain", className)}
      aria-hidden="true"
      draggable={false}
    />
  );
}

export function AIbuddyWordmarkLogo({ className }: { className?: string }) {
  return (
    <span className={cn("shrink-0 text-ui-xl font-semibold tracking-tight", className)}>
      AIbuddy
    </span>
  );
}
