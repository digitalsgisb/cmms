import { ArrowLeft, CheckCircle2, Clock3, ImagePlus, MessageSquare, PackageOpen, RotateCcw, ShieldCheck, TimerReset, Wrench } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import type { User, WorkOrder, WorkOrderAttachment, WorkOrderActivity, WorkOrderDetail, WorkOrderStatus } from "@sugi-cmms/shared";
import { workOrderStatusLabels, workOrderTypeLabels } from "@sugi-cmms/shared";
import { api, mediaUrl } from "../api/client";
import { PriorityBadge, StatusBadge } from "../components/Badges";
import { ActionButton } from "../components/ActionButton";
import { useCurrentUser } from "../state/UserContext";
import { formatDate, formatDateTime, formatDuration, userName } from "../utils/format";

const workflowSteps: WorkOrderStatus[] = ["open", "acknowledged", "in_progress", "pending_material", "resolved", "closed"];
const actionSettleMs = 620;

function waitForActionMotion() {
  return new Promise((resolve) => window.setTimeout(resolve, actionSettleMs));
}

function restoreScroll(x: number, y: number) {
  window.requestAnimationFrame(() => {
    window.scrollTo(x, y);
    window.requestAnimationFrame(() => window.scrollTo(x, y));
  });
  window.setTimeout(() => window.scrollTo(x, y), 120);
}

function findActivityTime(activities: WorkOrderActivity[], action: WorkOrderActivity["action"]) {
  return [...activities].reverse().find((activity) => activity.action === action)?.createdAt || null;
}

