import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Mail, RefreshCw, Sparkles } from "lucide-react";
import type { WeeklyReport, WeeklyReportHistory } from "@sugi-cmms/shared";
import { api } from "../api/client";
import "./weekly-management-report.css";

export function WeeklyManagementReport() {
  const [week, setWeek] = useState("");
  const [current, setCurrent] = useState(true);
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [history, setHistory] = useState<WeeklyReportHistory[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmedNotSent, setConfirmedNotSent] = useState(false);
  const version = useRef(0);
  useEffect(() => () => { version.current++; }, []);
  const loadHistory = useCallback(async () => { setHistory(await api.weeklyReportHistory()); }, []);
  useEffect(() => { void loadHistory().catch((e) => setError(e.message)); }, [loadHistory]);
  useEffect(() => {
    if (!report?.id || report.delivery !== "sending" || busy) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void api.weeklyReport(report.id!).then((next) => {
        if (cancelled) return;
        setReport(next);
        if (next.delivery !== "sending") void loadHistory().catch(() => {});
      }).catch(() => {});
    }, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [report?.id, report?.delivery, busy, loadHistory]);
  async function run(action: "preview" | "generate" | "open" | "reset" | "send", id?: string) {
    const ticket = ++version.current;
    setBusy(action); setError("");
    try {
      const next = action === "preview" ? await api.weeklyReportPreview(week || undefined, current)
        : action === "generate" ? current ? await api.generateCurrentReport() : await api.generateWeeklyReport(week || undefined, Boolean(report?.id && report.delivery === "draft"))
        : action === "send" ? await api.sendWeeklyReport(id!)
        : action === "reset" ? await api.resetWeeklyDelivery(id!) : await api.weeklyReport(id!);
      if (version.current !== ticket) return;
      setReport(next);
      if (action === "open") { setCurrent(next.facts.periodMode === "week-to-date"); setWeek(new Date(Date.parse(next.facts.start) + 8 * 3_600_000).toISOString().slice(0, 10)); }
      setConfirmedNotSent(false); await loadHistory();
    } catch (e) { if (version.current === ticket) setError(e instanceof Error ? e.message : "Unable to prepare the report."); }
    finally { if (version.current === ticket) setBusy(""); }
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([report.html], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `cmms-weekly-${report.facts.start.slice(0, 10)}.html`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <section className="weekly-management" aria-label="Weekly management email">
    <div className="weekly-management-heading"><span><Mail size={23} /></span><div><p>WEEKLY MANAGEMENT EMAIL</p><h2>A clear view of maintenance, every week</h2><small>Repeat machine reports, line and area hotspots, issue patterns, downtime and a timestamped live backlog in one email. Local AI explains the recorded findings and priorities.</small></div></div>
    <div className="weekly-management-controls">
      <label>Reporting period<select value={current ? "current" : "completed"} disabled={Boolean(busy)} onChange={(e) => { setCurrent(e.target.value === "current"); setWeek(""); setReport(null); setError(""); }}><option value="current">This week so far</option><option value="completed">Completed week</option></select><small>Malaysia time · Monday to now, or a completed week</small></label>
      {!current ? <label>Week starting Monday<input type="date" value={week} disabled={Boolean(busy)} onChange={(e) => { setWeek(e.target.value); setReport(null); setError(""); }} /><small>Leave blank for the last completed week</small></label> : null}
      <button type="button" className="secondary-action" disabled={Boolean(busy)} onClick={() => void run("preview")}><RefreshCw size={16} />{busy === "preview" ? "Preparing…" : "Preview email"}</button>
      <button type="button" className="primary-action" disabled={Boolean(busy)} onClick={() => void run("generate")}><Sparkles size={16} />{busy === "generate" ? "Writing summary…" : "Generate & save report"}</button>
      {report ? <button type="button" className="secondary-action" onClick={download}><Download size={16} />Download email</button> : null}
      {report?.id ? <button type="button" className="primary-action" disabled={Boolean(busy) || report.delivery !== "draft"} onClick={() => void run("send", report.id!)}><Mail size={16} />{busy === "send" || report.delivery === "sending" ? "Sending…" : report.delivery === "sent" ? "Email sent" : "Send email now"}</button> : null}
    </div>
    <p className="weekly-management-note">Generate and review the report, then use Send email now to email the recipients configured in n8n. This week so far includes Monday to the snapshot time. Monday's scheduled report runs separately. Preview and generation do not send email.</p>
    {error ? <p role="alert" className="error-line">{error}</p> : null}
    {busy === "generate" ? <p role="status">The local model may take up to two minutes. CMMS remains available while it writes.</p> : null}
    {report ? <><div className="weekly-management-meta"><strong>{report.subject}</strong><span>{report.aiStatus === "generated" ? "Local AI summary" : "Factual summary"} · {report.id ? `Saved · ${report.delivery}` : "Preview"}</span></div>
      <iframe className="weekly-email-preview" title="Weekly management email preview" sandbox="" srcDoc={report.html} />
      {report.delivery === "sending" ? <p role="status">Delivery requested. Waiting for n8n to confirm the email result; this status updates automatically.</p> : null}
      {report.delivery === "sent" ? <p role="status">Email sent{report.sentAt ? ` · ${new Date(report.sentAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })} MYT` : ""}.</p> : null}
      {report.deliveryError ? <p role="status" className="error-line">{report.deliveryError}</p> : null}
      {["sending", "failed"].includes(report.delivery) && report.id ? <div className="weekly-delivery-recovery"><p>Check the n8n execution and sent mailbox before permitting another attempt.</p><label><input type="checkbox" checked={confirmedNotSent} onChange={(e) => setConfirmedNotSent(e.target.checked)} /> I have checked and confirmed this report was not sent.</label><button type="button" className="secondary-action" disabled={!confirmedNotSent || Boolean(busy)} onClick={() => void run("reset", report.id!)}>Allow another delivery attempt</button></div> : null}
    </> : null}
    <details className="weekly-report-history"><summary>Saved weekly reports ({history.length})</summary>{history.length ? <ul>{history.map((item) => <li key={item.id}><button type="button" disabled={Boolean(busy)} onClick={() => void run("open", item.id!)}>{item.subject}</button><span>{item.delivery} · {new Date(item.generatedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</span></li>)}</ul> : <p>No saved reports for this plant view yet.</p>}</details>
  </section>;
}
