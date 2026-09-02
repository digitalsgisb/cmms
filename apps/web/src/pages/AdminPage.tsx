import { BadgeCheck, Building2, Camera, ClipboardCopy, ExternalLink, Factory, FileDown, ListChecks, MonitorDown, Plus, QrCode, Shield, Tags, Trash2, UserCog, UsersRound, type LucideIcon } from "lucide-react";
import QRCode from "qrcode";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { IssueCategory, Machine, MasterData, Section, User } from "@sugi-cmms/shared";
import { api, mediaUrl } from "../api/client";
import { useCurrentUser } from "../state/UserContext";
import { useLiveRefresh } from "../hooks/useLiveRefresh";

const roleNotes = {
  requester: "Issues and tracks department work orders.",
  technician: "Acknowledges, self-assigns, updates, and resolves jobs.",
  executive: "Monitors workload, reassigns jobs, and keeps completion moving.",
  admin: "Controls users, roles, departments, and system rules.",
  developer: "Full system access for configuration, testing, and development."
};

type AdminTab = "people" | "sections" | "machines" | "categories" | "qr";

const adminTabs: Array<{ tab: AdminTab; Icon: LucideIcon; label: string }> = [
  { tab: "people", Icon: UsersRound, label: "People" },
  { tab: "sections", Icon: Building2, label: "Sections" },
  { tab: "machines", Icon: Factory, label: "Machines" },
  { tab: "categories", Icon: Tags, label: "Categories" },
  { tab: "qr", Icon: QrCode, label: "Requester QR" }
];

function cleanPasteCell(value = "") {
  return value.replace(/^\ufeff/, "").replace(/^"|"$/g, "").trim();
}

function splitSheetLine(line: string) {
  return (line.includes("\t") ? line.split("\t") : line.split(",")).map(cleanPasteCell);
}

function parseMachinePaste(text: string) {
  const table = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitSheetLine);

  if (table.length === 0) {
    return [];
  }

  let areaIndex = 0;
  let machineIndex = 1;
  let sectionIndex = 2;
  let startIndex = 0;
  const header = table[0].map((cell) => cell.toLowerCase());
  const headerSectionIndex = header.findIndex((cell) => cell.includes("section") || cell.includes("department"));
  const headerAreaIndex = header.findIndex((cell) => cell.includes("area"));
  const headerMachineIndex = header.findIndex((cell) => cell.includes("machine") || cell.includes("asset") || cell.includes("equipment"));

  if (headerSectionIndex >= 0 && headerMachineIndex >= 0) {
    sectionIndex = headerSectionIndex;
    areaIndex = headerAreaIndex >= 0 ? headerAreaIndex : headerSectionIndex;
    machineIndex = headerMachineIndex;
    startIndex = 1;
  } else if (table[0].length < 3) {
    sectionIndex = 0;
    areaIndex = 0;
  }

  return table.slice(startIndex).map((cells) => ({
    sectionName: cleanPasteCell(cells[sectionIndex]),
    areaName: cleanPasteCell(cells[areaIndex]) || "General",
    machineName: cleanPasteCell(cells[machineIndex])
  })).filter((row) => row.sectionName || row.machineName);
}

