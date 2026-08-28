import { BellRing, Database, HardDrive, QrCode, RadioTower, RefreshCw, Save, Settings2, Smartphone, Tv, Wrench } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { WorkOrderSyncSettings } from "@sugi-cmms/shared";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { PwaInstallButton } from "../components/PwaInstallButton";
import { useCurrentUser } from "../state/UserContext";

const notificationRows = [
  ["Work order opened", "Maintenance team + executive"],
  ["Repair started", "Requester"],
  ["Pending material", "Requester + executive"],
  ["Repair resolved", "Requester"],
  ["Requester returned", "Assigned technician + executive"]
];

const emptySync: WorkOrderSyncSettings = {
  scriptUrl: "", hasToken: false, sheetName: "WorkOrders", webhookUrl: "", configured: false,
  pendingCount: 0, failedCount: 0, lastSyncAt: null, lastError: null
};

export function SettingsPage() {
  const { currentUser } = useCurrentUser();
  const [sync, setSync] = useState(emptySync);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadSync() { setSync(await api.workOrderSyncSettings()); }
  useEffect(() => { void loadSync().catch(console.error); }, []);

  async function saveSync(event: FormEvent) {
    event.preventDefault();
    if (!currentUser) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const updated = await api.updateWorkOrderSyncSettings({
        actorId: currentUser.id, scriptUrl: sync.scriptUrl, token: token || undefined,
        sheetName: sync.sheetName, webhookUrl: sync.webhookUrl
      });
      setSync(updated); setToken(""); setMessage("Work order integration settings saved.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save integration settings.");
    } finally { setBusy(false); }
  }

  async function retrySync() {
    if (!currentUser) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api.retryWorkOrderSync(currentUser.id);
      setSync(result.settings); setMessage(result.message);
      if (!result.ok && result.errors.length) setError(result.errors.slice(0, 3).join(" "));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to run sync.");
    } finally { setBusy(false); }
  }

  return (
    <section className="page-stack settings-page">
      <div className="page-title-row page-title-clean">
        <div><p className="eyebrow">Developer mode</p><h1>CMMS Control Room</h1></div>
        <span className="role-chip"><Settings2 size={17} aria-hidden="true" />Full access</span>
      </div>

      <form className="section-panel work-order-sync-card" onSubmit={saveSync}>
        <div className="section-header">
          <div><h2>Work Order → Google Sheets</h2><span>SQLite remains primary; queued updates retry automatically every minute.</span></div>
          <Database size={22} aria-hidden="true" />
        </div>
        <div className="form-grid two-columns">
          <label>Apps Script web app URL<input type="url" value={sync.scriptUrl} onChange={(event) => setSync({ ...sync, scriptUrl: event.target.value })} placeholder="https://script.google.com/macros/s/.../exec" /></label>
          <label>Sheet tab<input value={sync.sheetName} onChange={(event) => setSync({ ...sync, sheetName: event.target.value })} placeholder="WorkOrders" /></label>
          <label>Shared token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={sync.hasToken ? "Configured — leave blank to keep" : "Required"} /></label>
          <label>Node-RED / Telegram webhook (optional)<input type="url" value={sync.webhookUrl} onChange={(event) => setSync({ ...sync, webhookUrl: event.target.value })} placeholder="http://server:1880/workorderpk" /></label>
        </div>
        <div className="sync-status-row">
          <span className={sync.configured ? "sync-ready" : "sync-off"}>{sync.configured ? "Google sync configured" : "Google sync not configured"}</span>
          <span>{sync.pendingCount} pending</span><span>{sync.failedCount} failed</span>
          {sync.lastSyncAt ? <span>Last sync {new Date(sync.lastSyncAt).toLocaleString()}</span> : null}
        </div>
        {sync.lastError ? <p className="error-line">Last error: {sync.lastError}</p> : null}
        {error ? <p className="error-line">{error}</p> : null}
        {message ? <p className="success-line">{message}</p> : null}
        <div className="form-actions">
          <button className="secondary-action" type="button" disabled={busy || !sync.configured} onClick={retrySync}><RefreshCw size={16} />Sync now</button>
          <button className="primary-action" type="submit" disabled={busy || !sync.scriptUrl.trim() || (!sync.hasToken && !token.trim())}><Save size={16} />Save integration</button>
        </div>
      </form>

      <div className="settings-grid">
        <section className="section-panel settings-card"><QrCode size={22} aria-hidden="true" /><h2>Requester QR Poster</h2><p>The live requester URL is inserted automatically into a branded, print-ready A4 PDF.</p><Link className="secondary-action" to="/users?tab=qr">Generate print-ready PDF</Link></section>
        <section className="section-panel settings-card"><Wrench size={22} aria-hidden="true" /><h2>Work Order Master Data</h2><p>Manage the production machine list, areas, sections, and issue categories.</p><Link className="secondary-action" to="/users?tab=machines">Manage machines</Link></section>
        <section className="section-panel settings-card"><BellRing size={22} aria-hidden="true" /><h2>Notification Rules</h2><div className="settings-list">{notificationRows.map(([event, receiver]) => <div key={event}><span>{event}</span><strong>{receiver}</strong></div>)}</div></section>
        <section className="section-panel settings-card"><HardDrive size={22} aria-hidden="true" /><h2>Upload Storage</h2><div className="settings-list"><div><span>Mode</span><strong>Local server</strong></div><div><span>Folder</span><strong>apps/api/uploads</strong></div><div><span>Max file</span><strong>8 MB</strong></div></div></section>
        <section className="section-panel settings-card"><Smartphone size={22} aria-hidden="true" /><h2>PWA Mobile</h2><div className="toggle-list"><label><input type="checkbox" checked readOnly />Installable app shell</label><label><input type="checkbox" checked readOnly />Service worker registered</label></div><PwaInstallButton /></section>
        <section className="section-panel settings-card"><Tv size={22} aria-hidden="true" /><h2>TV Dashboard</h2><div className="settings-list"><div><span>Refresh</span><strong>30 seconds</strong></div><div><span>Board</span><strong>New, In Progress, Pending, Verify</strong></div></div></section>
        <section className="section-panel settings-card"><Database size={22} aria-hidden="true" /><h2>Database</h2><div className="settings-list"><div><span>Primary</span><strong>SQLite server database</strong></div><div><span>Secondary</span><strong>Google Sheet outbox sync</strong></div></div></section>
        <section className="section-panel settings-card"><RadioTower size={22} aria-hidden="true" /><h2>Factory Display</h2><div className="toggle-list"><label><input type="checkbox" checked readOnly />Auto-refresh board</label><label><input type="checkbox" checked readOnly />High contrast status colors</label></div></section>
      </div>
    </section>
  );
}
