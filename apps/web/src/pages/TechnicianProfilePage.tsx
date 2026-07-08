import { BellRing, ClipboardCheck, LogOut, Smartphone, UserRound, Wifi } from "lucide-react";
import { PwaInstallButton } from "../components/PwaInstallButton";
import { useCurrentUser } from "../state/UserContext";

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function TechnicianProfilePage() {
  const { currentUser, logout } = useCurrentUser();

  if (!currentUser) {
    return null;
  }

  return (
    <section className="page-stack technician-profile-page">
      <div className="page-title-row page-title-clean">
        <div>
          <p className="eyebrow">Technician account</p>
          <h1>Profile</h1>
        </div>
        <span className="role-chip">
          <UserRound size={17} aria-hidden="true" />
          Technician
        </span>
      </div>

      <section className="section-panel technician-profile-panel">
        <span className="technician-profile-avatar">{initialsFor(currentUser.name)}</span>
        <div>
          <h2>{currentUser.name}</h2>
          <p>{currentUser.title}</p>
          <span>{currentUser.department}</span>
        </div>
        <button className="secondary-action" type="button" onClick={logout}>
          <LogOut size={17} aria-hidden="true" />
          Sign out
        </button>
      </section>

      <div className="technician-profile-grid">
        <section className="section-panel settings-card">
          <ClipboardCheck size={22} aria-hidden="true" />
          <h2>Daily Focus</h2>
          <div className="settings-list">
            <div>
              <span>Main screen</span>
              <strong>Technician queue</strong>
            </div>
            <div>
              <span>Required to resolve</span>
              <strong>Remark + photo</strong>
            </div>
          </div>
        </section>

        <section className="section-panel settings-card">
          <Smartphone size={22} aria-hidden="true" />
          <h2>PWA Status</h2>
          <div className="toggle-list">
            <label>
              <input type="checkbox" checked readOnly />
              Installable app shell
            </label>
            <label>
              <input type="checkbox" checked readOnly />
              Technician start screen
            </label>
            <label>
              <input type="checkbox" readOnly />
              Offline sync later
            </label>
          </div>
          <PwaInstallButton />
        </section>

        <section className="section-panel settings-card">
          <Wifi size={22} aria-hidden="true" />
          <h2>Connection</h2>
          <div className="settings-list">
            <div>
              <span>Work order updates</span>
              <strong>Online required</strong>
            </div>
            <div>
              <span>Camera upload</span>
              <strong>HTTPS required</strong>
            </div>
          </div>
        </section>

        <section className="section-panel settings-card">
          <BellRing size={22} aria-hidden="true" />
          <h2>Notifications</h2>
          <div className="settings-list">
            <div>
              <span>Queue updates</span>
              <strong>In-app</strong>
            </div>
            <div>
              <span>Push alerts</span>
              <strong>Future phase</strong>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
