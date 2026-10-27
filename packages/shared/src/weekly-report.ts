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
export interface MachineReliability {
  key: string;
  plant: PlantId;
  department: string;
  machine: string;
  section: string;
  area: string;
  weekReports: number;
  previousWeekReports: number;
  reports30d: number;
  repairBacklog: number;
  returnedThisWeek: number;
  downtimeMinutes: number;
  downtimeSamples: number;
  repeatedIssue: string | null;
  repeatedIssueReports: number;
}
export interface LocationReliability {
  key: string;
  plant: PlantId;
  department: string;
  section: string;
  area: string;
  weekReports: number;
  previousWeekReports: number;
  reports30d: number;
  repairBacklog: number;
  downtimeMinutes: number;
}
export interface WeeklyReliabilityAnalysis {
  lookbackStart: string;
  lookbackEnd: string;
  maintenanceReportsThisWeek: number;
  maintenanceReportsPreviousWeek: number;
  maintenanceReports30d: number;
  repeatMachines30d: number;
  unidentifiedMachineReports30d: number;
  missingLocationReports30d: number;
  machines: MachineReliability[];
  locations: LocationReliability[];
  issues: { category: string; weekReports: number; reports30d: number }[];
  findings: string[];
  recommendedActions: string[];
  live: {
    asOf: string;
    repairBacklog: number;
    maintenanceBacklog: number;
    awaitingVerification: number;
    critical: number;
    overdue: number;
    pendingMaterial: number;
    onHold: number;
    oldestOpenDays: number;
    locations: { plant: PlantId; department: string; section: string; area: string; backlog: number; critical: number; oldestOpenDays: number }[];
  };
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
  machines: { machine: string; plant: PlantId; minutes: number; jobs: number; department?: string; section?: string; area?: string }[];
  exceptions: { id: string; number: string; plant: PlantId; machine: string; status: WorkOrderStatus; priority: string; ageDays: number; reason: string; owner: string }[];
  exceptionCount: number;
  /** Absent on report snapshots saved before reliability analysis was added. */
  reliability?: WeeklyReliabilityAnalysis;
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
