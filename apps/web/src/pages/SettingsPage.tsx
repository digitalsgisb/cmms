import { BellRing, Database, HardDrive, RadioTower, Settings2, Smartphone, Tv } from "lucide-react";
import { PwaInstallButton } from "../components/PwaInstallButton";

const notificationRows = [
  ["Work order opened", "Maintenance team + executive"],
  ["Repair started", "Requester"],
  ["Pending material", "Requester + executive"],
  ["Repair resolved", "Requester"],
  ["Requester returned", "Assigned technician + executive"]
];

export function SettingsPage() {
  return (
    <section className="page-stack settings-page">
      <div className="page-title-row page-title-clean">
        <div>
          <p className="eyebrow">System settings</p>
          <h1>CMMS Control Room</h1>
        </div>
        <span className="role-chip">
          <Settings2 size={17} aria-hidden="true" />
          MVP settings
        </span>
      </div>

      <div className="settings-grid">
        <section className="section-panel settings-card">
          <BellRing size={22} aria-hidden="true" />
          <h2>Notification Rules</h2>
          <div className="settings-list">
            {notificationRows.map(([event, receiver]) => (
              <div key={event}>
                <span>{event}</span>
                <strong>{receiver}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="section-panel settings-card">
          <HardDrive size={22} aria-hidden="true" />
          <h2>Upload Storage</h2>
          <div className="settings-list">
            <div>
              <span>Mode</span>
              <strong>Local server</strong>
            </div>
            <div>
              <span>Folder</span>
              <strong>apps/api/uploads</strong>
            </div>
            <div>
              <span>Max file</span>
              <strong>8 MB</strong>
            </div>
          </div>
        </section>

        <section className="section-panel settings-card">
          <Smartphone size={22} aria-hidden="true" />
          <h2>PWA Mobile</h2>
          <div className="toggle-list">
            <label>
              <input type="checkbox" checked readOnly />
              Installable app shell
            </label>
            <label>
              <input type="checkbox" checked readOnly />
              Service worker registered
            </label>
            <label>
              <input type="checkbox" readOnly />
              Web push later
            </label>
          </div>
          <PwaInstallButton />
        </section>

        <section className="section-panel settings-card">
          <Tv size={22} aria-hidden="true" />
          <h2>TV Dashboard</h2>
          <div className="settings-list">
            <div>
              <span>Refresh</span>
              <strong>30 seconds</strong>
            </div>
            <div>
              <span>Board</span>
              <strong>New, In Progress, Pending, Verify</strong>
            </div>
          </div>
        </section>

        <section className="section-panel settings-card">
          <Database size={22} aria-hidden="true" />
          <h2>Database</h2>
          <div className="settings-list">
            <div>
              <span>Development</span>
              <strong>SQLite</strong>
            </div>
            <div>
              <span>Future production</span>
              <strong>PostgreSQL or MySQL ready</strong>
            </div>
          </div>
        </section>

        <section className="section-panel settings-card">
          <RadioTower size={22} aria-hidden="true" />
          <h2>Factory Display</h2>
          <div className="toggle-list">
            <label>
              <input type="checkbox" checked readOnly />
              Auto-refresh board
            </label>
            <label>
              <input type="checkbox" checked readOnly />
              High contrast status colors
            </label>
            <label>
              <input type="checkbox" readOnly />
              Shift filter later
            </label>
          </div>
        </section>
      </div>
    </section>
  );
}
