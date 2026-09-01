import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { MachineImportRow } from "@sugi-cmms/shared";
import type { User } from "@sugi-cmms/shared";
import {
  addAttachment,
  addPmResultPhoto,
  addComment,
  adjustSparePart,
  assignPmTemplate,
  assignWorkOrder,
  authenticateSession,
  claimWorkOrder,
  createIssueCategory,
  createAuthSession,
  createMachine,
  createSection,
  createWorkOrder,
  dashboardSummary,
  deleteWorkOrder,
  deletePmResultPhoto,
  getPmDashboard,
  getPmPhoto,
  getAssetDashboard,
  getPmScheduleDetail,
  getWorkOrderDetail,
  importMachines,
  importSpareParts,
  issueSparePart,
  getSparePartDetail,
  getSpareSyncSettings,
  getWorkOrderSyncSettings,
  listMasterData,
  listNotifications,
  listPmTemplates,
  listSpareInventory,
  listSpareMovementsForActor,
  listSparePartMovements,
  listTvWorkOrders,
  listUsers,
  listWorkOrders,
  lookupSpareQr,
  markAllNotificationsRead,
  markNotificationRead,
  migrate,
  pullSparePartsFromSheet,
  publicRequesterIdForUploads,
  retrySpareSync,
  flushWorkOrderSyncQueue,
  savePmResult,
  savePmTemplate,
  seed,
  startPmSchedule,
  submitPmSchedule,
  updateIssueCategory,
  updateAsset,
  updateMachine,
  updatePmPlan,
  updateSpareSyncSettings,
  updateWorkOrderSyncSettings,
  updateSection,
  updateUserAvatar,
  updateWorkOrderStatus,
  uploadsRoot,
  validateCreateWorkOrderInput,
  validateStatusInput,
  verifyPmSchedule
} from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3300);
const liveClients = new Set<Response>();
const uploadsTempDir = path.join(uploadsRoot, "tmp");
const webDistRoot = [
  path.resolve(process.cwd(), "../web/dist"),
  path.resolve(process.cwd(), "apps/web/dist")
].find((candidate) => existsSync(path.join(candidate, "index.html")));

if (!existsSync(uploadsTempDir)) {
  mkdirSync(uploadsTempDir, { recursive: true });
}

const upload = multer({
  dest: uploadsTempDir,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 10
  },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype.startsWith("image/")) {
      callback(null, true);
      return;
    }

    callback(new Error("Only image uploads are supported in this MVP."));
  }
});

const pmProofUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype.startsWith("image/")) {
      callback(null, true);
      return;
    }
    callback(new Error("PM proof must be an image."));
  }
});

function asyncHandler(handler: (request: Request, response: Response) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response).catch(next);
  };
}

function saveWorkOrderAttachments(
  workOrderId: string,
  uploadedBy: string,
  kind: "issue" | "before" | "progress" | "after" | "return_evidence" | "general",
  files: Express.Multer.File[]
) {
  const targetDir = path.join(uploadsRoot, "work-orders", workOrderId);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  return files.map((file) => {
    const extension = path.extname(file.originalname) || ".jpg";
    const filename = `${randomUUID()}${extension}`;
    const targetPath = path.join(targetDir, filename);
    renameSync(file.path, targetPath);

    return addAttachment({
      workOrderId,
      uploadedBy,
      filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: `/uploads/work-orders/${workOrderId}/${filename}`,
      kind
    });
  });
}

migrate();
seed();

app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use("/uploads", express.static(uploadsRoot));
app.use("/api", (_request, response, next) => {
  response.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.set("Pragma", "no-cache");
  response.set("Expires", "0");
  next();
});

declare global {
  namespace Express {
    interface Request { cmmsUser?: User }
  }
}

