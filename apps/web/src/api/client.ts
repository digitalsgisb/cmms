import type {
  ClaimWorkOrderInput,
  CreateWorkOrderInput,
  DashboardSummary,
  DeleteWorkOrderInput,
  IssueCategory,
  Machine,
  MachineImportResult,
  MachineImportRow,
  MasterData,
  NotificationRecord,
  PublicRequesterWorkOrder,
  Section,
  SpareAdjustmentInput,
  SpareImportInput,
  SpareImportResult,
  SpareInventoryResponse,
  SpareIssueInput,
  SparePartDetail,
  SpareQrLookupResult,
  SpareSyncSettings,
  SpareSyncResult,
  StockMovementDetail,
  UpdateSpareSyncSettingsInput,
  UpdateWorkOrderStatusInput,
  User,
  WorkOrder,
  WorkOrderActivity,
  WorkOrderAttachment,
  WorkOrderDetail
} from "@sugi-cmms/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function mediaUrl(url: string) {
  if (url.startsWith("http") || !API_BASE) {
    return url;
  }

  return `${API_BASE}${url}`;
}

export const api = {
  health: () => request<{ ok: boolean; service: string; timestamp: string }>("/api/health"),
  login: (username: string, password: string) =>
    request<User>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    }),
  users: () => request<User[]>("/api/users"),
  usersByRole: (role: User["role"]) => request<User[]>(`/api/users?role=${role}`),
  uploadUserAvatar: (id: string, file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);

    return request<User>(`/api/users/${id}/avatar`, {
      method: "POST",
      body: formData
    });
  },
  dashboardSummary: () => request<DashboardSummary>("/api/dashboard-summary"),
  masterData: () => request<MasterData>("/api/master-data"),
  createSection: (input: { actorId: string; name: string; active?: boolean }) =>
    request<Section>("/api/master-data/sections", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updateSection: (id: string, input: { actorId: string; name: string; active?: boolean }) =>
    request<Section>(`/api/master-data/sections/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  createMachine: (input: { actorId: string; sectionId: string; name: string; active?: boolean }) =>
    request<Machine>("/api/master-data/machines", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  importMachines: (input: { actorId: string; rows: MachineImportRow[] }) =>
    request<MachineImportResult>("/api/master-data/machines/import", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updateMachine: (id: string, input: { actorId: string; sectionId: string; name: string; active?: boolean }) =>
    request<Machine>(`/api/master-data/machines/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  createIssueCategory: (input: { actorId: string; name: string; active?: boolean }) =>
    request<IssueCategory>("/api/master-data/issue-categories", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updateIssueCategory: (id: string, input: { actorId: string; name: string; active?: boolean }) =>
    request<IssueCategory>(`/api/master-data/issue-categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  spareInventory: () => request<SpareInventoryResponse>("/api/spare-parts"),
  sparePart: (itemNo: string) => request<SparePartDetail>(`/api/spare-parts/${encodeURIComponent(itemNo)}`),
  sparePartMovements: (itemNo: string) =>
    request<StockMovementDetail[]>(`/api/spare-parts/${encodeURIComponent(itemNo)}/movements`),
  lookupSpareQr: (value: string) => request<SpareQrLookupResult>(`/api/spare-parts/qr/lookup?value=${encodeURIComponent(value)}`),
  spareSyncSettings: () => request<SpareSyncSettings>("/api/spare-parts/sync/settings"),
  updateSpareSyncSettings: (input: UpdateSpareSyncSettingsInput) =>
    request<SpareSyncSettings>("/api/spare-parts/sync/settings", {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  importSpareParts: (input: SpareImportInput) =>
    request<SpareImportResult>("/api/spare-parts/import", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  pullSparePartsFromSheet: (actorId: string) =>
    request<SpareSyncResult>("/api/spare-parts/sync/pull", {
      method: "POST",
      body: JSON.stringify({ actorId })
    }),
  retrySpareSync: (actorId: string) =>
    request<SpareSyncResult>("/api/spare-parts/sync/retry", {
      method: "POST",
      body: JSON.stringify({ actorId })
    }),
  issueSparePart: (itemNo: string, input: SpareIssueInput) =>
    request<StockMovementDetail>(`/api/spare-parts/${encodeURIComponent(itemNo)}/issue`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  adjustSparePart: (itemNo: string, input: SpareAdjustmentInput) =>
    request<StockMovementDetail>(`/api/spare-parts/${encodeURIComponent(itemNo)}/adjust`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  workOrders: () => request<WorkOrder[]>("/api/work-orders"),
  requesterWorkOrders: () => request<PublicRequesterWorkOrder[]>("/api/requester/work-orders"),
  createRequesterWorkOrder: (input: Omit<CreateWorkOrderInput, "requesterId">) =>
    request<WorkOrder>("/api/requester/work-orders", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  workOrder: (id: string) => request<WorkOrderDetail>(`/api/work-orders/${id}`),
  createWorkOrder: (input: CreateWorkOrderInput) =>
    request<WorkOrder>("/api/work-orders", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updateWorkOrderStatus: (id: string, input: UpdateWorkOrderStatusInput) =>
    request<WorkOrder>(`/api/work-orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  claimWorkOrder: (id: string, input: ClaimWorkOrderInput) =>
    request<WorkOrder>(`/api/work-orders/${id}/claim`, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  assignWorkOrder: (id: string, assignedToId: string, actorId: string, note?: string) =>
    request<WorkOrder>(`/api/work-orders/${id}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ assignedToId, actorId, note })
    }),
  deleteWorkOrder: (id: string, input: DeleteWorkOrderInput) =>
    request<WorkOrder>(`/api/work-orders/${id}`, {
      method: "DELETE",
      body: JSON.stringify(input)
    }),
  addComment: (id: string, actorId: string, message: string) =>
    request<WorkOrderActivity>(`/api/work-orders/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ actorId, message })
    }),
  uploadAttachments: (
    id: string,
    uploadedBy: string,
    kind: WorkOrderAttachment["kind"],
    files: FileList | File[]
  ) => {
    const formData = new FormData();
    formData.append("uploadedBy", uploadedBy);
    formData.append("kind", kind);

    Array.from(files).forEach((file) => {
      formData.append("attachments", file);
    });

    return request<WorkOrderAttachment[]>(`/api/work-orders/${id}/attachments`, {
      method: "POST",
      body: formData
    });
  },
  uploadRequesterAttachments: (id: string, files: FileList | File[]) => {
    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append("attachments", file);
    });

    return request<WorkOrderAttachment[]>(`/api/requester/work-orders/${id}/attachments`, {
      method: "POST",
      body: formData
    });
  },
  notifications: (userId: string) => request<NotificationRecord[]>(`/api/notifications?userId=${userId}`),
  markNotificationRead: (id: string) =>
    request<void>(`/api/notifications/${id}/read`, {
      method: "PATCH"
    }),
  markAllNotificationsRead: (userId: string) =>
    request<void>("/api/notifications/read-all", {
      method: "PATCH",
      body: JSON.stringify({ userId })
    })
};
