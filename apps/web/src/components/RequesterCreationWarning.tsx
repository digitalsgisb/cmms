import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export function RequesterCreationWarning({ count, onVerify, sectionLabel }: { count: number; onVerify?: () => void; sectionLabel?: string }) {
  return <section className="requester-creation-warning" role="alert">
    <AlertTriangle size={32} aria-hidden="true" />
    <h2>Verify completed work before creating a new work order</h2>
    <p>{sectionLabel ? `${sectionLabel} has` : "Your account has"} <strong>{count} resolved work order{count === 1 ? "" : "s"}</strong> awaiting verification. New work orders{sectionLabel ? ` for ${sectionLabel}` : ""} are blocked until you review them all.</p>
    <p>Check each repair. Choose <strong>Work is OK — Close</strong> if it is fixed, or <strong>Still Problem — Send Back</strong> if further work is needed.</p>
    {onVerify ? <button className="primary-action" type="button" onClick={onVerify}><ShieldCheck size={18} />Go to Verify ({count})</button> : <Link className="primary-action" to="/report-issue?view=verify"><ShieldCheck size={18} />Go to Verify ({count})</Link>}
  </section>;
}