app.use("/api", (request, response, next) => {
  const publicRequesterMutation =
    request.method === "POST" &&
    (request.path === "/requester/work-orders" || /^\/requester\/work-orders\/[^/]+\/attachments$/.test(request.path));
  const publicRequest =
    request.path === "/health" ||
    request.path === "/auth/login" ||
    request.path === "/events" ||
    publicRequesterMutation ||
    (request.method === "GET" && request.path.startsWith("/pm/photos/")) ||
    (request.method === "GET" && ["/master-data", "/tv/work-orders", "/dashboard-summary"].includes(request.path));
  if (publicRequest) { next(); return; }

  const authorization = request.header("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) { response.status(401).json({ error: "Authentication is required." }); return; }
  try {
    request.cmmsUser = authenticateSession(token);
  } catch {
    response.status(401).json({ error: "Your session has expired. Sign in again." });
    return;
  }

  const actorId = request.body?.actorId || request.body?.uploadedBy || request.body?.requesterId || request.query.actorId || request.query.userId;
  if (actorId && String(actorId) !== request.cmmsUser.id) {
    response.status(403).json({ error: "You cannot perform an action as another user." });
    return;
  }
  const scopedWorkOrderMatch = request.path.match(/^\/work-orders\/([^/]+)/);
  if (request.cmmsUser.role === "requester" && scopedWorkOrderMatch) {
    try {
      const workOrder = getWorkOrderDetail(decodeURIComponent(scopedWorkOrderMatch[1]));
      if (workOrder.requesterId !== request.cmmsUser.id) {
        response.status(403).json({ error: "You can only access work orders issued from your requester account." });
        return;
      }
    } catch {
      response.status(404).json({ error: "Work order not found." });
      return;
    }
  }
  if ((request.path.startsWith("/assets") || request.path.startsWith("/pm") || request.path.startsWith("/work-orders/sync")) && !["admin", "developer"].includes(request.cmmsUser.role)) {
    response.status(403).json({ error: "This feature is locked while development is in progress." });
    return;
  }
  next();
});

type LiveTopic = "work-orders" | "notifications" | "dashboard" | "spare-parts" | "pm" | "assets" | "master-data" | "users";

function topicsForMutation(pathname: string): LiveTopic[] {
  if (pathname.startsWith("/api/requester/work-orders") || pathname.startsWith("/api/work-orders")) {
    return ["work-orders", "notifications", "dashboard"];
  }
  if (pathname.startsWith("/api/spare-parts")) return ["spare-parts", "dashboard"];
  if (pathname.startsWith("/api/pm")) return ["pm", "dashboard"];
  if (pathname.startsWith("/api/assets")) return ["assets", "dashboard"];
  if (pathname.startsWith("/api/master-data")) return ["master-data"];
  if (pathname.startsWith("/api/users")) return ["users"];
  if (pathname.startsWith("/api/notifications")) return ["notifications"];
  return [];
}

function publishLiveChange(topic: LiveTopic, request: Request) {
  const message = JSON.stringify({ topic, path: request.path, method: request.method, at: new Date().toISOString() });
  for (const client of liveClients) {
    client.write(`data: ${message}\n\n`);
  }
}

app.get("/api/events", (request, response) => {
  response.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  response.flushHeaders();
  response.write(`retry: 2000\ndata: ${JSON.stringify({ topic: "connected", at: new Date().toISOString() })}\n\n`);
  liveClients.add(response);

  request.on("close", () => {
    liveClients.delete(response);
  });
});

// Broadcast only after a successful write has fully completed. This covers every
// current and future mutation without coupling the database layer to HTTP clients.
app.use((request, response, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    next();
    return;
  }

  response.on("finish", () => {
    if (response.statusCode < 400) {
      const topics = topicsForMutation(request.path);
      topics.forEach((topic) => publishLiveChange(topic, request));
      if (topics.includes("work-orders")) void flushWorkOrderSyncQueue().catch(console.error);
    }
  });
  next();
});

const liveHeartbeat = setInterval(() => {
  for (const client of liveClients) {
    client.write(`: keep-alive ${Date.now()}\n\n`);
  }
}, 25000);
liveHeartbeat.unref();

