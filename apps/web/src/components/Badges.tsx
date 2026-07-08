import { priorityLabels, workOrderStatusLabels, type WorkOrderPriority, type WorkOrderStatus } from "@sugi-cmms/shared";

export function StatusBadge({ status }: { status: WorkOrderStatus }) {
  return <span className={`badge status-${status}`}>{workOrderStatusLabels[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: WorkOrderPriority }) {
  return <span className={`badge priority-${priority}`}>{priorityLabels[priority]}</span>;
}
