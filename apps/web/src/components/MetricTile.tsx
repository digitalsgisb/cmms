import type { LucideIcon } from "lucide-react";

export function MetricTile({
  icon: Icon,
  label,
  value,
  tone = "default"
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  return (
    <div className={`metric-tile metric-${tone}`}>
      <div className="metric-icon">
        <Icon size={20} aria-hidden="true" />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