const workOrderSyncRetry = setInterval(() => {
  void flushWorkOrderSyncQueue().catch(console.error);
}, 60000);
workOrderSyncRetry.unref();

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "sugi-cmms-api",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/users", (request, response) => {
  response.json(listUsers(request.query.role ? String(request.query.role) : undefined));
});

app.post("/api/auth/login", (request, response) => {
  if (!request.body.username || !request.body.password) {
    throw new Error("Username and password are required.");
  }

  response.json(createAuthSession(String(request.body.username), String(request.body.password)));
});

app.get("/api/auth/me", (request, response) => {
  response.json(request.cmmsUser);
});

app.post("/api/users/:id/avatar", upload.single("avatar"), (request, response) => {
  if (request.cmmsUser?.id !== request.params.id && !["admin", "developer"].includes(request.cmmsUser?.role || "")) {
    response.status(403).json({ error: "You can only update your own profile photo." });
    return;
  }
  const file = request.file;
  if (!file) {
    throw new Error("avatar image is required.");
  }

  const targetDir = path.join(uploadsRoot, "users", request.params.id);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const extension = path.extname(file.originalname) || ".jpg";
  const filename = `${randomUUID()}${extension}`;
  const targetPath = path.join(targetDir, filename);
  renameSync(file.path, targetPath);

  const user = updateUserAvatar(request.params.id, `/uploads/users/${request.params.id}/${filename}`);
  response.status(201).json(user);
});

app.get("/api/dashboard-summary", (_request, response) => {
  response.json(dashboardSummary());
});

app.get("/api/system/public-config", (_request, response) => {
  const publicUrl = (process.env.APP_PUBLIC_URL || "").trim().replace(/\/$/, "");
  response.json({ requesterUrl: publicUrl ? `${publicUrl}/requester` : "" });
});

app.get("/api/tv/work-orders", (_request, response) => {
  response.json(listTvWorkOrders());
});

app.get("/api/assets", (_request, response) => {
  response.json(getAssetDashboard());
});

app.patch("/api/assets/:id", (request, response) => {
  response.json(updateAsset(request.params.id, {
    actorId: String(request.body.actorId || ""),
    condition: String(request.body.condition || "operational") as "operational" | "watch" | "obsolete" | "decommissioned",
    criticality: String(request.body.criticality || "medium") as "critical" | "high" | "medium" | "low",
    location: String(request.body.location || "Production"),
    notes: String(request.body.notes || "")
  }));
});

app.get("/api/master-data", (_request, response) => {
  response.json(listMasterData());
});

app.post("/api/master-data/sections", (request, response) => {
  response.status(201).json(createSection({
    actorId: String(request.body.actorId || ""),
    name: String(request.body.name || ""),
    active: request.body.active === undefined ? true : Boolean(request.body.active)
  }));
});

app.patch("/api/master-data/sections/:id", (request, response) => {
  response.json(updateSection(request.params.id, {
    actorId: String(request.body.actorId || ""),
    name: String(request.body.name || ""),
    active: request.body.active === undefined ? true : Boolean(request.body.active)
  }));
});

app.post("/api/master-data/machines", (request, response) => {
  response.status(201).json(createMachine({
    actorId: String(request.body.actorId || ""),
    sectionId: String(request.body.sectionId || ""),
    area: String(request.body.area || "General"),
    name: String(request.body.name || ""),
    active: request.body.active === undefined ? true : Boolean(request.body.active)
  }));
});

app.post("/api/master-data/machines/import", (request, response) => {
  const rows = Array.isArray(request.body.rows) ? request.body.rows : [];
  response.status(201).json(importMachines({
    actorId: String(request.body.actorId || ""),
    rows: rows.map((row: Partial<MachineImportRow>) => ({
      sectionName: String(row.sectionName || ""),
      areaName: String(row.areaName || "General"),
      machineName: String(row.machineName || "")
    }))
  }));
});

