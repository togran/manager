import { cn } from "@/lib/utils";

const stateConfig: Record<string, { bg: string; text: string; border: string; dot: string; icon: string; pulse?: boolean }> = {
  running: {
    bg: "bg-green-50 dark:bg-green-950/20",
    text: "text-green-700 dark:text-green-400",
    border: "border-green-200 dark:border-green-800",
    dot: "bg-green-500",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    pulse: true,
  },
  pending: {
    bg: "bg-yellow-50 dark:bg-yellow-950/20",
    text: "text-yellow-700 dark:text-yellow-400",
    border: "border-yellow-200 dark:border-yellow-800",
    dot: "bg-yellow-500",
    icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  stopping: {
    bg: "bg-orange-50 dark:bg-orange-950/20",
    text: "text-orange-700 dark:text-orange-400",
    border: "border-orange-200 dark:border-orange-800",
    dot: "bg-orange-500",
    icon: "M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  stopped: {
    bg: "bg-slate-50 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-400",
    border: "border-slate-200 dark:border-slate-700",
    dot: "bg-slate-400",
    icon: "M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 000 2h6a1 1 0 000-2H9z",
  },
  "shutting-down": {
    bg: "bg-red-50 dark:bg-red-950/20",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
    dot: "bg-red-500",
    icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z",
  },
  terminated: {
    bg: "bg-red-50 dark:bg-red-950/20",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
    dot: "bg-red-500",
    icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
};

export function StateBadge({ state }: { state: string }) {
  const config = stateConfig[state] ?? stateConfig.stopped;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm",
        config.bg,
        config.text,
        config.border,
      )}
    >
      <div className="relative">
        <svg
          className={cn("h-3 w-3", config.pulse && "animate-pulse")}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
        </svg>
        <div
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-white dark:border-slate-800",
            config.dot,
          )}
        />
      </div>
      <span className="capitalize">{state.replace("-", " ")}</span>
    </span>
  );
}