export function WorkOrderDetailPage() {
  const { id } = useParams();
  const { currentUser, users } = useCurrentUser();
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [uploadKind, setUploadKind] = useState<WorkOrderAttachment["kind"]>("general");
  const [files, setFiles] = useState<FileList | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [resolveFiles, setResolveFiles] = useState<FileList | null>(null);
  const [resolveError, setResolveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [timerNow, setTimerNow] = useState(() => new Date().toISOString());

  async function loadDetail() {
    if (!id) {
      return;
    }

    const nextDetail = await api.workOrder(id);
    setDetail(nextDetail);
    setAssignedToId(nextDetail.assignedToId || "");
  }

  useEffect(() => {
    loadDetail().catch(console.error);
  }, [id]);

  useEffect(() => {
    const interval = window.setInterval(() => setTimerNow(new Date().toISOString()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!resolveDialogOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [resolveDialogOpen]);

  function updateDetailWithoutJump(update: (current: WorkOrderDetail) => WorkOrderDetail) {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    if (document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("motion-button")) {
      document.activeElement.blur();
    }
    setDetail((current) => (current ? update(current) : current));
    restoreScroll(scrollX, scrollY);
  }

  function mergeWorkOrder(workOrder: WorkOrder, extraAttachments: WorkOrderAttachment[] = []) {
    updateDetailWithoutJump((current) => ({
      ...current,
      ...workOrder,
      requester: current.requester,
      assignedTo: users.find((user) => user.id === workOrder.assignedToId) || null,
      activities: current.activities,
      attachments: [...extraAttachments, ...current.attachments]
    }));
    setAssignedToId(workOrder.assignedToId || "");
  }

  async function refreshDetailQuietly() {
    if (!id) {
      return;
    }

    const nextDetail = await api.workOrder(id);
    updateDetailWithoutJump(() => nextDetail);
    setAssignedToId(nextDetail.assignedToId || "");
  }

  const technicians = useMemo(() => users.filter((user) => user.role === "technician"), [users]);
  const canMaintain = currentUser ? ["technician", "executive", "admin"].includes(currentUser.role) : false;
  const canVerify =
    currentUser && detail
      ? currentUser.id === detail.requesterId || ["executive", "admin"].includes(currentUser.role)
      : false;
  const isRequesterOwner = Boolean(currentUser && detail && currentUser.id === detail.requesterId && currentUser.role === "requester");

  async function updateStatus(status: WorkOrderStatus, fallbackNote: string) {
    if (!detail || !currentUser) {
      return;
    }

    setBusy(true);
    setBusyAction(status);
    try {
      const updatedWorkOrder =
        status === "acknowledged" && currentUser.role === "technician"
          ? await api.claimWorkOrder(detail.id, {
              actorId: currentUser.id,
              note: note || fallbackNote
            })
          : await api.updateWorkOrderStatus(detail.id, {
              status,
              actorId: currentUser.id,
              note: note || fallbackNote,
              assignedToId: detail.assignedToId
            });
      if (status === "acknowledged" && currentUser.role === "technician") {
        navigator.vibrate?.([36, 18, 36]);
      }
      setNote("");
      setBusy(false);
      await waitForActionMotion();
      mergeWorkOrder(updatedWorkOrder);
      void refreshDetailQuietly().catch(console.error);
    } finally {
      setBusy(false);
      setBusyAction("");
    }
  }

  function openResolveDialog() {
    setResolveNote(note.trim());
    setResolveFiles(null);
    setResolveError("");
    setResolveDialogOpen(true);
  }

  async function submitResolve(event: FormEvent) {
    event.preventDefault();
    if (!detail || !currentUser) {
      return;
    }

    const repairSummary = resolveNote.trim();
    const completionPhotos = resolveFiles ? Array.from(resolveFiles) : [];

    if (!repairSummary) {
      setResolveError("Please write what was repaired or replaced before resolving.");
      return;
    }

    if (completionPhotos.length === 0) {
      setResolveError("Please upload at least one completion photo before resolving.");
      return;
    }

    setBusy(true);
    setBusyAction("resolved");
    setResolveError("");
    try {
      const uploadedAttachments = await api.uploadAttachments(detail.id, currentUser.id, "after", completionPhotos);
      const updatedWorkOrder = await api.updateWorkOrderStatus(detail.id, {
        status: "resolved",
        actorId: currentUser.id,
        note: repairSummary,
        assignedToId: detail.assignedToId
      });
      setNote("");
      setResolveNote("");
      setResolveFiles(null);
      setResolveDialogOpen(false);
      setBusy(false);
      await waitForActionMotion();
      mergeWorkOrder(updatedWorkOrder, uploadedAttachments);
      void refreshDetailQuietly().catch(console.error);
    } catch (error) {
      setResolveError(error instanceof Error ? error.message : "Unable to resolve this work order.");
    } finally {
      setBusy(false);
      setBusyAction("");
    }
  }

  async function assign(event: FormEvent) {
    event.preventDefault();
    if (!detail || !currentUser || !assignedToId) {
      return;
    }

    setBusy(true);
    setBusyAction("assign");
    try {
      const updatedWorkOrder = await api.assignWorkOrder(detail.id, assignedToId, currentUser.id, note);
      setNote("");
      setBusy(false);
      await waitForActionMotion();
      mergeWorkOrder(updatedWorkOrder);
      void refreshDetailQuietly().catch(console.error);
    } finally {
      setBusy(false);
      setBusyAction("");
    }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!detail || !currentUser || !comment.trim()) {
      return;
    }

    const activity = await api.addComment(detail.id, currentUser.id, comment);
    setComment("");
    updateDetailWithoutJump((current) => ({
      ...current,
      activities: [activity, ...current.activities] as WorkOrderActivity[]
    }));
    void refreshDetailQuietly().catch(console.error);
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!detail || !currentUser || !files || files.length === 0) {
      return;
    }

    setBusy(true);
    setBusyAction("upload");
    try {
      const uploadedAttachments = await api.uploadAttachments(detail.id, currentUser.id, uploadKind, files);
      setFiles(null);
      setBusy(false);
      await waitForActionMotion();
      updateDetailWithoutJump((current) => ({
        ...current,
        attachments: [...uploadedAttachments, ...current.attachments]
      }));
      void refreshDetailQuietly().catch(console.error);
    } finally {
      setBusy(false);
      setBusyAction("");
    }
  }

  if (!detail) {
    return <p className="quiet-line">Loading work order...</p>;
  }

  const displayWorkflow =
    detail.status === "returned"
      ? (["open", "acknowledged", "in_progress", "returned", "resolved", "closed"] as WorkOrderStatus[])
      : detail.status === "cancelled"
        ? (["open", "cancelled"] as WorkOrderStatus[])
        : workflowSteps;
  const workflowIndex = displayWorkflow.indexOf(detail.status);
  const actionLocked = busy || Boolean(busyAction);
  const createdAt = findActivityTime(detail.activities, "created") || detail.createdAt;
  const acknowledgedAt = findActivityTime(detail.activities, "acknowledged");
  const startedAt = findActivityTime(detail.activities, "started");
  const resolvedAt = findActivityTime(detail.activities, "resolved");
  const closedAt = findActivityTime(detail.activities, "closed");
  const terminalAt = closedAt || (detail.status === "cancelled" ? detail.updatedAt : null);
  const isAssignedToCurrentUser = currentUser ? detail.assignedToId === currentUser.id : false;
  const canStartRepair =
    ["acknowledged", "returned", "pending_material"].includes(detail.status) ||
    (detail.status === "open" && (currentUser?.role !== "technician" || isAssignedToCurrentUser));

  return (
    <section className="page-stack">
      <div className="work-order-command">
        <div>
          <p className="eyebrow">{detail.number}</p>
          <h1>{detail.title}</h1>
          <p>{detail.location} - {detail.machineName || detail.assetName}</p>
          <div className="command-badges">
            <StatusBadge status={detail.status} />
            <PriorityBadge priority={detail.priority} />
            <span>{workOrderTypeLabels[detail.type]}</span>
          </div>
        </div>
        <Link className="secondary-action" to="/work-orders">
          <ArrowLeft size={17} aria-hidden="true" />
          Back
        </Link>
      </div>

      <div className="workflow-strip">
        {displayWorkflow.map((step, index) => (
          <div
            key={step}
            className={`workflow-step ${index <= workflowIndex ? "done" : ""} ${step === detail.status ? "current" : ""}`}
          >
            <span>{index + 1}</span>
            <strong>{workOrderStatusLabels[step]}</strong>
          </div>
        ))}
      </div>

      <div className="timer-grid">
        <article className="timer-card primary">
          <TimerReset size={18} aria-hidden="true" />
          <span>Total open time</span>
          <strong>{formatDuration(createdAt, terminalAt || timerNow)}</strong>
        </article>
        <article className="timer-card">
          <Clock3 size={18} aria-hidden="true" />
          <span>Time to acknowledge</span>
          <strong>{acknowledgedAt ? formatDuration(createdAt, acknowledgedAt) : "Waiting"}</strong>
        </article>
        <article className="timer-card">
          <Wrench size={18} aria-hidden="true" />
          <span>Repair duration</span>
          <strong>{startedAt ? formatDuration(startedAt, resolvedAt || terminalAt || timerNow) : "Not started"}</strong>
        </article>
        <article className="timer-card">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>Verification wait</span>
          <strong>{resolvedAt ? formatDuration(resolvedAt, closedAt || timerNow) : "Not ready"}</strong>
        </article>
      </div>

      <div className="detail-layout">
        <div className="detail-main">
          <div className="section-panel detail-summary-panel">
            <div className="detail-heading">
              <div>
                <h2>Work Order Brief</h2>
                <span>{detail.number}</span>
              </div>
              <span>{formatDateTime(detail.createdAt)}</span>
            </div>
            <p className="detail-description">{detail.description}</p>
              <dl className="detail-grid">
                <div>
                  <dt>Machine</dt>
                  <dd>{detail.machineName || detail.assetName}</dd>
                </div>
                <div>
                  <dt>Section</dt>
                  <dd>{detail.location}</dd>
                </div>
                <div>
                  <dt>Reported by</dt>
                  <dd>{detail.reportedByName}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{detail.reportedByDepartment}</dd>
                </div>
                <div>
                  <dt>Work date</dt>
                  <dd>{formatDate(detail.workDate)}</dd>
                </div>
                <div>
                  <dt>Shift</dt>
                  <dd>{detail.shiftGroup}</dd>
                </div>
                <div>
                  <dt>Issue category</dt>
                  <dd>{detail.issueCategory?.name || "Other"}</dd>
                </div>
                <div>
                  <dt>Assigned</dt>
                  <dd>{detail.assignedTo?.name || "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Requester account</dt>
                  <dd>{detail.requester.name}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDateTime(detail.updatedAt)}</dd>
                </div>
              </dl>
          </div>

          <div className="section-panel">
            <div className="section-header">
              <div>
                <h2>Timeline</h2>
                <span>{detail.activities.length} updates</span>
              </div>
            </div>
            <div className="timeline">
              {detail.activities.map((activity, index) => (
                <div key={activity.id} className={`timeline-item ${index === 0 ? "timeline-latest" : ""}`}>
                  <div className="timeline-dot" />
                  <div>
                    <strong>{activity.message}</strong>
                    <span>
                      {userName(users, activity.actorId)} - {formatDateTime(activity.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="section-panel">
            <div className="section-header">
              <div>
                <h2>Images</h2>
                <span>{detail.attachments.length} uploaded</span>
              </div>
            </div>
            <div className="attachment-grid">
              {detail.attachments.map((attachment) => (
                <a key={attachment.id} className="attachment-tile" href={mediaUrl(attachment.url)} target="_blank" rel="noreferrer">
                  <img src={mediaUrl(attachment.url)} alt={attachment.originalName} />
                  <span>{attachment.kind.replace("_", " ")}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        <aside className="detail-side">
          {isRequesterOwner ? (
            <div className={`section-panel verification-panel ${detail.status === "resolved" ? "ready" : ""}`}>
              <h2>Requester Verification</h2>
              {detail.status === "resolved" ? (
                <>
                  <p>Maintenance marked this work order as resolved. Verify the result, then close it or return it for follow-up.</p>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Verification note (optional)" />
                  <div className="button-stack">
                    <ActionButton
                      type="button"
                      icon={CheckCircle2}
                      tone="resolve"
                      busy={busy && busyAction === "closed"}
                      busyLabel="Closing..."
                      disabled={actionLocked}
                      onClick={() => updateStatus("closed", "Requester verified and closed the work order.")}
                    >
                      Verify & Close
                    </ActionButton>
                    <ActionButton
                      type="button"
                      icon={RotateCcw}
                      tone="return"
                      busy={busy && busyAction === "returned"}
                      busyLabel="Returning..."
                      disabled={actionLocked}
                      onClick={() => updateStatus("returned", "Requester returned the work order for follow-up.")}
                    >
                      Return to Maintenance
                    </ActionButton>
                  </div>
                </>
              ) : (
                <p>Verification will appear here after maintenance resolves this work order. Current status: {workOrderStatusLabels[detail.status]}.</p>
              )}
            </div>
          ) : null}

          {canMaintain ? (
            <div className="section-panel action-panel">
              <h2>Maintenance Actions</h2>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Update note" />

              <div className="button-stack">
                {detail.status === "open" ? (
                  <ActionButton
                    type="button"
                    icon={ShieldCheck}
                    tone="acknowledge"
                    busy={busy && busyAction === "acknowledged"}
                    busyLabel="Acknowledging..."
                    disabled={actionLocked}
                    onClick={() => updateStatus("acknowledged", "Acknowledged by maintenance.")}
                  >
                    Acknowledge
                  </ActionButton>
                ) : null}
                {canStartRepair ? (
                  <ActionButton
                    type="button"
                    icon={Wrench}
                    tone="start"
                    busy={busy && busyAction === "in_progress"}
                    busyLabel="Starting..."
                    disabled={actionLocked}
                    onClick={() => updateStatus("in_progress", "Repair started.")}
                  >
                    Start Repair
                  </ActionButton>
                ) : null}
                {["acknowledged", "in_progress", "returned"].includes(detail.status) ? (
                  <ActionButton
                    type="button"
                    icon={PackageOpen}
                    tone="material"
                    busy={busy && busyAction === "pending_material"}
                    busyLabel="Waiting..."
                    disabled={actionLocked}
                    onClick={() => updateStatus("pending_material", "Waiting for material.")}
                  >
                    Pending Material
                  </ActionButton>
                ) : null}
                {["acknowledged", "in_progress", "pending_material", "returned"].includes(detail.status) ? (
                  <ActionButton
                    type="button"
                    icon={CheckCircle2}
                    tone="resolve"
                    disabled={actionLocked}
                    onClick={openResolveDialog}
                  >
                    Resolve
                  </ActionButton>
                ) : null}
              </div>
            </div>
          ) : null}

          {canVerify && !isRequesterOwner && detail.status === "resolved" ? (
            <div className="section-panel verification-panel ready">
              <h2>Requester Verification</h2>
              <p>Review the completed work and close it, or return it to maintenance for follow-up.</p>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Verification note (optional)" />
              <div className="button-stack">
                <ActionButton
                  type="button"
                  icon={CheckCircle2}
                  tone="resolve"
                  busy={busy && busyAction === "closed"}
                  busyLabel="Closing..."
                  disabled={actionLocked}
                  onClick={() => updateStatus("closed", "Requester verified and closed the work order.")}
                >
                  Close
                </ActionButton>
                <ActionButton
                  type="button"
                  icon={RotateCcw}
                  tone="return"
                  busy={busy && busyAction === "returned"}
                  busyLabel="Returning..."
                  disabled={actionLocked}
                  onClick={() => updateStatus("returned", "Requester returned the work order for follow-up.")}
                >
                  Return
                </ActionButton>
              </div>
            </div>
          ) : null}

          {canMaintain ? (
            <form className="section-panel action-panel" onSubmit={assign}>
              <h2>Assignment</h2>
              <select value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)}>
                <option value="">Unassigned</option>
                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name}
                  </option>
                ))}
              </select>
              <ActionButton type="submit" tone="assign" busy={busy && busyAction === "assign"} busyLabel="Assigning..." disabled={actionLocked || !assignedToId}>
                Assign
              </ActionButton>
            </form>
          ) : null}

          <form className="section-panel action-panel" onSubmit={addComment}>
            <h2>Comment</h2>
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} placeholder="Add comment" />
            <button type="submit" disabled={!comment.trim()}>
              <MessageSquare size={17} aria-hidden="true" />
              Comment
            </button>
          </form>

          <form className="section-panel action-panel" onSubmit={upload}>
            <h2>Upload Images</h2>
            <select value={uploadKind} onChange={(event) => setUploadKind(event.target.value as WorkOrderAttachment["kind"])}>
              <option value="general">General</option>
              <option value="issue">Issue</option>
              <option value="before">Before</option>
              <option value="progress">Progress</option>
              <option value="after">After</option>
              <option value="return_evidence">Return evidence</option>
            </select>
            <input type="file" accept="image/*" multiple onChange={(event) => setFiles(event.target.files)} />
            <ActionButton type="submit" icon={ImagePlus} tone="upload" busy={busy && busyAction === "upload"} busyLabel="Uploading..." disabled={actionLocked || !files || files.length === 0}>
              Upload
            </ActionButton>
          </form>
        </aside>
      </div>

      {resolveDialogOpen ? createPortal(
        <div className="modal-backdrop">
          <form className="resolve-modal" role="dialog" aria-modal="true" aria-labelledby="resolve-modal-title" onSubmit={submitResolve}>
            <div className="resolve-modal-header">
              <span className="resolve-modal-icon">
                <CheckCircle2 size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Completion evidence</p>
                <h2 id="resolve-modal-title">Resolve work order</h2>
              </div>
            </div>

            <p className="resolve-modal-copy">
              Add the repair summary and completion photo before this work order goes to requester verification.
            </p>

            <label className="resolve-field">
              Repair / replacement summary
              <textarea
                value={resolveNote}
                onChange={(event) => setResolveNote(event.target.value)}
                rows={5}
                placeholder="Example: Replaced leaking hydraulic hose and tested pressure. Machine running normally."
                required
              />
            </label>

            <label className="resolve-field resolve-upload-box">
              Completion photo
              <input type="file" accept="image/*" multiple required onChange={(event) => setResolveFiles(event.target.files)} />
              <span>{resolveFiles && resolveFiles.length > 0 ? `${resolveFiles.length} photo selected` : "Upload at least one after-repair photo"}</span>
            </label>

            {resolveError ? <p className="error-line">{resolveError}</p> : null}

            <div className="modal-actions">
              <button type="button" className="modal-secondary" disabled={busy} onClick={() => setResolveDialogOpen(false)}>
                Cancel
              </button>
              <ActionButton
                type="submit"
                icon={CheckCircle2}
                tone="resolve"
                busy={busy && busyAction === "resolved"}
                busyLabel="Resolving..."
                disabled={busy || !resolveNote.trim() || !resolveFiles || resolveFiles.length === 0}
              >
                Confirm Resolve
              </ActionButton>
            </div>
          </form>
        </div>,
        document.body
      ) : null}
    </section>
  );
}