export function AdminPage() {
  const [searchParams] = useSearchParams();
  const { users, currentUser, refreshUsers } = useCurrentUser();
  const [uploadingUserId, setUploadingUserId] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  const [removingUserId, setRemovingUserId] = useState("");
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    name: "",
    role: "requester" as User["role"],
    department: "",
    title: ""
  });
  const requestedTab = searchParams.get("tab") as AdminTab | null;
  const [activeTab, setActiveTab] = useState<AdminTab>(adminTabs.some((item) => item.tab === requestedTab) ? requestedTab! : "people");
  const [masterData, setMasterData] = useState<MasterData>({ sections: [], machines: [], issueCategories: [] });
  const [newSectionName, setNewSectionName] = useState("");
  const [newMachineName, setNewMachineName] = useState("");
  const [newMachineArea, setNewMachineArea] = useState("");
  const [newMachineSectionId, setNewMachineSectionId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [machineImportText, setMachineImportText] = useState("");
  const [machineImportMessage, setMachineImportMessage] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [posterBusy, setPosterBusy] = useState(false);
  const [adminError, setAdminError] = useState("");
  const defaultRequesterUrl = `${window.location.origin}/requester`;
  const [requesterUrl, setRequesterUrl] = useState(defaultRequesterUrl);
  const canAdmin = Boolean(currentUser && ["admin", "developer"].includes(currentUser.role));
  const qrTargetUrl = requesterUrl.trim() || defaultRequesterUrl;
  const machineImportRows = useMemo(() => parseMachinePaste(machineImportText), [machineImportText]);

  const roleCounts = useMemo(() => {
    return users.reduce<Record<string, number>>((counts, user) => {
      counts[user.role] = (counts[user.role] || 0) + 1;
      return counts;
    }, {});
  }, [users]);

  async function loadMasterData() {
    const nextMasterData = await api.masterData();
    setMasterData(nextMasterData);
    setNewMachineSectionId((current) => current || nextMasterData.sections.find((section) => section.active)?.id || "");
  }

  useEffect(() => {
    loadMasterData().catch(console.error);
    api.publicConfig()
      .then((config) => {
        if (config.requesterUrl) setRequesterUrl(config.requesterUrl);
      })
      .catch(console.error);
  }, []);

  useLiveRefresh(["master-data"], loadMasterData);

  useEffect(() => {
    QRCode.toString(qrTargetUrl, { type: "svg", margin: 1, width: 220 })
      .then(setQrSvg)
      .catch(console.error);
  }, [qrTargetUrl]);

  async function uploadAvatar(userId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadingUserId(userId);
    try {
      await api.uploadUserAvatar(userId, file);
      await refreshUsers();
    } finally {
      setUploadingUserId("");
      event.target.value = "";
    }
  }

  async function addUser(event: FormEvent) {
    event.preventDefault();
    if (!currentUser) return;

    setSavingUser(true);
    setAdminError("");
    try {
      await api.createUser({ actorId: currentUser.id, ...newUser });
      setNewUser({ username: "", password: "", name: "", role: "requester", department: "", title: "" });
      await refreshUsers();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to add user.");
    } finally {
      setSavingUser(false);
    }
  }

  async function removeUser(user: User) {
    if (!currentUser) return;
    const confirmed = window.confirm(
      `Remove ${user.name}'s account? They will no longer be able to sign in, but their historical records will be kept.`
    );
    if (!confirmed) return;

    setRemovingUserId(user.id);
    setAdminError("");
    try {
      await api.removeUser(user.id, currentUser.id);
      await refreshUsers();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to remove user.");
    } finally {
      setRemovingUserId("");
    }
  }

  async function createSection(event: FormEvent) {
    event.preventDefault();
    if (!currentUser) {
      return;
    }

    setAdminError("");
    try {
      await api.createSection({ actorId: currentUser.id, name: newSectionName, active: true });
      setNewSectionName("");
      await loadMasterData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to create section.");
    }
  }

  async function saveSection(section: Section) {
    if (!currentUser) {
      return;
    }

    setAdminError("");
    try {
      await api.updateSection(section.id, { actorId: currentUser.id, name: section.name, active: section.active });
      await loadMasterData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to save section.");
    }
  }

  async function createMachine(event: FormEvent) {
    event.preventDefault();
    if (!currentUser) {
      return;
    }

    setAdminError("");
    try {
      await api.createMachine({ actorId: currentUser.id, sectionId: newMachineSectionId, area: newMachineArea || "General", name: newMachineName, active: true });
      setNewMachineName("");
      setNewMachineArea("");
      await loadMasterData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to create machine.");
    }
  }

  async function importPastedMachines() {
    if (!currentUser || machineImportRows.length === 0) {
      return;
    }

    setAdminError("");
    setMachineImportMessage("");
    try {
      const result = await api.importMachines({ actorId: currentUser.id, rows: machineImportRows });
      setMasterData(result.masterData);
      setMachineImportText("");
      setMachineImportMessage(
        `${result.importedMachines} machines imported, ${result.importedSections} sections created, ${result.skippedMachines} skipped.`
      );
      if (result.errors.length > 0) {
        setAdminError(result.errors.slice(0, 4).join(" "));
      }
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to import machines.");
    }
  }

  async function saveMachine(machine: Machine) {
    if (!currentUser) {
      return;
    }

    setAdminError("");
    try {
      await api.updateMachine(machine.id, { actorId: currentUser.id, sectionId: machine.sectionId, area: machine.area, name: machine.name, active: machine.active });
      await loadMasterData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to save machine.");
    }
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    if (!currentUser) {
      return;
    }

    setAdminError("");
    try {
      await api.createIssueCategory({ actorId: currentUser.id, name: newCategoryName, active: true });
      setNewCategoryName("");
      await loadMasterData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to create issue category.");
    }
  }

  async function saveCategory(category: IssueCategory) {
    if (!currentUser) {
      return;
    }

    setAdminError("");
    try {
      await api.updateIssueCategory(category.id, { actorId: currentUser.id, name: category.name, active: category.active });
      await loadMasterData();
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to save issue category.");
    }
  }

  async function copyRequesterUrl() {
    await navigator.clipboard.writeText(qrTargetUrl);
  }

  function downloadQr() {
    const blob = new Blob([qrSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sugi-requester-qr.svg";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPoster() {
    setPosterBusy(true);
    setAdminError("");
    try {
      const { downloadRequesterPosterPdf } = await import("../utils/requesterPosterPdf");
      const qrDataUrl = await QRCode.toDataURL(qrTargetUrl, { width: 900, margin: 2, errorCorrectionLevel: "H" });
      await downloadRequesterPosterPdf(qrTargetUrl, qrDataUrl);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Unable to create the PDF poster.");
    } finally {
      setPosterBusy(false);
    }
  }

  function updateSectionDraft(id: string, update: Partial<Section>) {
    setMasterData((current) => ({
      ...current,
      sections: current.sections.map((section) => (section.id === id ? { ...section, ...update } : section))
    }));
  }

  function updateMachineDraft(id: string, update: Partial<Machine>) {
    setMasterData((current) => ({
      ...current,
      machines: current.machines.map((machine) => (machine.id === id ? { ...machine, ...update } : machine))
    }));
  }

  function updateCategoryDraft(id: string, update: Partial<IssueCategory>) {
    setMasterData((current) => ({
      ...current,
      issueCategories: current.issueCategories.map((category) => (category.id === id ? { ...category, ...update } : category))
    }));
  }

  return (
    <section className="page-stack admin-page">
      <div className="page-title-row page-title-clean">
        <div>
          <p className="eyebrow">Admin management</p>
          <h1>People, Roles & Master Data</h1>
        </div>
        <span className="role-chip">
          <Shield size={17} aria-hidden="true" />
          {currentUser?.role || "guest"}
        </span>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="Admin sections">
        {adminTabs.map(({ tab, Icon, label }) => (
          <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {adminError ? <p className="error-line">{adminError}</p> : null}

      {activeTab === "people" ? (
        <div className="admin-grid">
          <section className="section-panel admin-users-panel">
            <div className="section-header">
              <div>
                <h2>Users</h2>
                <span>{users.length} active accounts</span>
              </div>
              <UserCog size={20} aria-hidden="true" />
            </div>

            <form className="admin-user-add-form" onSubmit={addUser}>
              <div className="admin-user-add-heading">
                <div>
                  <strong>Add user</strong>
                  <span>Create a sign-in account and assign its access role.</span>
                </div>
                <Plus size={18} aria-hidden="true" />
              </div>
              <div className="admin-user-fields">
                <label>Full name<input required value={newUser.name} onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} disabled={!canAdmin || savingUser} /></label>
                <label>Username<input required minLength={3} autoComplete="off" value={newUser.username} onChange={(event) => setNewUser((current) => ({ ...current, username: event.target.value }))} disabled={!canAdmin || savingUser} /></label>
                <label>Password<input required minLength={12} type="password" autoComplete="new-password" value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} disabled={!canAdmin || savingUser} /></label>
                <label>Role<select value={newUser.role} onChange={(event) => setNewUser((current) => ({ ...current, role: event.target.value as User["role"] }))} disabled={!canAdmin || savingUser}>
                  <option value="requester">Requester</option>
                  <option value="technician">Technician</option>
                  <option value="executive">Executive</option>
                  <option value="admin">Admin</option>
                  {currentUser?.role === "developer" ? <option value="developer">Developer</option> : null}
                </select></label>
                <label>Department<input required value={newUser.department} onChange={(event) => setNewUser((current) => ({ ...current, department: event.target.value }))} disabled={!canAdmin || savingUser} /></label>
                <label>Job title<input required value={newUser.title} onChange={(event) => setNewUser((current) => ({ ...current, title: event.target.value }))} disabled={!canAdmin || savingUser} /></label>
              </div>
              <button className="admin-add-user-button" type="submit" disabled={!canAdmin || savingUser}>
                <Plus size={16} aria-hidden="true" />{savingUser ? "Adding…" : "Add user"}
              </button>
            </form>

            <div className="admin-user-list">
              {users.map((user) => (
                <article className="admin-user-row" key={user.id}>
                  <span className="avatar-mark">{user.avatarUrl ? <img src={mediaUrl(user.avatarUrl)} alt={user.name} /> : user.name.slice(0, 1)}</span>
                  <div>
                    <strong>{user.name}</strong>
                    <span>{user.department} - {user.title}</span>
                  </div>
                  <div className="admin-user-actions">
                    <span className={`role-pill role-${user.role}`}>{user.role}</span>
                    <label className={`avatar-upload-button ${uploadingUserId === user.id ? "loading" : ""}`}>
                      <Camera size={14} aria-hidden="true" />
                      {uploadingUserId === user.id ? "Uploading" : "Photo"}
                      <input type="file" accept="image/*" disabled={!canAdmin || Boolean(uploadingUserId)} onChange={(event) => uploadAvatar(user.id, event)} />
                    </label>
                    <button
                      className="admin-remove-user-button"
                      type="button"
                      disabled={!canAdmin || Boolean(removingUserId) || user.id === currentUser?.id || user.id === "u-requester-public" || (user.role === "developer" && currentUser?.role !== "developer")}
                      onClick={() => removeUser(user)}
                      title={user.id === currentUser?.id ? "You cannot remove your current account" : user.id === "u-requester-public" ? "Required by the public requester form" : "Remove user access"}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      {removingUserId === user.id ? "Removing" : "Remove"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="section-panel">
            <div className="section-header">
              <div>
                <h2>Role Matrix</h2>
                <span>Starter permissions model</span>
              </div>
              <UsersRound size={20} aria-hidden="true" />
            </div>

            <div className="role-matrix">
              {Object.entries(roleNotes).map(([role, note]) => (
                <article key={role}>
                  <div>
                    <BadgeCheck size={18} aria-hidden="true" />
                    <strong>{role}</strong>
                  </div>
                  <p>{note}</p>
                  <span>{roleCounts[role] || 0} users</span>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "sections" ? (
        <section className="section-panel master-data-panel">
          <div className="section-header">
            <div>
              <h2>Sections</h2>
              <span>Used by requester and work order filters</span>
            </div>
            <Building2 size={20} aria-hidden="true" />
          </div>
          <form className="master-add-row" onSubmit={createSection}>
            <input value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} placeholder="New section name" disabled={!canAdmin} />
            <button type="submit" disabled={!canAdmin || !newSectionName.trim()}>Add Section</button>
          </form>
          <div className="master-list">
            {masterData.sections.map((section) => (
              <article className="master-row" key={section.id}>
                <input value={section.name} onChange={(event) => updateSectionDraft(section.id, { name: event.target.value })} disabled={!canAdmin} />
                <label>
                  <input type="checkbox" checked={section.active} onChange={(event) => updateSectionDraft(section.id, { active: event.target.checked })} disabled={!canAdmin} />
                  Active
                </label>
                <button type="button" disabled={!canAdmin || !section.name.trim()} onClick={() => saveSection(section)}>Save</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "machines" ? (
        <section className="section-panel master-data-panel">
          <div className="section-header">
            <div>
              <h2>Machines</h2>
              <span>Filtered by selected section</span>
            </div>
            <Factory size={20} aria-hidden="true" />
          </div>
          <form className="master-add-row master-add-row-machine" onSubmit={createMachine}>
            <select value={newMachineSectionId} onChange={(event) => setNewMachineSectionId(event.target.value)} disabled={!canAdmin}>
              <option value="">Select section</option>
              {masterData.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
            <input value={newMachineArea} onChange={(event) => setNewMachineArea(event.target.value)} placeholder="Area (e.g. Waterjet)" disabled={!canAdmin} />
            <input value={newMachineName} onChange={(event) => setNewMachineName(event.target.value)} placeholder="New machine name" disabled={!canAdmin} />
            <button type="submit" disabled={!canAdmin || !newMachineSectionId || !newMachineName.trim()}>Add Machine</button>
          </form>

          <section className="machine-import-box">
            <div className="subsection-heading">
              <div>
                <h2>Paste Machine List</h2>
                <span>{machineImportRows.length} rows ready</span>
              </div>
            </div>
            <textarea
              value={machineImportText}
              onChange={(event) => setMachineImportText(event.target.value)}
              rows={6}
              placeholder={"Area\tMachine Name\tSection\nWaterjet\tWJ 7A\tConversion\nGeneral\t4 MTR\tRoll Making"}
              disabled={!canAdmin}
            />
            <div className="master-import-actions">
              <button type="button" disabled={!canAdmin || machineImportRows.length === 0} onClick={importPastedMachines}>
                Import Pasted Machines
              </button>
              {machineImportText ? (
                <button type="button" onClick={() => setMachineImportText("")}>
                  Clear
                </button>
              ) : null}
              {machineImportMessage ? <span>{machineImportMessage}</span> : null}
            </div>
          </section>

          <div className="master-list">
            {masterData.machines.map((machine) => (
              <article className="master-row master-row-machine" key={machine.id}>
                <select value={machine.sectionId} onChange={(event) => updateMachineDraft(machine.id, { sectionId: event.target.value })} disabled={!canAdmin}>
                  {masterData.sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </select>
                <input value={machine.area} onChange={(event) => updateMachineDraft(machine.id, { area: event.target.value })} placeholder="Area" disabled={!canAdmin} />
                <input value={machine.name} onChange={(event) => updateMachineDraft(machine.id, { name: event.target.value })} disabled={!canAdmin} />
                <label>
                  <input type="checkbox" checked={machine.active} onChange={(event) => updateMachineDraft(machine.id, { active: event.target.checked })} disabled={!canAdmin} />
                  Active
                </label>
                <button type="button" disabled={!canAdmin || !machine.name.trim()} onClick={() => saveMachine(machine)}>Save</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "categories" ? (
        <section className="section-panel master-data-panel">
          <div className="section-header">
            <div>
              <h2>Issue Categories</h2>
              <span>Requester issue type list</span>
            </div>
            <ListChecks size={20} aria-hidden="true" />
          </div>
          <form className="master-add-row" onSubmit={createCategory}>
            <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="New issue category" disabled={!canAdmin} />
            <button type="submit" disabled={!canAdmin || !newCategoryName.trim()}>Add Category</button>
          </form>
          <div className="master-list">
            {masterData.issueCategories.map((category) => (
              <article className="master-row" key={category.id}>
                <input value={category.name} onChange={(event) => updateCategoryDraft(category.id, { name: event.target.value })} disabled={!canAdmin} />
                <label>
                  <input type="checkbox" checked={category.active} onChange={(event) => updateCategoryDraft(category.id, { active: event.target.checked })} disabled={!canAdmin} />
                  Active
                </label>
                <button type="button" disabled={!canAdmin || !category.name.trim()} onClick={() => saveCategory(category)}>Save</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "qr" ? (
        <section className="section-panel requester-qr-panel">
          <div className="section-header">
            <div>
              <h2>Requester QR</h2>
              <span>Public no-login issue form</span>
            </div>
            <QrCode size={20} aria-hidden="true" />
          </div>
          <div className="requester-qr-layout">
            <div className="requester-qr-code" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="requester-qr-actions">
              <label className="requester-url-field">
                QR URL
                <input value={requesterUrl} onChange={(event) => setRequesterUrl(event.target.value)} />
                <small>The live system address is filled automatically. Change it only when the wall poster needs a different public or factory-network URL.</small>
              </label>
              <button type="button" onClick={copyRequesterUrl}>
                <ClipboardCopy size={16} aria-hidden="true" />
                Copy Link
              </button>
              <a href={qrTargetUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} aria-hidden="true" />
                Open Requester
              </a>
              <button type="button" onClick={() => setRequesterUrl(defaultRequesterUrl)}>
                Reset URL
              </button>
              <button type="button" onClick={downloadQr} disabled={!qrSvg}>
                <MonitorDown size={16} aria-hidden="true" />
                Download QR
              </button>
              <button className="poster-download-button" type="button" onClick={downloadPoster} disabled={posterBusy || !qrTargetUrl}>
                <FileDown size={16} aria-hidden="true" />
                {posterBusy ? "Creating print PDF..." : "Download Print-Ready PDF"}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
