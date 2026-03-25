import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="app-panel rounded-[28px] border border-dashed border-slate-300/70 px-6 py-10 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
        Sem itens
      </p>
      <h3 className="mt-3 text-2xl font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
        {description}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
