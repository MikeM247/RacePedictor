import { PanelCard } from "./panel-card";

type KpiCardProps = {
  title: string;
  value: string;
};

export function KpiCard({ title, value }: KpiCardProps) {
  return (
    <PanelCard title={title}>
      <p className="big">{value}</p>
    </PanelCard>
  );
}
