import type { ReactNode } from "react";

type PanelCardProps = {
  title: string;
  className?: string;
  children: ReactNode;
};

export function PanelCard({ title, className, children }: PanelCardProps) {
  const classes = className ? `card ${className}` : "card";

  return (
    <article className={classes}>
      <h4>{title}</h4>
      {children}
    </article>
  );
}
