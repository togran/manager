import { ReactNode } from "react";

export function Field({ label, value }: { label: string; value: ReactNode }) {
  const display =
    value === null || value === undefined || value === "" ? (
      <span className="text-muted-foreground">–</span>
    ) : (
      value
    );
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="break-all text-sm text-foreground">{display}</span>
    </div>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}
