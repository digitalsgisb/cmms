import {
  Activity, ArrowLeft, Bell, Building2, CalendarDays, CheckCircle2, ClipboardList, Clock3, Eye, Factory,
  Hammer, History, Home, Lightbulb, LogIn, LogOut, MapPin, RefreshCcw, Search, Send, ShieldCheck,
  UserCircle2, UserRound, Wrench, X, type LucideIcon
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MasterData, NotificationRecord, ShiftGroup, User, WorkOrder, WorkOrderDepartment, WorkOrderDetail, WorkOrderStatus, WorkOrderType } from "@sugi-cmms/shared";
import { workOrderDepartmentForUser, workOrderDepartments, workOrderTypeLabels } from "@sugi-cmms/shared";
import { api, mediaUrl } from "../api/client";
import { MultiPhotoPicker } from "../components/MultiPhotoPicker";
import { ImageLightbox } from "../components/ImageLightbox";
import { PwaInstallButton } from "../components/PwaInstallButton";
import { PushNotificationControl } from "../components/PushNotificationControl";
import { SearchableSelect } from "../components/SearchableSelect";
import { StatusBadge } from "../components/Badges";
import { formatDateTime } from "../utils/format";
import { useLiveRefresh } from "../hooks/useLiveRefresh";
import { useCurrentUser } from "../state/UserContext";

function todayDate() { return new Date().toISOString().slice(0, 10); }

const otherMachineValue = "__other__";
const initialRequesterForm = {
  type: "maintenance" as WorkOrderType, workDate: todayDate(), shiftGroup: "A" as ShiftGroup,
  sectionId: "", machineId: "", placeOrEquipment: "", reportedByName: "",
  reportedByDepartment: "", issueCategoryId: "", issueDescription: ""
};

const requestTypes: Array<{ type: WorkOrderType; Icon: LucideIcon; title: string; description: string }> = [
  { type: "maintenance", Icon: Wrench, title: "Maintenance", description: "Machine breakdown or corrective maintenance" },
  { type: "project", Icon: Hammer, title: "Project", description: "Planned fabrication, installation, or project work" },
  { type: "kaizen", Icon: Lightbulb, title: "Kaizen", description: "Small continuous-improvement request" }
];

const otherDepartments = workOrderDepartments.filter((department) => !["Production", "SHE"].includes(department));

function reporterDepartmentOptions(current: string) {
  return current && !workOrderDepartments.some((department) => department === current)
    ? [current, ...workOrderDepartments]
    : workOrderDepartments;
}

type RequesterView = "dashboard" | "new" | "tracking" | "verify" | "account";
type RequesterStatusFilter = "all" | "open" | "in_progress" | "waiting" | "closed";
type RequesterTrackingScope = "department" | "all";

const statusesByFilter: Record<Exclude<RequesterStatusFilter, "all">, WorkOrderStatus[]> = {
  open: ["open", "acknowledged"], in_progress: ["in_progress", "returned"],
  waiting: ["pending_material", "resolved"], closed: ["closed", "cancelled"]
};
const filterLabels: Record<RequesterStatusFilter, string> = {
  all: "All", open: "Open", in_progress: "In Progress", waiting: "Waiting", closed: "Closed"
};

