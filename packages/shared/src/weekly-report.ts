import type { PlantId, WorkOrderStatus } from "./index.js";

export interface WeeklyMetrics {
  created: number;
  resolved: number;
  closed: number;
  backlog: number;
  awaitingVerification: number;
  overdue: number;
  critical: number;
  downtimeMinutes: number;
  downtimeSamples: number;
  missingAcknowledgement: number;
}
export interface WeeklyReportFacts {
  scope: PlantId | "all";
  start: string;
  end: string;
  timezone: "Asia/Kuala_Lumpur";
  current: WeeklyMetrics;
  previous: WeeklyMetrics;
  daily: { date: string; created: number; resolved: number; closed: number }[];
  statuses: { status: WorkOrderStatus; count: number }[];
  ageing: { label: string; count: number }[];
  plants: { plant: PlantId; metrics: WeeklyMetrics }[];
  machines: { machine: string; plant: PlantId; minutes: number; jobs: number }[];
  exceptions: { id: string; number: string; plant: PlantId; machine: string; status: WorkOrderStatus; priority: string; ageDays: number; reason: string; owner: string }[];
  exceptionCount: number;
}
export interface WeeklyReport {
  id: string | null;
  subject: string;
  html: string;
  facts: WeeklyReportFacts;
  summary: string;
  actions: string[];
  aiStatus: "generated" | "unavailable" | "disabled";
  aiMessage: string;
  generatedAt: string;
  delivery: "draft" | "sending" | "sent" | "failed";
  sentAt: string | null;
  deliveryError: string;
}
export type WeeklyReportHistory = Pick<WeeklyReport, "id" | "subject" | "aiStatus" | "generatedAt" | "delivery" | "sentAt" | "deliveryError">;
