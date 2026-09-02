import {
  AlertTriangle, Check, CheckCircle2, ClipboardCopy, Clock3, ExternalLink, Home, Image, RefreshCcw,
  Send, Share2, ShieldCheck, Wrench
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { GuestWorkOrderTracking, WorkOrderStatus } from "@sugi-cmms/shared";
import { workOrderStatusLabels } from "@sugi-cmms/shared";
import { api, mediaUrl } from "../api/client";
import { StatusBadge } from "../components/Badges";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import { formatDateTime } from "../utils/format";

const trackingSteps = [
  { label: "Submitted", Icon: Send },
  { label: "In maintenance", Icon: Wrench },
  { label: "Ready to verify", Icon: ShieldCheck },
  { label: "Closed", Icon: CheckCircle2 }
];

function statusStage(status: WorkOrderStatus) {
  if (status === "closed") return 3;
  if (status === "resolved") return 2;
  if (["acknowledged", "in_progress", "pending_material", "returned"].includes(status)) return 1;
  return 0;
}

function trackerHeadline(status: WorkOrderStatus) {
  if (status === "open") return "Your request has been submitted";
  if (status === "acknowledged") return "Maintenance accepted your request";
  if (status === "in_progress") return "Repair work is in progress";
  if (status === "pending_material") return "Waiting for material or parts";
  if (status === "resolved") return "Repair completed — your verification is needed";
  if (status === "returned") return "Returned to maintenance for follow-up";
  if (status === "closed") return "Work order verified and closed";
  return "This work order was cancelled";
}

export function GuestTrackingPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const justCreated = searchParams.get("created") === "1";
  const [tracking, setTracking] = useState<GuestWorkOrderTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [action, setAction] = useState<"closed" | "returned" | "">("");
  const [copied, setCopied] = useState(false);

  async function loadTracking() {
    if (!id || !token) {
      setError("This tracking link is incomplete.");
      setLoading(false);
      return;
    }
    try {
      setTracking(await api.guestWorkOrderTracking(id, token));
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to open this tracking link.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTracking(); }, [id, token]);
  useLiveRefresh(["work-orders"], loadTracking, { enabled: Boolean(id && token), fallbackMs: 10000 });

  const shareUrl = useMemo(() => {
    if (!id || !token) return "";
    return `${window.location.origin}/requester/track/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;
  }, [id, token]);

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareLink() {
    if (navigator.share && tracking) {
      await navigator.share({ title: tracking.workOrder.number, text: "Track this SUGI CMMS work order", url: shareUrl });
      return;
    }
    await copyLink();
  }

  async function verify(status: "closed" | "returned") {
    if (!tracking) return;
    if (status === "returned" && !note.trim()) {
      setError("Add a short reason before returning the work order to maintenance.");
      return;
    }
    setAction(status);
    setError("");
    try {
      setTracking(await api.verifyGuestWorkOrder(id, token, status, note));
      setNote("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save your verification.");
    } finally {
      setAction("");
    }
  }

  if (loading) return <div className="guest-tracker-loading"><Clock3 size={22} />Opening your tracker…</div>;
  if (!tracking) {
    return <main className="guest-tracker-error"><AlertTriangle size={30} /><h1>Tracking link unavailable</h1><p>{error}</p><Link to="/requester"><Send size={17} />Create a new request</Link></main>;
  }

  const { workOrder, activities } = tracking;
  const stage = statusStage(workOrder.status);
  const photos = workOrder.attachments.filter((attachment) => ["issue", "after", "return_evidence"].includes(attachment.kind));

  return <div className="guest-tracker-shell">
    <header className="guest-tracker-topbar">
      <Link to="/requester" className="guest-tracker-brand"><span><img src="/brand/sugi_symbol.png" alt="" /></span><div><small>SUGI CMMS</small><strong>Guest Work Order Tracker</strong></div></Link>
      <Link to="/requester"><Home size={16} />New request</Link>
    </header>

    <main className="guest-tracker-main">
      {justCreated ? <section className="guest-created-success"><span><Check size={28} /></span><div><p>Submitted successfully</p><h1>{workOrder.number} has been created</h1><small>Save this private link. You will need it to track and verify this work order.</small></div></section> : null}
      {error ? <div className="requester-app-toast error"><RefreshCcw size={18} />{error}</div> : null}

      <section className={`guest-progress-card status-${workOrder.status}`}>
        <div className="guest-progress-heading"><div><p>{workOrder.number}</p><h1>{trackerHeadline(workOrder.status)}</h1><span>Last updated {formatDateTime(workOrder.updatedAt)}</span></div><StatusBadge status={workOrder.status} /></div>
        <div className="guest-progress-track" style={{ "--tracker-progress": `${(stage / (trackingSteps.length - 1)) * 100}%` } as React.CSSProperties}>
          <div className="guest-progress-line"><span /></div>
          {trackingSteps.map(({ label, Icon }, index) => <div className={`guest-progress-step ${index <= stage ? "done" : ""} ${index === stage ? "current" : ""}`} key={label}><span>{index < stage || workOrder.status === "closed" ? <Check size={14} /> : <Icon size={15} />}</span><strong>{label}</strong></div>)}
        </div>
        {workOrder.status === "cancelled" ? <p className="guest-cancelled-note">This request was cancelled. Contact maintenance if you still need assistance.</p> : null}
      </section>

      <section className="guest-private-link-card"><div><ShieldCheck size={20} /><span><strong>Your private tracking link</strong><small>Anyone with this link can view and verify this guest request.</small></span></div><div><button type="button" onClick={copyLink}>{copied ? <Check size={16} /> : <ClipboardCopy size={16} />}{copied ? "Copied" : "Copy link"}</button><button type="button" onClick={shareLink}><Share2 size={16} />Share</button></div></section>

      <div className="guest-tracker-layout">
        <div className="guest-tracker-content">
          <section className="guest-tracker-panel guest-work-order-summary"><header><div><p>Request details</p><h2>{workOrder.title}</h2></div><span className={`priority-pill priority-${workOrder.priority}`}>{workOrder.priority}</span></header><p>{workOrder.issueDescription}</p><dl><div><dt>Machine / place</dt><dd>{workOrder.machineName}</dd></div><div><dt>Section</dt><dd>{workOrder.sectionName}</dd></div><div><dt>Area</dt><dd>{workOrder.area}</dd></div><div><dt>Issue</dt><dd>{workOrder.issueCategoryName}</dd></div><div><dt>Assigned to</dt><dd>{workOrder.assignedToName}</dd></div><div><dt>Reported by</dt><dd>{workOrder.reportedByName}</dd></div></dl></section>

          {workOrder.completionNote ? <section className="guest-tracker-panel guest-completion-note"><CheckCircle2 size={22} /><div><p>Maintenance completion note</p><strong>{workOrder.completionNote}</strong></div></section> : null}

          {photos.length ? <section className="guest-tracker-panel guest-tracker-photos"><header><div><p>Evidence</p><h2>Work order photos</h2></div><Image size={20} /></header><div>{photos.map((photo) => <a href={mediaUrl(photo.url)} target="_blank" rel="noreferrer" key={photo.id}><img src={mediaUrl(photo.url)} alt={photo.originalName} /><span>{photo.kind === "issue" ? "Issue" : photo.kind === "after" ? "Completed" : "Returned"}<ExternalLink size={11} /></span></a>)}</div></section> : null}

          <section className="guest-tracker-panel guest-tracker-timeline"><header><div><p>Live history</p><h2>Status updates</h2></div><Clock3 size={20} /></header><div>{activities.map((activity, index) => <article key={`${activity.action}-${activity.createdAt}`}><span className={index === 0 ? "latest" : ""} /><div><strong>{activity.message}</strong><small>{formatDateTime(activity.createdAt)}</small></div></article>)}</div></section>
        </div>

        <aside>
          {workOrder.status === "resolved" ? <section className="guest-verify-card"><span><ShieldCheck size={25} /></span><p>Your decision</p><h2>Is the work completed?</h2><small>Review the maintenance note and completion photo before closing. If something is still wrong, return it with a reason.</small><label>Verification note<textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional when closing; required when returning" /></label><button className="verify" type="button" disabled={Boolean(action)} onClick={() => verify("closed")}><CheckCircle2 size={17} />{action === "closed" ? "Closing…" : "Verify & close"}</button><button className="return" type="button" disabled={Boolean(action)} onClick={() => verify("returned")}><RefreshCcw size={17} />{action === "returned" ? "Returning…" : "Return to maintenance"}</button></section> : <section className="guest-waiting-card"><Clock3 size={24} /><p>{workOrder.status === "closed" ? "Verification complete" : "No action needed yet"}</p><h2>{workOrder.status === "closed" ? "Thank you for verifying" : workOrderStatusLabels[workOrder.status]}</h2><small>{workOrder.status === "closed" ? "This work order is complete. The tracking link remains available as your record." : "This page updates automatically. Return using your private link at any time."}</small></section>}
        </aside>
      </div>
    </main>
  </div>;
}