export function PublicRequesterPage() {
  const navigate = useNavigate();
  const { currentUser, loadingUsers, login, logout } = useCurrentUser();
  const signedRequester = currentUser?.role === "requester";
  const [masterData, setMasterData] = useState<MasterData>({ sections: [], machines: [], issueCategories: [] });
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [view, setView] = useState<RequesterView>("new");
  const [selectedDepartment, setSelectedDepartment] = useState<WorkOrderDepartment | null>(null);
  const [choosingOtherDepartment, setChoosingOtherDepartment] = useState(false);
  const [selectedType, setSelectedType] = useState<WorkOrderType | null>(null);
  const [categoryClosing, setCategoryClosing] = useState(false);
  const [form, setForm] = useState(initialRequesterForm);
  const [issueFiles, setIssueFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequesterStatusFilter>("all");
  const [trackingScope, setTrackingScope] = useState<RequesterTrackingScope>("department");
  const [search, setSearch] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState<Record<string, string>>({});
  const [actionId, setActionId] = useState("");
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadMasterData() {
    const next = await api.masterData();
    setMasterData(next);
    setForm((current) => ({ ...current, sectionId: current.sectionId || next.sections.find((section) => section.active)?.id || "" }));
  }

  async function loadAccountWorkOrders() {
    if (!signedRequester) { setWorkOrders([]); return; }
    const next = await api.workOrders();
    setWorkOrders(next);
  }

  async function loadRequesterNotifications() {
    if (!signedRequester || !currentUser) { setNotifications([]); return; }
    setNotifications(await api.notifications(currentUser.id));
  }

  useEffect(() => { loadMasterData().catch(console.error); }, []);
  useEffect(() => {
    if (signedRequester) {
      setView("dashboard");
      setTrackingScope("department");
      setSelectedDepartment(null); setSelectedType(null); setChoosingOtherDepartment(false);
      setForm((current) => ({ ...current, reportedByName: currentUser.name, reportedByDepartment: currentUser.department }));
      loadAccountWorkOrders().catch(console.error);
      loadRequesterNotifications().catch(console.error);
    } else {
      setWorkOrders([]); setNotifications([]); setNotificationsOpen(false); setView("new"); setSelectedDepartment(null); setSelectedType(null);
    }
  }, [currentUser?.id]);
  useLiveRefresh(["work-orders", "master-data", "notifications"], async () => {
    await loadMasterData();
    if (signedRequester) await Promise.all([loadAccountWorkOrders(), loadRequesterNotifications()]);
  }, { fallbackMs: 10000 });

  const isOffice = selectedType === "office";
  const activeSections = useMemo(() => masterData.sections.filter((section) => section.active), [masterData.sections]);
  const activeIssues = useMemo(() => masterData.issueCategories.filter((category) => category.active), [masterData.issueCategories]);
  const filteredMachines = useMemo(() => masterData.machines.filter((machine) => machine.active && machine.sectionId === form.sectionId), [masterData.machines, form.sectionId]);
  const sectionOptions = useMemo(() => activeSections.map((section) => ({ value: section.id, label: section.name })), [activeSections]);
  const machineOptions = useMemo(() => [...filteredMachines.map((machine) => ({ value: machine.id, label: machine.name, meta: machine.area })), { value: otherMachineValue, label: "Other place / equipment", meta: "Not listed above" }], [filteredMachines]);
  const issueOptions = useMemo(() => activeIssues.map((category) => ({ value: category.id, label: category.name })), [activeIssues]);
  const accountDepartment = workOrderDepartmentForUser(currentUser?.department || "");
  const prioritizedWorkOrders = useMemo(() => accountDepartment
    ? [...workOrders].sort((a, b) => Number(b.responsibleDepartment === accountDepartment) - Number(a.responsibleDepartment === accountDepartment))
    : workOrders, [accountDepartment, workOrders]);
  const departmentWorkOrders = useMemo(() => accountDepartment
    ? workOrders.filter((item) => item.responsibleDepartment === accountDepartment)
    : workOrders.filter((item) => item.requesterId === currentUser?.id), [accountDepartment, currentUser?.id, workOrders]);
  const stats = useMemo(() => ({
    open: departmentWorkOrders.filter((item) => statusesByFilter.open.includes(item.status)).length,
    in_progress: departmentWorkOrders.filter((item) => statusesByFilter.in_progress.includes(item.status)).length,
    waiting: departmentWorkOrders.filter((item) => statusesByFilter.waiting.includes(item.status)).length,
    closed: departmentWorkOrders.filter((item) => statusesByFilter.closed.includes(item.status)).length
  }), [departmentWorkOrders]);
  const pendingVerification = useMemo(() => workOrders.filter((item) => item.status === "resolved" && item.requesterId === currentUser?.id), [currentUser?.id, workOrders]);
  const unreadNotifications = useMemo(() => notifications.filter((notification) => !notification.readAt).length, [notifications]);
  const visibleWorkOrders = useMemo(() => {
    const scopedWorkOrders = trackingScope === "department" ? departmentWorkOrders : prioritizedWorkOrders;
    const byStatus = statusFilter === "all" ? scopedWorkOrders : scopedWorkOrders.filter((item) => statusesByFilter[statusFilter].includes(item.status));
    const query = search.trim().toLowerCase();
    return query ? byStatus.filter((item) => `${item.number} ${item.issueDescription} ${item.machineName} ${item.area}`.toLowerCase().includes(query)) : byStatus;
  }, [departmentWorkOrders, prioritizedWorkOrders, search, statusFilter, trackingScope]);

  function chooseDepartment(department: WorkOrderDepartment) {
    setSelectedDepartment(department);
    setChoosingOtherDepartment(false);
    setError("");
  }

  function chooseType(type: WorkOrderType) {
    if (categoryClosing || !selectedDepartment) return;
    setCategoryClosing(true); setError(""); setSuccess("");
    setForm((current) => ({ ...current, type, machineId: type === "office" ? "" : current.machineId, placeOrEquipment: "", issueCategoryId: type === "office" ? "" : current.issueCategoryId, reportedByName: signedRequester ? currentUser.name : current.reportedByName, reportedByDepartment: signedRequester ? currentUser.department : current.reportedByDepartment }));
    window.setTimeout(() => { setSelectedType(type); setCategoryClosing(false); }, 260);
  }

  function openView(next: RequesterView) {
    setView(next); setError("");
    if (next === "tracking") setTrackingScope("department");
    if (next !== "new") { setSelectedDepartment(null); setSelectedType(null); setChoosingOtherDepartment(false); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function showStatus(filter: Exclude<RequesterStatusFilter, "all">) { setTrackingScope("department"); setStatusFilter(filter); openView("tracking"); }

  async function openRequesterNotification(notification: NotificationRecord) {
    if (!currentUser) return;
    if (!notification.readAt) {
      await api.markNotificationRead(notification.id);
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
    }
    setNotificationsOpen(false);
    const workOrder = workOrders.find((item) => item.id === notification.workOrderId);
    if (workOrder?.status === "resolved" && workOrder.requesterId === currentUser.id) {
      openView("verify");
      return;
    }
    openView("tracking");
  }

  async function markAllRequesterNotificationsRead() {
    if (!currentUser) return;
    await api.markAllNotificationsRead(currentUser.id);
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((notification) => notification.readAt ? notification : { ...notification, readAt }));
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    if (!loginUsername.trim() || !loginPassword) return;
    setLoginBusy(true); setLoginError("");
    try {
      const user = await login(loginUsername, loginPassword);
      if (user.role !== "requester") {
        logout(); setLoginError("This sign-in is for requester accounts. Staff can use the main CMMS sign-in."); return;
      }
      setLoginOpen(false); setLoginPassword(""); setSuccess(""); setView("dashboard");
    } catch (nextError) { setLoginError(nextError instanceof Error ? nextError.message : "Unable to sign in."); }
    finally { setLoginBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedType || !selectedDepartment) return;
    const selectedMachine = filteredMachines.find((machine) => machine.id === form.machineId);
    const place = form.placeOrEquipment.trim();
    if (!isOffice && !form.machineId) { setError("Choose a machine or select Other place / equipment."); return; }
    if (!isOffice && form.machineId === otherMachineValue && !place) { setError("Enter the place or equipment involved."); return; }
    if (!isOffice && !form.issueCategoryId) { setError("Choose an issue category."); return; }
    if (!form.reportedByDepartment) { setError("Choose your department."); return; }
    setSubmitting(true); setError(""); setSuccess("");
    try {
      const payload = {
        type: selectedType, workDate: form.workDate || todayDate(), shiftGroup: selectedDepartment === "Production" ? form.shiftGroup : "N/A",
        sectionId: isOffice ? null : form.sectionId || null, machineId: isOffice ? null : selectedMachine?.id || null,
        location: isOffice ? place : selectedMachine?.area || place || "General",
        area: isOffice ? "Office" : selectedMachine?.area || "Other",
        machineName: isOffice ? place : selectedMachine?.name || place,
        reportedByName: signedRequester ? currentUser.name : form.reportedByName,
        reportedByDepartment: signedRequester ? currentUser.department : form.reportedByDepartment.trim() || "Not specified",
        responsibleDepartment: selectedDepartment,
        issueCategoryId: isOffice ? null : form.issueCategoryId, issueDescription: form.issueDescription
      };
      if (!signedRequester) {
        const submission = await api.createRequesterWorkOrder(payload);
        if (issueFiles.length) await api.uploadRequesterAttachments(submission.workOrder.id, issueFiles);
        navigate(`${submission.tracking.path}&created=1`);
        return;
      }

      const workOrder = await api.createWorkOrder({ ...payload, requesterId: currentUser.id });
      if (issueFiles.length) await api.uploadAttachments(workOrder.id, currentUser.id, "issue", issueFiles);
      setSuccess(`${workOrder.number} submitted successfully.`); setSelectedDepartment(null); setSelectedType(null);
      setForm({ ...initialRequesterForm, workDate: todayDate(), sectionId: form.sectionId, reportedByName: signedRequester ? currentUser.name : "", reportedByDepartment: signedRequester ? currentUser.department : "" });
      setIssueFiles([]);
      await loadAccountWorkOrders(); setStatusFilter("open"); setView("tracking");
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to submit work order."); }
    finally { setSubmitting(false); }
  }

  async function verifyWorkOrder(workOrder: WorkOrder, status: "closed" | "returned") {
    if (!signedRequester) return;
    const note = verificationNotes[workOrder.id]?.trim() || "";
    if (status === "returned" && !note) { setError("Add a short reason before returning the work order to maintenance."); return; }
    setActionId(workOrder.id); setError("");
    try {
      await api.updateWorkOrderStatus(workOrder.id, { status, actorId: currentUser.id, note: note || "Requester verified the completed work." });
      setSuccess(status === "closed" ? `${workOrder.number} verified and closed.` : `${workOrder.number} returned to maintenance.`);
      setVerificationNotes((current) => ({ ...current, [workOrder.id]: "" })); setDetail(null); await loadAccountWorkOrders();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to update the work order."); }
    finally { setActionId(""); }
  }

  async function openDetail(workOrder: WorkOrder) {
    if (!signedRequester) return;
    setDetailLoading(true);
    try { setDetail(await api.workOrder(workOrder.id)); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to load work order details."); }
    finally { setDetailLoading(false); }
  }

  if (loadingUsers) return <div className="requester-app-loading">Preparing requester app...</div>;

  return <div className={`requester-app-shell ${signedRequester ? "is-account" : "is-guest"}`}>
    <header className="requester-app-topbar">
      <div className="requester-app-brand"><span><img src="/brand/sugi_symbol.png" alt="Sugihara Grand" /></span><div><small>SUGI CMMS</small><strong>{signedRequester ? `${currentUser.department} Requester` : "Guest Request"}</strong></div></div>
      <div className="requester-app-account-action">{signedRequester ? <><div className="notification-wrap requester-notification-wrap"><button className="requester-notification-button" type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-label="Requester notifications" aria-expanded={notificationsOpen}><Bell size={18} />{unreadNotifications ? <b className="notification-count">{unreadNotifications}</b> : null}</button>{notificationsOpen ? <div className="notification-panel requester-notification-panel"><div className="panel-header"><strong>Notifications</strong><button type="button" onClick={markAllRequesterNotificationsRead}>Mark all read</button></div><div className="notification-list">{notifications.length ? notifications.slice(0, 10).map((notification) => <button type="button" key={notification.id} className={`notification-item ${notification.readAt ? "" : "unread"}`} onClick={() => void openRequesterNotification(notification)}><strong>{notification.title}</strong><span>{notification.body}</span><time>{formatDateTime(notification.createdAt)}</time></button>) : <p className="requester-notification-empty">No notifications yet.</p>}</div><PushNotificationControl compact /></div> : null}</div><button type="button" onClick={() => openView("account")}><UserCircle2 size={18} /><span>{currentUser.name}</span></button></> : currentUser ? <a href="/"><Home size={17} />Return to CMMS</a> : <button type="button" onClick={() => setLoginOpen(true)}><LogIn size={17} />Department sign in</button>}</div>
    </header>

    <main className="requester-app-main">
      {success ? <div className="requester-app-toast success"><CheckCircle2 size={18} />{success}<button type="button" onClick={() => setSuccess("")} aria-label="Dismiss"><X size={15} /></button></div> : null}
      {error ? <div className="requester-app-toast error"><RefreshCcw size={18} />{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={15} /></button></div> : null}
      {signedRequester && view === "dashboard" ? <RequesterDashboard user={currentUser} workOrders={departmentWorkOrders} stats={stats} pendingVerification={pendingVerification} onStatus={showStatus} onView={openView} onDetail={openDetail} /> : null}
      {view === "new" ? <section className={`requester-new-view ${selectedType ? "" : "requester-new-view-locked"}`} aria-hidden={!selectedType}>
        <div className="requester-new-heading"><div><p>{signedRequester ? "Account request" : "Guest request"}</p><h1>New Work Order</h1><span>{signedRequester ? "This request will be saved under your account." : "No account needed. Submit an issue in a few simple steps."}</span></div>{!signedRequester ? <button type="button" onClick={() => setLoginOpen(true)}><ShieldCheck size={16} />Sign in to track</button> : null}</div>
        {selectedType && selectedDepartment ? <RequesterForm selectedType={selectedType} selectedDepartment={selectedDepartment} form={form} setForm={setForm} isOffice={isOffice} sectionOptions={sectionOptions} machineOptions={machineOptions} issueCategoryOptions={issueOptions} issueFiles={issueFiles} setIssueFiles={setIssueFiles} submitting={submitting} signedRequester={signedRequester} onChangeType={() => setSelectedType(null)} onSubmit={submit} /> : <section className="requester-form-panel requester-form-locked"><div className="requester-panel-heading"><span className="requester-panel-icon"><ShieldCheck size={18} /></span><div><h2>Choose a department and category</h2><span>The request form opens after your selections.</span></div></div></section>}
      </section> : null}
      {signedRequester && view === "tracking" ? <RequesterTracking workOrders={visibleWorkOrders} departmentLabel={accountDepartment || "My requests"} scope={trackingScope} statusFilter={statusFilter} search={search} detailLoading={detailLoading} onScope={setTrackingScope} onFilter={setStatusFilter} onSearch={setSearch} onDetail={openDetail} onNew={() => openView("new")} /> : null}
      {signedRequester && view === "verify" ? <RequesterVerification workOrders={pendingVerification} notes={verificationNotes} actionId={actionId} detailLoading={detailLoading} onNote={(id, note) => setVerificationNotes((current) => ({ ...current, [id]: note }))} onVerify={verifyWorkOrder} onDetail={openDetail} /> : null}
      {signedRequester && view === "account" ? <section className="requester-account-view"><div className="requester-account-avatar">{initialsFor(currentUser.name)}</div><p>Department requester</p><h1>{currentUser.name}</h1><span>{currentUser.title}</span><dl><div><dt>Department</dt><dd>{currentUser.department}</dd></div><div><dt>Username</dt><dd>{currentUser.username}</dd></div><div><dt>Tracked requests</dt><dd>{departmentWorkOrders.length}</dd></div></dl><PwaInstallButton /><PushNotificationControl /><button className="requester-signout" type="button" onClick={() => { logout(); setSuccess("Signed out. You can continue as a guest."); }}><LogOut size={17} />Sign out and continue as guest</button></section> : null}
    </main>

    <nav className="requester-app-tabbar" aria-label="Requester navigation">{signedRequester ? <><RequesterTab active={view === "dashboard"} label="Home" Icon={Home} onClick={() => openView("dashboard")} /><RequesterTab active={view === "new"} label="New" Icon={Send} onClick={() => openView("new")} /><RequesterTab active={view === "tracking"} label="Track" Icon={History} onClick={() => openView("tracking")} /><RequesterTab active={view === "verify"} label="Verify" Icon={ShieldCheck} badge={pendingVerification.length} onClick={() => openView("verify")} /><RequesterTab active={view === "account"} label="Account" Icon={UserCircle2} onClick={() => openView("account")} /></> : <><RequesterTab active label="New Request" Icon={Send} onClick={() => openView("new")} /><RequesterTab active={false} label="Sign in to track" Icon={LogIn} onClick={() => setLoginOpen(true)} /></>}</nav>

    {view === "new" && !selectedType ? <div className={`requester-category-gate ${categoryClosing ? "is-exiting" : ""}`} role="dialog" aria-modal="true" aria-labelledby="requester-category-title" aria-busy={categoryClosing} onClick={(event) => { if (signedRequester && event.target === event.currentTarget) openView("dashboard"); }}><section className="requester-category-card" key={selectedDepartment ? "request-type" : choosingOtherDepartment ? "other-department" : "primary-department"}>{signedRequester ? <button className="requester-category-close" type="button" disabled={categoryClosing} onClick={() => openView("dashboard")} aria-label="Cancel new work order and return home"><X size={20} /></button> : null}<div className="requester-category-heading"><span><img src="/brand/sugi_symbol.png" alt="" /></span><div><p>{selectedDepartment ? `FOR ${selectedDepartment.toUpperCase()}` : signedRequester ? "ACCOUNT REQUEST" : "CONTINUE AS GUEST"}</p><h1 id="requester-category-title">{selectedDepartment ? "What type of work is needed?" : choosingOtherDepartment ? "Which department is responsible?" : "Which department is this for?"}</h1></div></div><p className="requester-category-copy">{selectedDepartment ? "Choose Maintenance, Project, or Kaizen." : choosingOtherDepartment ? "Select the department PIC who should prioritize this work order." : "Production and SHE are listed first. Use Others for the remaining departments."}</p>{selectedDepartment ? <div className="requester-type-grid">{requestTypes.map(({ type, Icon, title, description }) => <button className={`requester-type-card type-${type}`} type="button" key={type} disabled={categoryClosing} onClick={() => chooseType(type)}><span><Icon size={24} /></span><strong>{title}</strong><small>{description}</small></button>)}</div> : choosingOtherDepartment ? <div className="requester-department-grid">{otherDepartments.map((department) => <button type="button" key={department} onClick={() => chooseDepartment(department)}><Building2 size={20} /><strong>{department}</strong></button>)}</div> : <div className="requester-type-grid requester-department-primary"><button className="requester-type-card type-production" type="button" onClick={() => chooseDepartment("Production")}><span><Factory size={24} /></span><strong>Production</strong><small>Production-owned issue</small></button><button className="requester-type-card type-she" type="button" onClick={() => chooseDepartment("SHE")}><span><ShieldCheck size={24} /></span><strong>SHE</strong><small>Safety, Health & Environment</small></button><button className="requester-type-card type-others" type="button" onClick={() => setChoosingOtherDepartment(true)}><span><Building2 size={24} /></span><strong>Others</strong><small>Logistic, DTU, R&amp;D, Account, Management, or Business Development</small></button></div>}{selectedDepartment || choosingOtherDepartment ? <button className="requester-category-back" type="button" onClick={() => { setSelectedDepartment(null); setChoosingOtherDepartment(false); }}><ArrowLeft size={15} />Change department</button> : null}<small className="requester-category-note"><ShieldCheck size={14} />{signedRequester ? `Signed in as ${currentUser.name}` : "Guest access · new requests only"}</small>{!signedRequester ? currentUser ? <a className="requester-category-signin" href="/"><Home size={15} />Return to staff CMMS</a> : <button className="requester-category-signin" type="button" onClick={() => setLoginOpen(true)}><LogIn size={15} />Department user? Sign in to track</button> : null}</section></div> : null}

    {loginOpen ? <div className="requester-login-backdrop"><form className="requester-login-card" role="dialog" aria-modal="true" aria-labelledby="requester-login-title" onSubmit={submitLogin}><button className="requester-dialog-close" type="button" onClick={() => setLoginOpen(false)} aria-label="Close sign in"><X size={18} /></button><span className="requester-login-icon"><ShieldCheck size={24} /></span><p>Department access</p><h2 id="requester-login-title">Sign in to your requester account</h2><small>Track department work orders, review maintenance updates, and verify work that you requested.</small><label>Username<input value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} autoComplete="current-password" required /></label>{loginError ? <p className="error-line">{loginError}</p> : null}<button className="primary-action" type="submit" disabled={loginBusy}>{loginBusy ? "Signing in..." : "Open my requester app"}<LogIn size={17} /></button><button className="requester-guest-continue" type="button" onClick={() => setLoginOpen(false)}>Continue as guest</button></form></div> : null}
    {detail ? <RequesterDetailDialog detail={detail} canVerify={detail.requesterId === currentUser?.id} onClose={() => setDetail(null)} onVerify={verifyWorkOrder} actionId={actionId} note={verificationNotes[detail.id] || ""} onNote={(note) => setVerificationNotes((current) => ({ ...current, [detail.id]: note }))} /> : null}
  </div>;
}

function RequesterForm({ selectedType, selectedDepartment, form, setForm, isOffice, sectionOptions, machineOptions, issueCategoryOptions, issueFiles, setIssueFiles, submitting, signedRequester, onChangeType, onSubmit }: {
  selectedType: WorkOrderType; selectedDepartment: WorkOrderDepartment; form: typeof initialRequesterForm; setForm: React.Dispatch<React.SetStateAction<typeof initialRequesterForm>>; isOffice: boolean;
  sectionOptions: Array<{ value: string; label: string }>; machineOptions: Array<{ value: string; label: string; meta: string }>; issueCategoryOptions: Array<{ value: string; label: string }>;
  issueFiles: File[]; setIssueFiles: (files: File[]) => void; submitting: boolean; signedRequester: boolean; onChangeType: () => void; onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className="requester-form-panel requester-account-form requester-form-enter" onSubmit={onSubmit}>
      <div className="requester-panel-heading requester-form-heading">
        <span className="requester-panel-icon"><Send size={18} /></span>
        <div><h2>{workOrderTypeLabels[selectedType]} Request</h2><span>For {selectedDepartment} · tell us which machine and what happened</span></div>
        <button className="change-request-type" type="button" onClick={onChangeType}><ArrowLeft size={15} />Change</button>
      </div>

      <div className="requester-step-label"><span>1</span>Request details</div>
      <div className={`form-grid ${selectedDepartment === "Production" ? "two-columns" : ""}`}>
        <label><CalendarDays size={15} />Date<input type="date" value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} required /></label>
        {selectedDepartment === "Production" ? (
          <label>Shift group<select value={form.shiftGroup} onChange={(event) => setForm({ ...form, shiftGroup: event.target.value as ShiftGroup })}><option value="A">A</option><option value="B">B</option></select></label>
        ) : null}
      </div>

      {isOffice ? (
        <label><MapPin size={15} />Place / location<input value={form.placeOrEquipment} onChange={(event) => setForm({ ...form, placeOrEquipment: event.target.value })} placeholder="Example: Finance office, meeting room, pantry" required /></label>
      ) : (
        <>
          <SearchableSelect label="Section" icon={<Factory size={15} />} value={form.sectionId} options={sectionOptions} placeholder="Choose section" onChange={(sectionId) => setForm({ ...form, sectionId, machineId: "", placeOrEquipment: "" })} />
          <SearchableSelect label="Machine / equipment" value={form.machineId} options={machineOptions} placeholder="Choose or search machine" onChange={(machineId) => setForm({ ...form, machineId, placeOrEquipment: "" })} />
          {form.machineId === otherMachineValue ? <label><MapPin size={15} />Place or equipment<input value={form.placeOrEquipment} onChange={(event) => setForm({ ...form, placeOrEquipment: event.target.value })} placeholder="Enter the exact place or equipment" required /></label> : null}
          <SearchableSelect label="Issue category" value={form.issueCategoryId} options={issueCategoryOptions} placeholder="Choose or search issue" onChange={(issueCategoryId) => setForm({ ...form, issueCategoryId })} />
        </>
      )}

      <div className="requester-step-label"><span>2</span>Your details</div>
      <div className={`form-grid ${isOffice ? "requester-single-field" : "two-columns"}`}>
        <label><UserRound size={15} />Your name<input value={form.reportedByName} onChange={(event) => setForm({ ...form, reportedByName: event.target.value })} placeholder="Enter your name" readOnly={signedRequester} required /></label>
        {!isOffice ? <label>Department <small>{signedRequester ? "From account" : "Required"}</small><select value={form.reportedByDepartment} onChange={(event) => setForm({ ...form, reportedByDepartment: event.target.value })} disabled={signedRequester} required><option value="">Choose department</option>{reporterDepartmentOptions(form.reportedByDepartment).map((department) => <option key={department} value={department}>{department}</option>)}</select></label> : null}
      </div>

      <div className="requester-step-label"><span>3</span>Describe the issue</div>
      <label>What happened?<textarea value={form.issueDescription} onChange={(event) => setForm({ ...form, issueDescription: event.target.value })} rows={5} placeholder="Describe what is wrong, when it started, and anything maintenance should know" required /></label>
      <MultiPhotoPicker files={issueFiles} onChange={setIssueFiles} disabled={submitting} />
      <button className="primary-action" type="submit" disabled={submitting}><Send size={17} />{submitting ? "Submitting..." : "Submit Work Order"}</button>
    </form>
  );
}

function RequesterDashboard({ user, workOrders, stats, pendingVerification, onStatus, onView, onDetail }: { user: User; workOrders: WorkOrder[]; stats: Record<Exclude<RequesterStatusFilter, "all">, number>; pendingVerification: WorkOrder[]; onStatus: (filter: Exclude<RequesterStatusFilter, "all">) => void; onView: (view: RequesterView) => void; onDetail: (workOrder: WorkOrder) => void; }) {
  return <section className="requester-dashboard-view"><header className="requester-dashboard-hero"><div><p>Welcome back, {user.name.split(" ")[0]}</p><h1>Your Requester Dashboard</h1><span>Track your department's work orders and verify completed work.</span></div><button type="button" onClick={() => onView("new")}><Send size={18} />New Work Order</button></header><div className="requester-account-stats"><button type="button" onClick={() => onStatus("open")}><Activity size={18} /><span>Open</span><strong>{stats.open}</strong></button><button type="button" onClick={() => onStatus("in_progress")}><Wrench size={18} /><span>In Progress</span><strong>{stats.in_progress}</strong></button><button type="button" onClick={() => onStatus("waiting")}><Clock3 size={18} /><span>Waiting</span><strong>{stats.waiting}</strong></button><button type="button" onClick={() => onStatus("closed")}><CheckCircle2 size={18} /><span>Closed</span><strong>{stats.closed}</strong></button></div>{pendingVerification.length ? <button className="requester-verification-banner" type="button" onClick={() => onView("verify")}><span><ShieldCheck size={23} /></span><div><strong>{pendingVerification.length} work order{pendingVerification.length === 1 ? "" : "s"} ready for verification</strong><small>Review the repair and close it, or return it to maintenance.</small></div><Eye size={20} /></button> : <div className="requester-clear-banner"><CheckCircle2 size={19} /><span><strong>No verification waiting</strong><small>Completed repairs needing your decision will appear here.</small></span></div>}<section className="requester-dashboard-list"><div className="requester-view-heading"><div><p>Department updates</p><h2>Recent Work Orders</h2></div><button type="button" onClick={() => onView("tracking")}>View all</button></div>{workOrders.length ? workOrders.slice(0, 5).map((workOrder) => <RequesterWorkOrderCard key={workOrder.id} workOrder={workOrder} onDetail={onDetail} />) : <RequesterEmpty title="No department requests yet" copy="New work orders for your department will appear here." />}</section></section>;
}

function RequesterTracking({ workOrders, departmentLabel, scope, statusFilter, search, detailLoading, onScope, onFilter, onSearch, onDetail, onNew }: { workOrders: WorkOrder[]; departmentLabel: string; scope: RequesterTrackingScope; statusFilter: RequesterStatusFilter; search: string; detailLoading: boolean; onScope: (scope: RequesterTrackingScope) => void; onFilter: (filter: RequesterStatusFilter) => void; onSearch: (value: string) => void; onDetail: (workOrder: WorkOrder) => void; onNew: () => void; }) {
  return <section className="requester-tracking-view"><div className="requester-view-heading"><div><p>Department tracking</p><h1>Track Work Orders</h1><span>Your department is shown by default. Switch to All departments whenever needed.</span></div><button type="button" onClick={onNew}><Send size={16} />New Request</button></div><label className="requester-tracking-search"><Search size={17} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search WO number, machine, or issue" /></label><div className="requester-filter-tabs"><button type="button" className={scope === "department" ? "active" : ""} onClick={() => onScope("department")}>{departmentLabel}</button><button type="button" className={scope === "all" ? "active" : ""} onClick={() => onScope("all")}>All departments</button></div><div className="requester-filter-tabs">{(Object.keys(filterLabels) as RequesterStatusFilter[]).map((filter) => <button type="button" className={statusFilter === filter ? "active" : ""} key={filter} onClick={() => onFilter(filter)}>{filterLabels[filter]}</button>)}</div><div className="requester-account-list">{workOrders.length ? workOrders.map((workOrder) => <RequesterWorkOrderCard key={workOrder.id} workOrder={workOrder} onDetail={onDetail} busy={detailLoading} />) : <RequesterEmpty title="No matching work orders" copy="Try another status, scope, or search phrase." />}</div></section>;
}

function RequesterVerification({ workOrders, notes, actionId, detailLoading, onNote, onVerify, onDetail }: { workOrders: WorkOrder[]; notes: Record<string, string>; actionId: string; detailLoading: boolean; onNote: (id: string, note: string) => void; onVerify: (workOrder: WorkOrder, status: "closed" | "returned") => void; onDetail: (workOrder: WorkOrder) => void; }) {
  return <section className="requester-verify-view"><div className="requester-view-heading"><div><p>Requester decision</p><h1>Verify Completed Work</h1><span>Check the repair result before closing or returning the job.</span></div><ShieldCheck size={28} /></div>{workOrders.length ? <div className="requester-verification-list">{workOrders.map((workOrder) => <article className="requester-verification-card" key={workOrder.id}><div className="card-topline"><strong>{workOrder.number}</strong><StatusBadge status={workOrder.status} /></div><h2>{workOrder.machineName || workOrder.location}</h2><p>{workOrder.issueDescription}</p>{workOrder.completionNote ? <blockquote><strong>Maintenance note</strong>{workOrder.completionNote}</blockquote> : null}<button className="requester-view-evidence" type="button" disabled={detailLoading} onClick={() => onDetail(workOrder)}><Eye size={16} />View timeline and completion photos</button><label>Verification note <small>Required only when returning</small><textarea rows={3} value={notes[workOrder.id] || ""} onChange={(event) => onNote(workOrder.id, event.target.value)} placeholder="Add your verification note" /></label><div className="requester-verification-actions"><button type="button" className="verify" disabled={Boolean(actionId)} onClick={() => onVerify(workOrder, "closed")}><CheckCircle2 size={17} />{actionId === workOrder.id ? "Saving..." : "Verify & Close"}</button><button type="button" className="return" disabled={Boolean(actionId)} onClick={() => onVerify(workOrder, "returned")}><RefreshCcw size={17} />Return to Maintenance</button></div></article>)}</div> : <RequesterEmpty title="Nothing to verify" copy="When maintenance resolves one of your work orders, it will appear here." />}</section>;
}

function RequesterWorkOrderCard({ workOrder, onDetail, busy = false }: { workOrder: WorkOrder; onDetail: (workOrder: WorkOrder) => void; busy?: boolean }) {
  function openCard() {
    if (!busy) onDetail(workOrder);
  }

  return <article className={`requester-account-card status-${workOrder.status}`} role="button" tabIndex={busy ? -1 : 0} aria-disabled={busy} aria-label={`Open details for ${workOrder.number}`} onClick={openCard} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCard(); } }}><div className="card-topline"><strong>{workOrder.number}</strong><StatusBadge status={workOrder.status} /></div><span className="requester-department-chip">{workOrder.responsibleDepartment}</span><h3>{workOrder.machineName || workOrder.location}</h3><p>{workOrder.issueDescription}</p><div className="card-meta"><span>{workOrderTypeLabels[workOrder.type]}</span><span>{workOrder.area}</span>{workOrder.responsibleDepartment === "Production" && workOrder.shiftGroup !== "N/A" ? <span>Shift {workOrder.shiftGroup}</span> : null}</div><footer><time>{formatDateTime(workOrder.updatedAt)}</time><span className="requester-card-open-hint"><Eye size={15} />Tap to open</span></footer></article>;
}

function RequesterDetailDialog({ detail, canVerify, onClose, onVerify, actionId, note, onNote }: { detail: WorkOrderDetail; canVerify: boolean; onClose: () => void; onVerify: (workOrder: WorkOrder, status: "closed" | "returned") => void; actionId: string; note: string; onNote: (note: string) => void; }) {
  const [previewPhoto, setPreviewPhoto] = useState<{ src: string; alt: string; label: string } | null>(null);

  return <><div className="requester-detail-backdrop"><section className="requester-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="requester-detail-title"><button className="requester-dialog-close" type="button" onClick={onClose} aria-label="Close details"><X size={18} /></button><div className="requester-detail-title"><p>{detail.number}</p><h2 id="requester-detail-title">{detail.machineName || detail.location}</h2><StatusBadge status={detail.status} /></div><p className="requester-detail-issue">{detail.issueDescription}</p><dl><div><dt>Responsible department</dt><dd>{detail.responsibleDepartment}</dd></div><div><dt>Area</dt><dd>{detail.area}</dd></div><div><dt>Category</dt><dd>{detail.issueCategory?.name || "Office / general"}</dd></div><div><dt>Assigned to</dt><dd>{detail.assignedTo?.name || "Waiting for assignment"}</dd></div><div><dt>Updated</dt><dd>{formatDateTime(detail.updatedAt)}</dd></div></dl>{detail.completionNote ? <div className="requester-completion-note"><strong>Maintenance completion note</strong><p>{detail.completionNote}</p></div> : null}<div className="requester-detail-photos"><h3>Photos</h3>{detail.attachments.length ? <div>{detail.attachments.map((attachment) => { const label = attachment.kind.replace("_", " "); return <button type="button" key={attachment.id} onClick={() => setPreviewPhoto({ src: mediaUrl(attachment.url), alt: attachment.originalName, label })}><img src={mediaUrl(attachment.url)} alt={attachment.originalName} /><span>{label}</span></button>; })}</div> : <p>No photos uploaded.</p>}</div><div className="requester-detail-timeline"><h3>Timeline</h3>{detail.activities.map((activity) => <article key={activity.id}><span /><div><strong>{activity.message}</strong><time>{formatDateTime(activity.createdAt)}</time></div></article>)}</div>{detail.status === "resolved" && canVerify ? <div className="requester-detail-verification"><label>Verification note<textarea rows={3} value={note} onChange={(event) => onNote(event.target.value)} placeholder="Required if returning to maintenance" /></label><div className="requester-verification-actions"><button type="button" className="verify" disabled={Boolean(actionId)} onClick={() => onVerify(detail, "closed")}><CheckCircle2 size={17} />Verify & Close</button><button type="button" className="return" disabled={Boolean(actionId)} onClick={() => onVerify(detail, "returned")}><RefreshCcw size={17} />Return</button></div></div> : null}</section></div>{previewPhoto ? <ImageLightbox {...previewPhoto} onClose={() => setPreviewPhoto(null)} /> : null}</>;
}

function RequesterEmpty({ title, copy }: { title: string; copy: string }) { return <div className="requester-empty"><ClipboardList size={30} /><h2>{title}</h2><p>{copy}</p></div>; }
function RequesterTab({ active, label, Icon, badge = 0, onClick }: { active: boolean; label: string; Icon: LucideIcon; badge?: number; onClick: () => void; }) { return <button type="button" className={active ? "active" : ""} onClick={onClick}><span><Icon size={20} />{badge ? <b>{badge}</b> : null}</span><small>{label}</small></button>; }
function initialsFor(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
