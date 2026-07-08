import { AlertTriangle, CheckCircle2, ChevronRight, ImagePlus, PackageOpen, ShieldCheck, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate } from "react-router-dom";
import type { WorkOrder, WorkOrderStatus } from "@sugi-cmms/shared";
import { api } from "../api/client";
import { PriorityBadge, StatusBadge } from "../components/Badges";
import { ActionButton } from "../components/ActionButton";
import { EmptyState } from "../components/EmptyState";
import { useCurrentUser } from "../state/UserContext";
import { formatDateTime } from "../utils/format";

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

function promoteWorkOrder(current: WorkOrder[], updatedWorkOrder: WorkOrder) {
  return [updatedWorkOrder, ...current.filter((workOrder) => workOrder.id !== updatedWorkOrder.id)];
}

function vibrateAccepted() {
  navigator.vibrate?.([36, 18, 36]);
}

export function TechnicianPage() {
  const { currentUser } = useCurrentUser();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [busyId, setBusyId] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recentlyUpdatedId, setRecentlyUpdatedId] = useState("");
  const [recentlyClaimedId, setRecentlyClaimedId] = useState("");
  const [queueError, setQueueError] = useState("");
  const [resolveTarget, setResolveTarget] = useState<WorkOrder | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolveFiles, setResolveFiles] = useState<FileList | null>(null);
  const [resolveError, setResolveError] = useState("");

  async function loadWorkOrders() {
    setWorkOrders(await api.workOrders());
  }

  useEffect(() => {
    loadWorkOrders().catch(console.error);
  }, []);

  useEffect(() => {
    if (!resolveTarget) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [resolveTarget]);

  const queue = useMemo(() => {
    return workOrders.filter((workOrder) => {
      if (["resolved", "closed", "cancelled"].includes(workOrder.status)) {
        return false;
      }

      if (currentUser?.role === "technician") {
        const isAvailableOpenJob = workOrder.status === "open" && (!workOrder.assignedToId || workOrder.assignedToId === currentUser.id);
        return isAvailableOpenJob || workOrder.assignedToId === currentUser.id;
      }

      return true;
    });
  }, [workOrders, currentUser]);
  const queueCounts = useMemo(() => {
    return {
      newJobs: queue.filter((workOrder) => workOrder.status === "open").length,
      assigned: currentUser ? queue.filter((workOrder) => workOrder.assignedToId === currentUser.id).length : 0,
      repairing: queue.filter((workOrder) => workOrder.status === "in_progress").length,
      waitingParts: queue.filter((workOrder) => workOrder.status === "pending_material").length
    };
  }, [queue, currentUser?.id]);

  if (currentUser?.role === "requester") {
    return <Navigate to="/work-orders" replace />;
  }

  function mergeWorkOrdersPreservingOrder(current: WorkOrder[], incoming: WorkOrder[]) {
    const incomingById = new Map(incoming.map((workOrder) => [workOrder.id, workOrder]));
    const seen = new Set<string>();
    const merged = current.map((workOrder) => {
      seen.add(workOrder.id);
      return incomingById.get(workOrder.id) || workOrder;
    });
    const newWorkOrders = incoming.filter((workOrder) => !seen.has(workOrder.id));
    return [...merged, ...newWorkOrders];
  }

  function markRecentlyUpdated(id: string) {
    setRecentlyUpdatedId(id);
    window.setTimeout(() => {
      setRecentlyUpdatedId((current) => (current === id ? "" : current));
    }, 900);
  }

  function markRecentlyClaimed(id: string) {
    setRecentlyClaimedId(id);
    window.setTimeout(() => {
      setRecentlyClaimedId((current) => (current === id ? "" : current));
    }, 2600);
  }

  async function claimWorkOrder(workOrder: WorkOrder) {
    if (!currentUser) {
      return;
    }

    setBusyId(workOrder.id);
    setBusyAction("claim");
    setSubmitting(true);
    setQueueError("");
    try {
      const updatedWorkOrder = await api.claimWorkOrder(workOrder.id, {
        actorId: currentUser.id,
        note: "Accepted from technician queue."
      });
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      vibrateAccepted();
      setWorkOrders((current) => promoteWorkOrder(current, updatedWorkOrder));
      markRecentlyUpdated(updatedWorkOrder.id);
      markRecentlyClaimed(updatedWorkOrder.id);
      restoreScroll(scrollX, scrollY);
      api.workOrders()
        .then((nextWorkOrders) => {
          const nextScrollX = window.scrollX;
          const nextScrollY = window.scrollY;
          setWorkOrders((current) => mergeWorkOrdersPreservingOrder(current, nextWorkOrders));
          restoreScroll(nextScrollX, nextScrollY);
        })
        .catch(console.error);
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "Unable to accept this work order.");
      void loadWorkOrders().catch(console.error);
    } finally {
      setSubmitting(false);
      setBusyId("");
      setBusyAction("");
    }
  }

  async function quickAction(workOrder: WorkOrder, status: WorkOrderStatus, note: string) {
    if (!currentUser) {
      return;
    }

    setBusyId(workOrder.id);
    setBusyAction(status);
    setSubmitting(true);
    setQueueError("");
    try {
      const assignedToId = currentUser.role === "technician" ? workOrder.assignedToId || currentUser.id : workOrder.assignedToId;
      const updatedWorkOrder = await api.updateWorkOrderStatus(workOrder.id, {
        status,
        actorId: currentUser.id,
        note,
        assignedToId
      });
      setSubmitting(false);
      await waitForActionMotion();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      if (document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("motion-button")) {
        document.activeElement.blur();
      }
      setWorkOrders((current) => current.map((item) => (item.id === updatedWorkOrder.id ? updatedWorkOrder : item)));
      markRecentlyUpdated(updatedWorkOrder.id);
      restoreScroll(scrollX, scrollY);
      api.workOrders()
        .then((nextWorkOrders) => {
          const nextScrollX = window.scrollX;
          const nextScrollY = window.scrollY;
          if (document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("motion-button")) {
            document.activeElement.blur();
          }
          setWorkOrders((current) => mergeWorkOrdersPreservingOrder(current, nextWorkOrders));
          restoreScroll(nextScrollX, nextScrollY);
        })
        .catch(console.error);
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "Unable to update this work order.");
    } finally {
      setSubmitting(false);
      setBusyId("");
      setBusyAction("");
    }
  }

  function openResolveDialog(workOrder: WorkOrder) {
    setResolveTarget(workOrder);
    setResolveNote("");
    setResolveFiles(null);
    setResolveError("");
  }

  async function submitResolve(event: FormEvent) {
    event.preventDefault();
    if (!currentUser || !resolveTarget) {
      return;
    }

    const repairSummary = resolveNote.trim();
    const completionPhotos = resolveFiles ? Array.from(resolveFiles) : [];

    if (!repairSummary) {
      setResolveError("Please add a short repair remark before resolving.");
      return;
    }

    if (completionPhotos.length === 0) {
      setResolveError("Please upload at least one completion photo before resolving.");
      return;
    }

    setBusyId(resolveTarget.id);
    setBusyAction("resolved");
    setSubmitting(true);
    setResolveError("");
    try {
      await api.uploadAttachments(resolveTarget.id, currentUser.id, "after", completionPhotos);
      const updatedWorkOrder = await api.updateWorkOrderStatus(resolveTarget.id, {
        status: "resolved",
        actorId: currentUser.id,
        note: repairSummary,
        assignedToId: resolveTarget.assignedToId
      });
      setResolveTarget(null);
      setResolveNote("");
      setResolveFiles(null);
      setSubmitting(false);
      await waitForActionMotion();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      if (document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("motion-button")) {
        document.activeElement.blur();
      }
      setWorkOrders((current) => current.map((item) => (item.id === updatedWorkOrder.id ? updatedWorkOrder : item)));
      markRecentlyUpdated(updatedWorkOrder.id);
      restoreScroll(scrollX, scrollY);
      api.workOrders()
        .then((nextWorkOrders) => {
          const nextScrollX = window.scrollX;
          const nextScrollY = window.scrollY;
          setWorkOrders((current) => mergeWorkOrdersPreservingOrder(current, nextWorkOrders));
          restoreScroll(nextScrollX, nextScrollY);
        })
        .catch(console.error);
    } catch (error) {
      setResolveError(error instanceof Error ? error.message : "Unable to resolve this work order.");
    } finally {
      setSubmitting(false);
      setBusyId("");
      setBusyAction("");
    }
  }

  return (
    <section className="page-stack technician-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Mobile-first</p>
          <h1>Technician Queue</h1>
        </div>
      </div>

      <div className="technician-focus-strip">
        <article>
          <AlertTriangle size={18} aria-hidden="true" />
          <span>New</span>
          <strong>{queueCounts.newJobs}</strong>
        </article>
        <article>
          <ShieldCheck size={18} aria-hidden="true" />
          <span>Mine</span>
          <strong>{queueCounts.assigned}</strong>
        </article>
        <article>
          <Wrench size={18} aria-hidden="true" />
          <span>Repairing</span>
          <strong>{queueCounts.repairing}</strong>
        </article>
        <article>
          <PackageOpen size={18} aria-hidden="true" />
          <span>Parts</span>
          <strong>{queueCounts.waitingParts}</strong>
        </article>
      </div>

      {queueError ? <p className="error-line">{queueError}</p> : null}

      {queue.length === 0 ? (
        <EmptyState icon={Wrench} title="No active jobs" text="New work orders and assigned jobs will appear here." />
      ) : (
        <div className="technician-list">
          {queue.map((workOrder) => {
            const isMine = currentUser ? workOrder.assignedToId === currentUser.id : false;
            const isClaimable = currentUser?.role === "technician" && workOrder.status === "open" && !workOrder.assignedToId;
            const canStart = ["acknowledged", "returned", "pending_material"].includes(workOrder.status) || (workOrder.status === "open" && isMine);
            const cardClasses = [
              "technician-card",
              isClaimable ? "is-claimable" : "",
              recentlyUpdatedId === workOrder.id ? "is-updated" : "",
              recentlyClaimedId === workOrder.id ? "is-claimed" : ""
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <article className={cardClasses} key={workOrder.id}>
                <div className="card-topline">
                  <strong>{workOrder.number}</strong>
                  <span className="technician-card-badges">
                    {isMine ? <span className="technician-owner-chip">Mine</span> : null}
                    <StatusBadge status={workOrder.status} />
                  </span>
                </div>
                <h2>{workOrder.title}</h2>
                <p>{workOrder.location} - {workOrder.machineName || workOrder.assetName}</p>
                <div className="card-footer">
                  <PriorityBadge priority={workOrder.priority} />
                  <time>{formatDateTime(workOrder.updatedAt)}</time>
                </div>
                {isClaimable ? (
                  <SwipeToAccept
                    busy={submitting && busyId === workOrder.id && busyAction === "claim"}
                    disabled={Boolean(busyId) && busyId !== workOrder.id}
                    onAccept={() => claimWorkOrder(workOrder)}
                  />
                ) : (
                  <div className="quick-actions">
                    {canStart ? (
                      <ActionButton
                        type="button"
                        icon={Wrench}
                        tone="start"
                        busy={submitting && busyId === workOrder.id && busyAction === "in_progress"}
                        busyLabel="Starting..."
                        disabled={Boolean(busyId)}
                        onClick={() => quickAction(workOrder, "in_progress", "Repair started from technician queue.")}
                      >
                        Start
                      </ActionButton>
                    ) : null}
                    {["acknowledged", "in_progress", "returned"].includes(workOrder.status) ? (
                      <ActionButton
                        type="button"
                        icon={PackageOpen}
                        tone="material"
                        busy={submitting && busyId === workOrder.id && busyAction === "pending_material"}
                        busyLabel="Waiting..."
                        disabled={Boolean(busyId)}
                        onClick={() => quickAction(workOrder, "pending_material", "Waiting for parts or material.")}
                      >
                        Pending
                      </ActionButton>
                    ) : null}
                    {["acknowledged", "in_progress", "pending_material", "returned"].includes(workOrder.status) ? (
                      <ActionButton
                        type="button"
                        icon={CheckCircle2}
                        tone="resolve"
                        busy={submitting && busyId === workOrder.id && busyAction === "resolved"}
                        busyLabel="Resolving..."
                        disabled={Boolean(busyId)}
                        onClick={() => openResolveDialog(workOrder)}
                      >
                        Resolve
                      </ActionButton>
                    ) : null}
                  </div>
                )}
                <Link to={`/work-orders/${workOrder.id}`}>Open details</Link>
              </article>
            );
          })}
        </div>
      )}

      {resolveTarget ? createPortal(
        <div className="modal-backdrop">
          <form className="resolve-modal" role="dialog" aria-modal="true" aria-labelledby="technician-resolve-title" onSubmit={submitResolve}>
            <div className="resolve-modal-header">
              <span className="resolve-modal-icon">
                <CheckCircle2 size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">{resolveTarget.number}</p>
                <h2 id="technician-resolve-title">Resolve from queue</h2>
              </div>
            </div>

            <p className="resolve-modal-copy">
              Upload the completion photo and add a short repair remark before this work order goes to requester verification.
            </p>

            <label className="resolve-field">
              Short repair remarks
              <textarea
                value={resolveNote}
                onChange={(event) => setResolveNote(event.target.value)}
                rows={4}
                placeholder="Example: Replaced leaking hose and tested normal operation."
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
              <button type="button" className="modal-secondary" disabled={submitting} onClick={() => setResolveTarget(null)}>
                Cancel
              </button>
              <ActionButton
                type="submit"
                icon={ImagePlus}
                tone="resolve"
                busy={submitting && busyAction === "resolved"}
                busyLabel="Resolving..."
                disabled={submitting || !resolveNote.trim() || !resolveFiles || resolveFiles.length === 0}
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

type SwipeToAcceptProps = {
  busy: boolean;
  disabled: boolean;
  onAccept: () => void;
};

function SwipeToAccept({ busy, disabled, onAccept }: SwipeToAcceptProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    pointerId: -1,
    startX: 0,
    startDragX: 0,
    currentX: 0,
    maxDrag: 0,
    accepted: false
  });
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const unavailable = disabled || busy;

  function getMaxDrag() {
    const width = trackRef.current?.clientWidth || 0;
    return Math.max(0, width - 62);
  }

  function setSwipeX(nextX: number) {
    dragRef.current.currentX = nextX;
    setDragX(nextX);
  }

  function resetSwipe() {
    dragRef.current.pointerId = -1;
    dragRef.current.startX = 0;
    dragRef.current.startDragX = 0;
    dragRef.current.currentX = 0;
    dragRef.current.maxDrag = getMaxDrag();
    dragRef.current.accepted = false;
    setDragX(0);
    setIsDragging(false);
  }

  function accept() {
    if (unavailable || dragRef.current.accepted) {
      return;
    }

    dragRef.current.accepted = true;
    setSwipeX(dragRef.current.maxDrag || getMaxDrag());
    setIsDragging(false);
    onAccept();
  }

  useEffect(() => {
    if (!busy) {
      resetSwipe();
    }
  }, [busy]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (unavailable) {
      return;
    }

    dragRef.current.pointerId = event.pointerId;
    dragRef.current.startX = event.clientX;
    dragRef.current.startDragX = dragRef.current.currentX;
    dragRef.current.maxDrag = getMaxDrag();
    dragRef.current.accepted = false;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (unavailable || drag.pointerId !== event.pointerId || drag.accepted) {
      return;
    }

    const nextX = Math.min(drag.maxDrag, Math.max(0, drag.startDragX + event.clientX - drag.startX));
    setSwipeX(nextX);

    if (drag.maxDrag > 0 && nextX >= drag.maxDrag * 0.74) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      accept();
    }
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId || drag.accepted) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.currentX >= drag.maxDrag * 0.62) {
      accept();
      return;
    }

    resetSwipe();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (unavailable || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    dragRef.current.maxDrag = getMaxDrag();
    dragRef.current.accepted = false;
    accept();
  }

  return (
    <div
      ref={trackRef}
      className={`swipe-accept ${isDragging ? "is-dragging" : ""} ${busy ? "is-busy" : ""} ${disabled ? "is-disabled" : ""}`}
      role="button"
      tabIndex={unavailable ? -1 : 0}
      aria-disabled={unavailable}
      aria-label="Swipe to accept work order"
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <span className="swipe-accept-fill" style={{ width: `${dragX + 58}px` }} />
      <span className="swipe-accept-label">
        <ShieldCheck size={17} aria-hidden="true" />
        {busy ? "Accepting..." : "Swipe to accept"}
      </span>
      <span className="swipe-accept-handle" style={{ transform: `translateX(${dragX}px)` }}>
        <ChevronRight size={22} aria-hidden="true" />
      </span>
    </div>
  );
}
