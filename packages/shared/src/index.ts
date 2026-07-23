export type UserRole = "requester" | "technician" | "executive" | "admin";

export type WorkOrderType = "standard_maintenance" | "kaizen";

export type WorkOrderStatus =
  | "open"
  | "acknowledged"
  | "in_progress"
  | "pending_material"
  | "resolved"
  | "closed"
  | "returned"
  | "cancelled";

export type WorkOrderPriority = "low" | "medium" | "high" | "critical";
export type ShiftGroup = "A" | "B";

export interface Section {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Machine {
  id: string;
  sectionId: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IssueCategory {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MasterData {
  sections: Section[];
  machines: Machine[];
  issueCategories: IssueCategory[];
}

export type ActivityAction =
  | "created"
  | "acknowledged"
  | "assigned"
  | "started"
  | "pending_material"
  | "resolved"
  | "closed"
  | "returned"
  | "cancelled"
  | "commented"
  | "attachment_added";

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  department: string;
  title: string;
  avatarUrl: string | null;
}

export interface WorkOrder {
  id: string;
  number: string;
  type: WorkOrderType;
  title: string;
  description: string;
  assetName: string;
  location: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  requesterId: string;
  assignedToId: string | null;
  dueDate: string | null;
  completionNote: string | null;
  workDate: string;
  shiftGroup: ShiftGroup;
  sectionId: string | null;
  machineId: string | null;
  machineName: string;
  reportedByName: string;
  reportedByDepartment: string;
  issueCategoryId: string | null;
  issueDescription: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderAttachment {
  id: string;
  workOrderId: string;
  uploadedBy: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  kind: "issue" | "before" | "progress" | "after" | "return_evidence" | "general";
  createdAt: string;
}

export interface WorkOrderActivity {
  id: string;
  workOrderId: string;
  actorId: string;
  action: ActivityAction;
  status: WorkOrderStatus | null;
  message: string;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  workOrderId: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface WorkOrderDetail extends WorkOrder {
  requester: User;
  assignedTo: User | null;
  section: Section | null;
  machine: Machine | null;
  issueCategory: IssueCategory | null;
  activities: WorkOrderActivity[];
  attachments: WorkOrderAttachment[];
}

export interface DashboardSummary {
  totalOpen: number;
  newWorkOrders: number;
  inProgress: number;
  pendingMaterial: number;
  resolvedWaitingVerification: number;
  closedToday: number;
}

export type AssetCondition = "operational" | "watch" | "obsolete" | "decommissioned";
export type AssetCriticality = "critical" | "high" | "medium" | "low";
export type AssetLifecycleBand = "modern" | "midlife" | "aging" | "legacy" | "unknown";

export interface AssetRecord {
  id: string;
  assetNo: number;
  name: string;
  serialNo: string;
  yearText: string;
  installDateText: string;
  warranty: string;
  manufacturer: string;
  supplier: string;
  contactPerson: string;
  telephone: string;
  fax: string;
  condition: AssetCondition;
  criticality: AssetCriticality;
  location: string;
  notes: string;
  source: string;
  ageYears: number | null;
  lifecycleBand: AssetLifecycleBand;
  riskScore: number;
  warrantyState: "active" | "expiring" | "expired" | "unknown" | "not_applicable";
  dataCompleteness: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssetSummary {
  totalAssets: number;
  operational: number;
  watch: number;
  obsolete: number;
  decommissioned: number;
  highRisk: number;
  legacy: number;
  averageAge: number;
  missingSerials: number;
  expiredWarranties: number;
  expiringWarranties: number;
  dataCompleteness: number;
}

export interface AssetManufacturerBreakdown {
  name: string;
  count: number;
}

export interface AssetDashboardResponse {
  summary: AssetSummary;
  assets: AssetRecord[];
  manufacturers: AssetManufacturerBreakdown[];
  sourceLabel: string;
  sourceRevision: number;
  sourceUpdatedAt: string;
  missingAssetNumbers: number[];
}

export interface UpdateAssetInput {
  actorId: string;
  condition: AssetCondition;
  criticality: AssetCriticality;
  location?: string;
  notes?: string;
}

export interface CreateWorkOrderInput {
  type: WorkOrderType;
  title?: string;
  description?: string;
  assetName?: string;
  location?: string;
  priority?: WorkOrderPriority;
  requesterId: string;
  dueDate?: string | null;
  workDate?: string;
  shiftGroup?: ShiftGroup;
  sectionId?: string | null;
  machineId?: string | null;
  machineName?: string;
  reportedByName?: string;
  reportedByDepartment?: string;
  issueCategoryId?: string | null;
  issueDescription?: string;
}

export interface UpdateWorkOrderStatusInput {
  status: WorkOrderStatus;
  actorId: string;
  note: string;
  assignedToId?: string | null;
}

export interface ClaimWorkOrderInput {
  actorId: string;
  note?: string;
}

export interface PublicRequesterWorkOrder {
  id: string;
  number: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  workDate: string;
  shiftGroup: ShiftGroup;
  sectionName: string;
  machineName: string;
  issueCategoryName: string;
  issueDescription: string;
  reportedByName: string;
  reportedByDepartment: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertSectionInput {
  actorId: string;
  name: string;
  active?: boolean;
}

export interface UpsertMachineInput {
  actorId: string;
  sectionId: string;
  name: string;
  active?: boolean;
}

export interface MachineImportRow {
  sectionName: string;
  machineName: string;
}

export interface ImportMachinesInput {
  actorId: string;
  rows: MachineImportRow[];
}

export interface MachineImportResult {
  importedSections: number;
  importedMachines: number;
  skippedMachines: number;
  errors: string[];
  masterData: MasterData;
}

export type StockMovementType = "issue" | "restock" | "correction" | "return" | "write_off";
export type StockSyncStatus = "pending" | "synced" | "failed" | "disabled";

export interface SparePart {
  itemNo: string;
  no: string | null;
  category: string;
  description: string;
  uom: string;
  price: number;
  partRank: string;
  status: string;
  stockRank: string;
  minStock: number;
  maxStock: number;
  searchName: string;
  openingStock: number;
  currentStock: number;
  source: string;
  supplier: string;
  supplier1: string;
  supplier2: string;
  supplier3: string;
  leadTime: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpareSupplier {
  id: string;
  no: string | null;
  category: string;
  description: string;
  supplier: string;
  address: string;
  pic: string;
  contactNo: string;
  faxNo: string;
  autoDial: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  itemNo: string;
  workOrderId: string | null;
  actorId: string;
  type: StockMovementType;
  quantity: number;
  beforeStock: number;
  afterStock: number;
  note: string;
  source: string;
  syncStatus: StockSyncStatus;
  syncError: string | null;
  syncedAt: string | null;
  createdAt: string;
}

export interface StockMovementDetail extends StockMovement {
  itemSearchName: string;
  itemCategory: string;
  actorName: string;
  workOrderNumber: string | null;
}

export interface SparePartDetail extends SparePart {
  suppliers: SpareSupplier[];
  movements: StockMovementDetail[];
}

export interface SpareInventorySummary {
  totalParts: number;
  lowStock: number;
  outOfStock: number;
  totalValue: number;
  unsyncedMovements: number;
}

export interface SpareInventoryResponse {
  parts: SparePart[];
  suppliers: SpareSupplier[];
  recentMovements: StockMovementDetail[];
  summary: SpareInventorySummary;
  syncConfigured: boolean;
}

export interface SpareImportInput {
  actorId: string;
  masterText: string;
  supplierText?: string;
}

export interface SpareImportResult {
  importedParts: number;
  updatedParts: number;
  skippedRows: number;
  importedSuppliers: number;
  errors: string[];
  inventory: SpareInventoryResponse;
}

export interface SpareQrLookupResult {
  query: string;
  exact: boolean;
  matches: SparePart[];
}

export interface SpareIssueInput {
  actorId: string;
  workOrderId: string;
  quantity: number;
  note?: string;
}

export interface SpareAdjustmentInput {
  actorId: string;
  type: Exclude<StockMovementType, "issue">;
  quantity: number;
  note: string;
}

export interface SpareSyncResult {
  configured: boolean;
  ok: boolean;
  message: string;
  importedParts?: number;
  updatedParts?: number;
  importedSuppliers?: number;
  retriedMovements?: number;
  failedMovements?: number;
  errors: string[];
  inventory?: SpareInventoryResponse;
}

export interface SpareSyncSettings {
  scriptUrl: string;
  hasToken: boolean;
  masterSheetName: string;
  supplierSheetName: string;
  movementSheetName: string;
  configured: boolean;
}

export interface UpdateSpareSyncSettingsInput {
  actorId: string;
  scriptUrl: string;
  token?: string;
  masterSheetName: string;
  supplierSheetName: string;
  movementSheetName: string;
}

export interface UpsertIssueCategoryInput {
  actorId: string;
  name: string;
  active?: boolean;
}

export interface DeleteWorkOrderInput {
  actorId: string;
}

export type PmScheduleStatus = "scheduled" | "in_progress" | "submitted" | "verified";
export type PmResultCode = "pass" | "fail" | "adjusted" | "not_applicable";
export type PmDataType = "marking" | "value";
export type PmMaintenanceType = "preventive" | "predictive";

export interface PmChecklistItem {
  id: string;
  templateId: string;
  sortOrder: number;
  groupName: string;
  description: string;
  specification: string;
  inspectionMethod: string;
  frequency: string;
  dataType: PmDataType;
  maintenanceType: PmMaintenanceType;
  required: boolean;
}

export interface PmChecklistTemplate {
  id: string;
  machineName: string;
  title: string;
  documentNumber: string;
  revisionNumber: string;
  effectiveDate: string;
  version: number;
  active: boolean;
  itemCount: number;
  updatedAt: string;
  items: PmChecklistItem[];
}

export interface PmPlan {
  id: string;
  mainMachine: string;
  machineName: string;
  frequencyLabel: string;
  frequencyMonths: number;
  occurrencesPerMonth: number;
  technicianId: string;
  technicianName: string;
  templateId: string | null;
  startMonth: number;
  weekOfMonth: number;
  secondaryWeek: number | null;
  active: boolean;
}

export interface PmScheduleItem {
  id: string;
  planId: string;
  scheduledDate: string;
  year: number;
  month: number;
  weekOfMonth: number;
  status: PmScheduleStatus;
  startedAt: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  remarks: string;
  machineName: string;
  mainMachine: string;
  frequencyLabel: string;
  technicianId: string;
  technicianName: string;
  templateId: string | null;
  templateTitle: string | null;
  checklistItemCount: number;
  completedItemCount: number;
  failedItemCount: number;
  overdue: boolean;
}

export interface PmChecklistResult {
  itemId: string;
  resultCode: PmResultCode | null;
  readingValue: string;
  note: string;
  completedAt: string | null;
  photos: PmChecklistPhoto[];
}

export interface PmChecklistPhoto {
  id: string;
  scheduleId: string;
  itemId: string;
  uploadedBy: string;
  uploadedByName: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

export interface PmScheduleDetail extends PmScheduleItem {
  template: PmChecklistTemplate | null;
  results: PmChecklistResult[];
  verifiedByName: string | null;
}

export interface PmSummary {
  scheduledThisMonth: number;
  dueThisWeek: number;
  overdue: number;
  completedThisMonth: number;
  compliancePercent: number;
  checklistCoveragePercent: number;
}

export interface PmDashboardResponse {
  summary: PmSummary;
  schedules: PmScheduleItem[];
  plans: PmPlan[];
  templates: PmChecklistTemplate[];
}

export interface SavePmResultInput {
  actorId: string;
  itemId: string;
  resultCode: PmResultCode | null;
  readingValue?: string;
  note?: string;
}

export interface SubmitPmScheduleInput {
  actorId: string;
  remarks?: string;
}

export interface SavePmTemplateInput {
  actorId: string;
  machineName: string;
  title: string;
  documentNumber?: string;
  revisionNumber?: string;
  effectiveDate?: string;
  active?: boolean;
  items: Array<{
    id?: string;
    groupName: string;
    description: string;
    specification: string;
    inspectionMethod: string;
    frequency: string;
    dataType: PmDataType;
    maintenanceType: PmMaintenanceType;
    required?: boolean;
  }>;
}

export interface AssignPmTemplateInput {
  actorId: string;
  templateId: string | null;
}

export interface UpdatePmPlanInput {
  actorId: string;
  mainMachine: string;
  machineName: string;
  frequencyMonths: number;
  occurrencesPerMonth: number;
  technicianId: string;
  startMonth: number;
  weekOfMonth: number;
  secondaryWeek?: number | null;
  active?: boolean;
}

export const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  pending_material: "Pending material",
  resolved: "Resolved",
  closed: "Closed",
  returned: "Returned",
  cancelled: "Cancelled"
};

export const workOrderTypeLabels: Record<WorkOrderType, string> = {
  standard_maintenance: "Standard maintenance",
  kaizen: "Kaizen"
};

export const priorityLabels: Record<WorkOrderPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical"
};