app.patch("/api/master-data/machines/:id", (request, response) => {
  response.json(updateMachine(request.params.id, {
    actorId: String(request.body.actorId || ""),
    sectionId: String(request.body.sectionId || ""),
    area: String(request.body.area || "General"),
    name: String(request.body.name || ""),
    active: request.body.active === undefined ? true : Boolean(request.body.active)
  }));
});

app.post("/api/master-data/issue-categories", (request, response) => {
  response.status(201).json(createIssueCategory({
    actorId: String(request.body.actorId || ""),
    name: String(request.body.name || ""),
    active: request.body.active === undefined ? true : Boolean(request.body.active)
  }));
});

app.patch("/api/master-data/issue-categories/:id", (request, response) => {
  response.json(updateIssueCategory(request.params.id, {
    actorId: String(request.body.actorId || ""),
    name: String(request.body.name || ""),
    active: request.body.active === undefined ? true : Boolean(request.body.active)
  }));
});

app.get("/api/pm/dashboard", (request, response) => {
  const actorId = String(request.query.actorId || "");
  if (!actorId) {
    throw new Error("actorId query parameter is required.");
  }
  const year = Number(request.query.year || new Date().getFullYear());
  response.json(getPmDashboard(actorId, year));
});

app.get("/api/pm/templates", (_request, response) => {
  response.json(listPmTemplates());
});

app.post("/api/pm/templates", (request, response) => {
  response.status(201).json(savePmTemplate(null, request.body));
});

app.patch("/api/pm/templates/:id", (request, response) => {
  response.json(savePmTemplate(request.params.id, request.body));
});

app.patch("/api/pm/plans/:id/template", (request, response) => {
  response.json(assignPmTemplate(request.params.id, request.body));
});

app.patch("/api/pm/plans/:id", (request, response) => {
  response.json(updatePmPlan(request.params.id, request.body));
});

