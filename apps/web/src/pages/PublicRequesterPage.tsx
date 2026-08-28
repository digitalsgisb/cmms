import {
  Activity, ArrowLeft, Building2, CalendarDays, CheckCircle2, ClipboardList, Clock3, Factory,
  Hammer, ImagePlus, Lightbulb, MapPin, Send, ShieldCheck, UserRound, Wrench, type LucideIcon
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { MasterData, PublicRequesterWorkOrder, ShiftGroup, WorkOrderType } from "@sugi-cmms/shared";
import { workOrderStatusLabels, workOrderTypeLabels } from "@sugi-cmms/shared";
import { api } from "../api/client";
import { PwaInstallButton } from "../components/PwaInstallButton";
import { SearchableSelect } from "../components/SearchableSelect";
import { StatusBadge } from "../components/Badges";
import { formatDateTime } from "../utils/format";
import { useLiveRefresh } from "../hooks/useLiveRefresh";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

const otherMachineValue = "__other__";
const initialRequesterForm = {
  type: "maintenance" as WorkOrderType,
  workDate: todayDate(),
  shiftGroup: "A" as ShiftGroup,
  sectionId: "",
  machineId: "",
  placeOrEquipment: "",
  reportedByName: "",
  reportedByDepartment: "",
  issueCategoryId: "",
  issueDescription: ""
};

const requestTypes: Array<{ type: WorkOrderType; Icon: LucideIcon; title: string; description: string }> = [
  { type: "office", Icon: Building2, title: "Office", description: "Office, IT, utilities, or shared facilities" },
  { type: "maintenance", Icon: Wrench, title: "Maintenance", description: "Machine breakdown or corrective maintenance" },
  { type: "project", Icon: Hammer, title: "Project", description: "Planned fabrication, installation, or project work" },
  { type: "kaizen", Icon: Lightbulb, title: "Kaizen", description: "Small continuous-improvement request" }
];

export function PublicRequesterPage() {
  const [masterData, setMasterData] = useState<MasterData>({ sections: [], machines: [], issueCategories: [] });
  const [workOrders, setWorkOrders] = useState<PublicRequesterWorkOrder[]>([]);
  const [selectedType, setSelectedType] = useState<WorkOrderType | null>(null);
  const [form, setForm] = useState(initialRequesterForm);
  const [issueFiles, setIssueFiles] = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadRequesterData() {
    const [nextMasterData, nextWorkOrders] = await Promise.all([api.masterData(), api.requesterWorkOrders()]);
    setMasterData(nextMasterData);
    setWorkOrders(nextWorkOrders);
    setForm((current) => ({
      ...current,
      sectionId: current.sectionId || nextMasterData.sections.find((section) => section.active)?.id || ""
    }));
  }

  useEffect(() => {
    loadRequesterData().catch(console.error);
  }, []);
  useLiveRefresh(["work-orders", "master-data"], loadRequesterData);

  const isOffice = selectedType === "office";
  const activeSections = useMemo(() => masterData.sections.filter((section) => section.active), [masterData.sections]);
  const activeIssueCategories = useMemo(() => masterData.issueCategories.filter((category) => category.active), [masterData.issueCategories]);
  const filteredMachines = useMemo(
    () => masterData.machines.filter((machine) => machine.active && machine.sectionId === form.sectionId),
    [masterData.machines, form.sectionId]
  );
  const sectionOptions = useMemo(() => activeSections.map((section) => ({ value: section.id, label: section.name })), [activeSections]);
  const machineOptions = useMemo(() => [
    ...filteredMachines.map((machine) => ({ value: machine.id, label: machine.name, meta: machine.area })),
    { value: otherMachineValue, label: "Other place / equipment", meta: "Not listed above" }
  ], [filteredMachines]);
  const issueCategoryOptions = useMemo(
    () => activeIssueCategories.map((category) => ({ value: category.id, label: category.name })),
    [activeIssueCategories]
  );
  const requesterStats = useMemo(() => ({
    new: workOrders.filter((workOrder) => workOrder.status === "open").length,
    moving: workOrders.filter((workOrder) => ["acknowledged", "in_progress", "returned"].includes(workOrder.status)).length,
    waiting: workOrders.filter((workOrder) => ["pending_material", "resolved"].includes(workOrder.status)).length,
    closed: workOrders.filter((workOrder) => workOrder.status === "closed").length
  }), [workOrders]);
  const latestWorkOrder = workOrders[0];

  function chooseType(type: WorkOrderType) {
    setSelectedType(type);
    setError("");
    setSuccess("");
    setForm((current) => ({
      ...current,
      type,
      machineId: type === "office" ? "" : current.machineId,
      placeOrEquipment: "",
      issueCategoryId: type === "office" ? "" : current.issueCategoryId
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedType) return;

    const selectedMachine = filteredMachines.find((machine) => machine.id === form.machineId);
    const placeOrEquipment = form.placeOrEquipment.trim();
    if (!isOffice && !form.machineId) {
      setError("Choose a machine or select Other place / equipment.");
      return;
    }
    if (!isOffice && form.machineId === otherMachineValue && !placeOrEquipment) {
      setError("Enter the place or equipment involved.");
      return;
    }
    if (!isOffice && !form.issueCategoryId) {
      setError("Choose an issue category.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const locationName = isOffice ? placeOrEquipment : selectedMachine?.area || placeOrEquipment || "General";
      const machineName = isOffice ? placeOrEquipment : selectedMachine?.name || placeOrEquipment;
      const workOrder = await api.createRequesterWorkOrder({
        type: selectedType,
        workDate: form.workDate || todayDate(),
        shiftGroup: form.shiftGroup,
        sectionId: isOffice ? null : form.sectionId || null,
        machineId: isOffice ? null : selectedMachine?.id || null,
        location: locationName,
        area: isOffice ? "Office" : selectedMachine?.area || "Other",
        machineName,
        reportedByName: form.reportedByName,
        reportedByDepartment: form.reportedByDepartment.trim() || "Not specified",
        issueCategoryId: isOffice ? null : form.issueCategoryId,
        issueDescription: form.issueDescription
      });

      if (issueFiles?.length) await api.uploadRequesterAttachments(workOrder.id, issueFiles);
      setSuccess(`${workOrder.number} submitted successfully.`);
      setSelectedType(null);
      setForm({ ...initialRequesterForm, workDate: todayDate(), sectionId: form.sectionId });
      setIssueFiles(null);
      await loadRequesterData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to submit work order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="requester-kiosk">
      <section className="requester-kiosk-header">
        <div className="requester-hero-copy">
          <p className="eyebrow"><span className="requester-live-dot" aria-hidden="true" />Sugi CMMS Requester</p>
          <h1>Issue Work Order</h1>
          <div className="requester-hero-meta">
            <span><ShieldCheck size={15} aria-hidden="true" />No account needed</span>
            <span><ClipboardList size={15} aria-hidden="true" />{workOrders.length} tracked</span>
            {latestWorkOrder ? <span><Clock3 size={15} aria-hidden="true" />Latest {latestWorkOrder.number}</span> : null}
          </div>
        </div>
        <PwaInstallButton />
        <div className="requester-status-strip">
          <article><Activity size={16} aria-hidden="true" /><span>New</span><strong>{requesterStats.new}</strong></article>
          <article><Wrench size={16} aria-hidden="true" /><span>Moving</span><strong>{requesterStats.moving}</strong></article>
          <article><Clock3 size={16} aria-hidden="true" /><span>Waiting</span><strong>{requesterStats.waiting}</strong></article>
          <article><CheckCircle2 size={16} aria-hidden="true" /><span>Closed</span><strong>{requesterStats.closed}</strong></article>
        </div>
      </section>

      <div className="requester-workspace">
        {!selectedType ? (
          <section className="requester-form-panel requester-type-panel">
            <div className="requester-panel-heading">
              <span className="requester-panel-icon"><Send size={18} aria-hidden="true" /></span>
              <div><h2>What do you need?</h2><span>Choose one request type to begin</span></div>
            </div>
            <div className="requester-type-grid">
              {requestTypes.map(({ type, Icon, title, description }) => (
                <button className={`requester-type-card type-${type}`} type="button" key={type} onClick={() => chooseType(type)}>
                  <span><Icon size={24} aria-hidden="true" /></span><strong>{title}</strong><small>{description}</small>
                </button>
              ))}
            </div>
            {success ? <p className="success-line">{success}</p> : null}
          </section>
        ) : (
          <form className="requester-form-panel" onSubmit={submit}>
            <div className="requester-panel-heading requester-form-heading">
              <span className="requester-panel-icon"><Send size={18} aria-hidden="true" /></span>
              <div><h2>{workOrderTypeLabels[selectedType]} Request</h2><span>{isOffice ? "Tell us the place and what happened" : "Tell us which machine and what happened"}</span></div>
              <button className="change-request-type" type="button" onClick={() => setSelectedType(null)}><ArrowLeft size={15} />Change</button>
            </div>

            <div className="requester-step-label"><span>1</span>Request details</div>
            <div className="form-grid two-columns">
              <label><CalendarDays size={15} aria-hidden="true" />Date<input type="date" value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} required /></label>
              <label>Shift group<select value={form.shiftGroup} onChange={(event) => setForm({ ...form, shiftGroup: event.target.value as ShiftGroup })}><option value="A">A</option><option value="B">B</option></select></label>
            </div>

            {isOffice ? (
              <label><MapPin size={15} aria-hidden="true" />Place / location<input value={form.placeOrEquipment} onChange={(event) => setForm({ ...form, placeOrEquipment: event.target.value })} placeholder="Example: Finance office, meeting room, pantry" required /></label>
            ) : (
              <>
                <SearchableSelect label="Section" icon={<Factory size={15} aria-hidden="true" />} value={form.sectionId} options={sectionOptions} placeholder="Choose section" onChange={(sectionId) => setForm({ ...form, sectionId, machineId: "", placeOrEquipment: "" })} />
                <SearchableSelect label="Machine / equipment" value={form.machineId} options={machineOptions} placeholder="Choose or search machine" onChange={(machineId) => setForm({ ...form, machineId, placeOrEquipment: "" })} />
                {form.machineId === otherMachineValue ? <label><MapPin size={15} aria-hidden="true" />Place or equipment<input value={form.placeOrEquipment} onChange={(event) => setForm({ ...form, placeOrEquipment: event.target.value })} placeholder="Enter the exact place or equipment" required /></label> : null}
                <SearchableSelect label="Issue category" value={form.issueCategoryId} options={issueCategoryOptions} placeholder="Choose or search issue" onChange={(issueCategoryId) => setForm({ ...form, issueCategoryId })} />
              </>
            )}

            <div className="requester-step-label"><span>2</span>Your details</div>
            <div className="form-grid two-columns">
              <label><UserRound size={15} aria-hidden="true" />Your name<input value={form.reportedByName} onChange={(event) => setForm({ ...form, reportedByName: event.target.value })} placeholder="Enter your name" autoComplete="name" required /></label>
              <label>Department / company <small>Optional</small><input value={form.reportedByDepartment} onChange={(event) => setForm({ ...form, reportedByDepartment: event.target.value })} placeholder="Example: Production" /></label>
            </div>

            <div className="requester-step-label"><span>3</span>Describe the issue</div>
            <label>What happened?<textarea value={form.issueDescription} onChange={(event) => setForm({ ...form, issueDescription: event.target.value })} rows={5} placeholder="Describe what is wrong, when it started, and anything the maintenance team should know" required /></label>
            <label className="issue-upload-field"><ImagePlus size={15} aria-hidden="true" />Add photo <small>Optional</small><input type="file" accept="image/*" capture="environment" multiple onChange={(event) => setIssueFiles(event.target.files)} /><span>{issueFiles?.length ? `${issueFiles.length} photo${issueFiles.length > 1 ? "s" : ""} selected` : "Take a photo or choose from your phone"}</span></label>

            {error ? <p className="error-line">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={submitting}><Send size={17} aria-hidden="true" />{submitting ? "Submitting..." : "Submit Work Order"}</button>
          </form>
        )}

        <section className="requester-tracking-panel">
          <div className="section-header"><div><h2>Recent Requests</h2><span>{workOrders.length} work orders</span></div><ClipboardList size={20} aria-hidden="true" /></div>
          <div className="requester-tracking-list">
            {workOrders.length === 0 ? <p className="quiet-panel">No work orders submitted yet.</p> : workOrders.slice(0, 20).map((workOrder) => (
              <article className="requester-tracking-card" key={workOrder.id}>
                <div className="card-topline"><strong>{workOrder.number}</strong><StatusBadge status={workOrder.status} /></div>
                <p>{workOrder.issueDescription}</p>
                <div className="card-meta">
                  <span>{workOrderTypeLabels[workOrder.type]}</span>
                  {workOrder.type === "office" ? <span>{workOrder.machineName}</span> : <><span>{workOrder.sectionName}</span><span>{workOrder.machineName}</span><span>{workOrder.issueCategoryName}</span></>}
                  <span>Shift {workOrder.shiftGroup}</span>
                </div>
                <div className="card-footer"><span>{workOrderStatusLabels[workOrder.status]}</span><time>{formatDateTime(workOrder.updatedAt)}</time></div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
