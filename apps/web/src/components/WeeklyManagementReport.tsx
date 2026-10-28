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
  const [toEmail, setToEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(true);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const version = useRef(0);
  useEffect(() => () => { version.current++; }, []);
  const loadHistory = useCallback(async () => { setHistory(await api.weeklyReportHistory()); }, []);
  useEffect(() => { void loadHistory().catch((e) => setError(e.message)); }, [loadHistory]);
  useEffect(() => {
    let cancelled = false;
    void api.reportEmailSettings().then((settings) => {
      if (cancelled) return;
      setToEmail(settings.to.join(", ")); setCcEmail(settings.cc.join(", ")); setSettingsSaved(Boolean(settings.to.length));
    }).catch((e) => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setSettingsBusy(false); });
    return () => { cancelled = true; };
  }, []);
  async function saveRecipients() {
    setSettingsBusy(true); setError("");
    const split = (value: string) => value.split(/[,;]/).map((v) => v.trim()).filter(Boolean);
    try {
      const settings = await api.saveReportEmailSettings(split(toEmail), split(ccEmail));
      setToEmail(settings.to.join(", ")); setCcEmail(settings.cc.join(", "));
      setSettingsDirty(false); setSettingsSaved(Boolean(settings.to.length));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save recipients."); }
    finally { setSettingsBusy(false); }
  }
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
    <div className="weekly-management-heading"><span><Mail size={23} /></span><div><p>MANAGEMENT EMAIL</p><h1>Email reports</h1><small>Manage recipients, prepare a maintenance summary and review delivery history. Each email includes repeat machine reports, location hotspots, downtime and local AI commentary.</small></div></div>
    <div className="weekly-email-settings" aria-label="Report email recipients">
      <div><strong>Email recipients</strong><p>Saved for the selected plant view, including Both plants when selected. Used for Send email now and the weekly schedule.</p></div>
      <label>To<input type="text" inputMode="email" autoComplete="off" placeholder="boss@company.com, manager@company.com" value={toEmail} disabled={settingsBusy || Boolean(busy)} onChange={(e) => { setToEmail(e.target.value); setSettingsDirty(true); }} /></label>
      <label>CC (optional)<input type="text" inputMode="email" autoComplete="off" placeholder="maintenance@company.com" value={ccEmail} disabled={settingsBusy || Boolean(busy)} onChange={(e) => { setCcEmail(e.target.value); setSettingsDirty(true); }} /></label>
      <small>Enter plain email addresses separated by commas. Up to 20 recipients in total.</small>
      <div><button type="button" className="secondary-action" disabled={settingsBusy || Boolean(busy)} onClick={() => void saveRecipients()}>{settingsBusy ? "Loading / saving…" : "Save recipients"}</button><span role="status">{settingsDirty ? "Unsaved changes — save before sending." : settingsSaved ? "Recipients saved." : "Add and save at least one To recipient before sending."}</span></div>
    </div>
    <div className="weekly-management-controls">
      <label>Reporting period<select value={current ? "current" : "completed"} disabled={Boolean(busy)} onChange={(e) => { setCurrent(e.target.value === "current"); setWeek(""); setReport(null); setError(""); }}><option value="current">This week so far</option><option value="completed">Completed week</option></select><small>Malaysia time · Monday to now, or a completed week</small></label>
      {!current ? <label>Week starting Monday<input type="date" value={week} disabled={Boolean(busy)} onChange={(e) => { setWeek(e.target.value); setReport(null); setError(""); }} /><small>Leave blank for the last completed week</small></label> : null}
      <button type="button" className="secondary-action" disabled={Boolean(busy)} onClick={() => void run("preview")}><RefreshCw size={16} />{busy === "preview" ? "Preparing…" : "Preview email"}</button>
      <button type="button" className="primary-action" disabled={Boolean(busy)} onClick={() => void run("generate")}><Sparkles size={16} />{busy === "generate" ? "Writing summary…" : "Generate & save report"}</button>
      {report ? <button type="button" className="secondary-action" onClick={download}><Download size={16} />Download email</button> : null}
      {report?.id ? <button type="button" className="primary-action" disabled={Boolean(busy) || report.delivery !== "draft" || settingsBusy || settingsDirty || !settingsSaved} onClick={() => void run("send", report.id!)}><Mail size={16} />{busy === "send" || report.delivery === "sending" ? "Sending…" : report.delivery === "sent" ? "Email sent" : "Send email now"}</button> : null}
    </div>
    <p className="weekly-management-note">Save the recipients above, generate and review the report, then use Send email now. This week so far includes Monday to the snapshot time. Monday's scheduled report runs separately. Preview and generation do not send email.</p>
    {error ? <p role="alert" className="error-line">{error}</p> : null}
    {busy === "generate" ? <p role="status">The local model may take up to two minutes. CMMS remains available while it writes.</p> : null}
    {report ? <><div className="weekly-management-meta"><strong>{report.subject}</strong><span>{report.aiStatus === "generated" ? "Local AI summary" : "Factual summary"} · {report.id ? `Saved · ${report.delivery}` : "Preview"}</span></div>
      <iframe className="weekly-email-preview" title="Weekly management email preview" sandbox="" srcDoc={report.html} />
      {report.deliveryTo?.length ? <p className="weekly-management-note">Delivery recipients: {report.deliveryTo.join(", ")}{report.deliveryCc?.length ? ` · CC: ${report.deliveryCc.join(", ")}` : ""}</p> : null}
      {report.delivery === "sending" ? <p role="status">Delivery requested. Waiting for n8n to confirm the email result; this status updates automatically.</p> : null}
      {report.delivery === "sent" ? <p role="status">Email sent{report.sentAt ? ` · ${new Date(report.sentAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })} MYT` : ""}.</p> : null}
      {report.deliveryError ? <p role="status" className="error-line">{report.deliveryError}</p> : null}
      {["sending", "failed"].includes(report.delivery) && report.id ? <div className="weekly-delivery-recovery"><p>Check the n8n execution and sent mailbox before permitting another attempt.</p><label><input type="checkbox" checked={confirmedNotSent} onChange={(e) => setConfirmedNotSent(e.target.checked)} /> I have checked and confirmed this report was not sent.</label><button type="button" className="secondary-action" disabled={!confirmedNotSent || Boolean(busy)} onClick={() => void run("reset", report.id!)}>Allow another delivery attempt</button></div> : null}
    </> : null}
    <details className="weekly-report-history"><summary>Saved weekly reports ({history.length})</summary>{history.length ? <ul>{history.map((item) => <li key={item.id}><button type="button" disabled={Boolean(busy)} onClick={() => void run("open", item.id!)}>{item.subject}</button><span>{item.delivery} · {new Date(item.generatedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</span></li>)}</ul> : <p>No saved reports for this plant view yet.</p>}</details>
  </section>;
}