app.get("/api/pm/photos/:photoId", (request, response) => {
  const photo = getPmPhoto(request.params.photoId);
  response.setHeader("Content-Type", photo.mimeType);
  response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(photo.originalName)}`);
  response.setHeader("Cache-Control", "private, max-age=3600");
  response.send(Buffer.from(photo.data));
});

app.get("/api/pm/schedules/:id", (request, response) => {
  const actorId = String(request.query.actorId || "");
  if (!actorId) {
    throw new Error("actorId query parameter is required.");
  }
  response.json(getPmScheduleDetail(request.params.id, actorId));
});

app.post("/api/pm/schedules/:id/start", (request, response) => {
  if (!request.body.actorId) {
    throw new Error("actorId is required.");
  }
  response.json(startPmSchedule(request.params.id, String(request.body.actorId)));
});

app.put("/api/pm/schedules/:id/results/:itemId", (request, response) => {
  response.json(savePmResult(request.params.id, { ...request.body, itemId: request.params.itemId }));
});

app.post("/api/pm/schedules/:id/results/:itemId/photos", pmProofUpload.single("photo"), (request, response) => {
  if (!request.file) {
    throw new Error("A proof photo is required.");
  }
  response.status(201).json(addPmResultPhoto({
    scheduleId: request.params.id,
    itemId: request.params.itemId,
    actorId: request.cmmsUser!.id,
    originalName: request.file.originalname,
    mimeType: request.file.mimetype,
    size: request.file.size,
    data: request.file.buffer
  }));
});

app.delete("/api/pm/photos/:photoId", (request, response) => {
  response.json(deletePmResultPhoto(request.params.photoId, String(request.body.actorId || "")));
});

app.post("/api/pm/schedules/:id/submit", (request, response) => {
  response.json(submitPmSchedule(request.params.id, request.body));
});

app.post("/api/pm/schedules/:id/verify", (request, response) => {
  if (!request.body.actorId) {
    throw new Error("actorId is required.");
  }
  response.json(verifyPmSchedule(request.params.id, String(request.body.actorId)));
});

app.get("/api/spare-parts", (_request, response) => {
  response.json(listSpareInventory());
});

app.get("/api/spare-parts/qr/lookup", (request, response) => {
  response.json(lookupSpareQr(String(request.query.value || "")));
});

app.get("/api/spare-parts/history/by-actor", (request, response) => {
  response.json(listSpareMovementsForActor(String(request.query.actorId || "")));
});

app.get("/api/spare-parts/sync/settings", (_request, response) => {
  response.json(getSpareSyncSettings());
});

app.patch("/api/spare-parts/sync/settings", (request, response) => {
  response.json(updateSpareSyncSettings({
    actorId: String(request.body.actorId || ""),
    scriptUrl: String(request.body.scriptUrl || ""),
    token: request.body.token === undefined ? undefined : String(request.body.token || ""),
    masterSheetName: String(request.body.masterSheetName || "Masterlist"),
    supplierSheetName: String(request.body.supplierSheetName || "Supplier"),
    movementSheetName: String(request.body.movementSheetName || "Movement Log")
  }));
});

app.post("/api/spare-parts/import", (request, response) => {
  response.status(201).json(importSpareParts({
    actorId: String(request.body.actorId || ""),
    masterText: String(request.body.masterText || ""),
    supplierText: request.body.supplierText ? String(request.body.supplierText) : undefined
  }));
});

app.post("/api/spare-parts/sync/pull", asyncHandler(async (request, response) => {
  response.json(await pullSparePartsFromSheet(String(request.body.actorId || "")));
}));

app.post("/api/spare-parts/sync/retry", asyncHandler(async (request, response) => {
  response.json(await retrySpareSync(String(request.body.actorId || "")));
}));

app.get("/api/work-orders/sync/settings", (_request, response) => {
  response.json(getWorkOrderSyncSettings());
});

app.patch("/api/work-orders/sync/settings", (request, response) => {
  response.json(updateWorkOrderSyncSettings({
    actorId: String(request.body.actorId || ""),
    scriptUrl: String(request.body.scriptUrl || ""),
    token: request.body.token === undefined ? undefined : String(request.body.token || ""),
    sheetName: String(request.body.sheetName || "WorkOrders"),
    webhookUrl: String(request.body.webhookUrl || "")
  }));
});

app.post("/api/work-orders/sync/retry", asyncHandler(async (request, response) => {
  response.json(await flushWorkOrderSyncQueue(String(request.body.actorId || "")));
}));

app.get("/api/spare-parts/:itemNo", (request, response) => {
  response.json(getSparePartDetail(request.params.itemNo));
});

app.get("/api/spare-parts/:itemNo/movements", (request, response) => {
  response.json(listSparePartMovements(request.params.itemNo));
});

app.post("/api/spare-parts/:itemNo/issue", asyncHandler(async (request, response) => {
  response.status(201).json(await issueSparePart(request.params.itemNo, {
    actorId: String(request.body.actorId || ""),
    workOrderId: String(request.body.workOrderId || ""),
    quantity: Number(request.body.quantity || 0),
    note: request.body.note ? String(request.body.note) : undefined
  }));
}));

app.post("/api/spare-parts/:itemNo/adjust", asyncHandler(async (request, response) => {
  response.status(201).json(await adjustSparePart(request.params.itemNo, {
    actorId: String(request.body.actorId || ""),
    type: request.body.type,
    quantity: Number(request.body.quantity || 0),
    note: String(request.body.note || "")
  }));
}));

app.get("/api/requester/work-orders", (_request, response) => {
  response.status(403).json({ error: "Guest tracking is disabled. Sign in with a requester account to track work orders." });
});

app.post("/api/requester/work-orders", (request, response) => {
  const input = validateCreateWorkOrderInput({
    ...request.body,
    requesterId: publicRequesterIdForUploads()
  });
  const workOrder = createWorkOrder(input);
  response.status(201).json(workOrder);
});

app.post("/api/requester/work-orders/:id/attachments", upload.array("attachments", 10), (request, response) => {
  const files = request.files as Express.Multer.File[];
  const workOrder = getWorkOrderDetail(request.params.id);
  const uploadWindowOpen = Date.now() - Date.parse(workOrder.createdAt) <= 5 * 60 * 1000;
  if (workOrder.requesterId !== publicRequesterIdForUploads() || workOrder.status !== "open" || !uploadWindowOpen) {
    files.forEach((file) => rmSync(file.path, { force: true }));
    response.status(403).json({ error: "The public upload window for this work order has closed." });
    return;
  }
  const saved = saveWorkOrderAttachments(request.params.id, publicRequesterIdForUploads(), "issue", files);
  response.status(201).json(saved);
});

app.get("/api/work-orders", (request, response) => {
  const workOrders = listWorkOrders();
  response.json(request.cmmsUser?.role === "requester"
    ? workOrders.filter((workOrder) => workOrder.requesterId === request.cmmsUser?.id)
    : workOrders);
});

app.post("/api/work-orders", (request, response) => {
  const input = validateCreateWorkOrderInput(request.body);
  const workOrder = createWorkOrder(input);
  response.status(201).json(workOrder);
});

app.get("/api/work-orders/:id", (request, response) => {
  response.json(getWorkOrderDetail(request.params.id));
});

app.delete("/api/work-orders/:id", asyncHandler(async (request, response) => {
  if (!request.body.actorId) {
    throw new Error("actorId is required.");
  }

  response.json(await deleteWorkOrder(request.params.id, String(request.body.actorId)));
}));

app.patch("/api/work-orders/:id/status", (request, response) => {
  const input = validateStatusInput(request.body);
  const workOrder = updateWorkOrderStatus(request.params.id, input);
  response.json(workOrder);
});

app.patch("/api/work-orders/:id/claim", (request, response) => {
  if (!request.body.actorId) {
    throw new Error("actorId is required.");
  }

  const workOrder = claimWorkOrder(
    request.params.id,
    String(request.body.actorId),
    request.body.note ? String(request.body.note) : undefined
  );
  response.json(workOrder);
});

app.patch("/api/work-orders/:id/assign", (request, response) => {
  if (!request.body.assignedToId || !request.body.actorId) {
    throw new Error("assignedToId and actorId are required.");
  }

  const workOrder = assignWorkOrder(
    request.params.id,
    String(request.body.assignedToId),
    String(request.body.actorId),
    request.body.note ? String(request.body.note) : undefined
  );
  response.json(workOrder);
});

app.post("/api/work-orders/:id/comments", (request, response) => {
  if (!request.body.actorId || !request.body.message) {
    throw new Error("actorId and message are required.");
  }

  const activity = addComment(request.params.id, String(request.body.actorId), String(request.body.message));
  response.status(201).json(activity);
});

app.post("/api/work-orders/:id/attachments", upload.array("attachments", 10), (request, response) => {
  const files = request.files as Express.Multer.File[];
  const uploadedBy = request.cmmsUser!.id;
  const kind = String(request.body.kind || "general");

  const saved = saveWorkOrderAttachments(
    request.params.id,
    uploadedBy,
    kind as "issue" | "before" | "progress" | "after" | "return_evidence" | "general",
    files
  );
  response.status(201).json(saved);
});

app.get("/api/notifications", (request, response) => {
  if (!request.query.userId) {
    throw new Error("userId query parameter is required.");
  }

  response.json(listNotifications(String(request.query.userId)));
});

app.patch("/api/notifications/read-all", (request, response) => {
  if (!request.body.userId) {
    throw new Error("userId is required.");
  }

  markAllNotificationsRead(String(request.body.userId));
  response.status(204).send();
});

app.patch("/api/notifications/:id/read", (request, response) => {
  markNotificationRead(request.params.id);
  response.status(204).send();
});

if (webDistRoot) {
  app.use(express.static(webDistRoot));
  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/api") || request.path.startsWith("/uploads")) {
      next();
      return;
    }

    response.sendFile(path.join(webDistRoot, "index.html"));
  });
}

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  response.status(400).json({
    error: error.message || "Something went wrong."
  });
});

app.listen(port, () => {
  console.log(`Sugi CMMS API running on http://localhost:${port}`);
});
