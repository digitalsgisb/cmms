import { Activity, CalendarDays, CheckCircle2, ClipboardList, Clock3, Factory, ImagePlus, Send, UserRound, Wrench } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { MasterData, PublicRequesterWorkOrder, ShiftGroup, WorkOrderType } from "@sugi-cmms/shared";
import { workOrderStatusLabels, workOrderTypeLabels } from "@sugi-cmms/shared";
import { api } from "../api/client";
import { PwaInstallButton } from "../components/PwaInstallButton";
import { SearchableSelect } from "../components/SearchableSelect";
import { StatusBadge } from "../components/Badges";
import { formatDateTime } from "../utils/format";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

const initialRequesterForm = {
  type: "standard_maintenance" as WorkOrderType,
  workDate: todayDate(),
  shiftGroup: "A" as ShiftGroup,
  sectionId: "",
  machineId: "",
  customMachineName: "",
  reportedByName: "",
  reportedByDepartment: "",
  issueCategoryId: "",
  issueDescription: ""
};

export function PublicRequesterPage() {
  const [masterData, setMasterData] = useState<MasterData>({ sections: [], machines: [], issueCategories: [] });
  const [workOrders, setWorkOrders] = useState<PublicRequesterWorkOrder[]>([]);
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
      sectionId: current.sectionId || nextMasterData.sections.find((section) => section.active)?.id || "",
      issueCategoryId: current.issueCategoryId || nextMasterData.issueCategories.find((category) => category.active)?.id || ""
    }));
  }

  useEffect(() => {
    loadRequesterData().catch(console.error);
  }, []);

  const activeSections = useMemo(() => masterData.sections.filter((section) => section.active), [masterData.sections]);
  const activeIssueCategories = useMemo(() => masterData.issueCategories.filter((category) => category.active), [masterData.issueCategories]);
  const filteredMachines = useMemo(() => {
    return masterData.machines.filter((machine) => machine.active && machine.sectionId === form.sectionId);
  }, [masterData.machines, form.sectionId]);
  const sectionOptions = useMemo(() => activeSections.map((section) => ({ value: section.id, label: section.name })), [activeSections]);
  const machineOptions = useMemo(
    () => [
      { value: "", label: "Others", meta: "Unregistered machine" },
      ...filteredMachines.map((machine) => ({ value: machine.id, label: machine.name }))
    ],
    [filteredMachines]
  );
  const issueCategoryOptions = useMemo(
    () => activeIssueCategories.map((category) => ({ value: category.id, label: category.name })),
    [activeIssueCategories]
  );
  const requesterStats = useMemo(() => {
    return {
      new: workOrders.filter((workOrder) => workOrder.status === "open").length,
      moving: workOrders.filter((workOrder) => ["acknowledged", "in_progress", "returned"].includes(workOrder.status)).length,
      waiting: workOrders.filter((workOrder) => ["pending_material", "resolved"].includes(workOrder.status)).length,
      closed: workOrders.filter((workOrder) => workOrder.status === "closed").length
    };
  }, [workOrders]);
  const latestWorkOrder = workOrders[0];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const selectedMachine = filteredMachines.find((machine) => machine.id === form.machineId);
      const customMachineName = form.customMachineName.trim();
      const workOrder = await api.createRequesterWorkOrder({
        type: form.type,
        workDate: form.workDate || todayDate(),
        shiftGroup: form.shiftGroup,
        sectionId: form.sectionId || null,
        machineId: selectedMachine?.id || null,
        machineName: selectedMachine?.name || customMachineName || "Others",
        reportedByName: form.reportedByName,
        reportedByDepartment: form.reportedByDepartment,
        issueCategoryId: form.issueCategoryId || null,
        issueDescription: form.issueDescription
      });

      if (issueFiles && issueFiles.length > 0) {
        await api.uploadRequesterAttachments(workOrder.id, issueFiles);
      }

      setSuccess(`${workOrder.number} submitted.`);
      setForm({
        ...initialRequesterForm,
        workDate: todayDate(),
        sectionId: form.sectionId,
        issueCategoryId: form.issueCategoryId
      });
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
          <p className="eyebrow">
            <span className="requester-live-dot" aria-hidden="true" />
            Sugi CMMS Requester
          </p>
          <h1>Issue Work Order</h1>
          <div className="requester-hero-meta">
            <span>
              <ClipboardList size={15} aria-hidden="true" />
              {workOrders.length} tracked
            </span>
            {latestWorkOrder ? (
              <span>
                <Clock3 size={15} aria-hidden="true" />
                Latest {latestWorkOrder.number}
              </span>
            ) : null}
          </div>
        </div>
        <PwaInstallButton />
        <div className="requester-status-strip">
          <article>
            <Activity size={16} aria-hidden="true" />
            <span>New</span>
            <strong>{requesterStats.new}</strong>
          </article>
          <article>
            <Wrench size={16} aria-hidden="true" />
            <span>Moving</span>
            <strong>{requesterStats.moving}</strong>
          </article>
          <article>
            <Clock3 size={16} aria-hidden="true" />
            <span>Waiting</span>
            <strong>{requesterStats.waiting}</strong>
          </article>
          <article>
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>Closed</span>
            <strong>{requesterStats.closed}</strong>
          </article>
        </div>
      </section>

      <div className="requester-workspace">
      <form className="requester-form-panel" onSubmit={submit}>
        <div className="requester-panel-heading">
          <span className="requester-panel-icon">
            <Send size={18} aria-hidden="true" />
          </span>
          <div>
            <h2>New Request</h2>
            <span>{form.sectionId ? activeSections.find((section) => section.id === form.sectionId)?.name || "Section" : "Section"} / Shift {form.shiftGroup}</span>
          </div>
        </div>

        <div className="form-grid two-columns">
          <label>
            Work order type
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as WorkOrderType })}>
              {Object.entries(workOrderTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <CalendarDays size={15} aria-hidden="true" />
            Date
            <input type="date" value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} required />
          </label>
        </div>

        <div className="form-grid two-columns">
          <label>
            Shift group
            <select value={form.shiftGroup} onChange={(event) => setForm({ ...form, shiftGroup: event.target.value as ShiftGroup })}>
              <option value="A">A</option>
              <option value="B">B</option>
            </select>
          </label>

          <SearchableSelect
            label="Section"
            icon={<Factory size={15} aria-hidden="true" />}
            value={form.sectionId}
            options={sectionOptions}
            placeholder="Search section"
            onChange={(sectionId) => setForm({ ...form, sectionId, machineId: "", customMachineName: "" })}
          />
        </div>

        <SearchableSelect
          label="Machine"
          value={form.machineId}
          options={machineOptions}
          placeholder="Search machine"
          onChange={(machineId) => setForm({ ...form, machineId, customMachineName: "" })}
        />

        {!form.machineId ? (
          <label>
            Machine name
            <input value={form.customMachineName} onChange={(event) => setForm({ ...form, customMachineName: event.target.value })} required />
          </label>
        ) : null}

        <div className="form-grid two-columns">
          <label>
            <UserRound size={15} aria-hidden="true" />
            Reported by
            <input value={form.reportedByName} onChange={(event) => setForm({ ...form, reportedByName: event.target.value })} required />
          </label>

          <label>
            Department
            <input value={form.reportedByDepartment} onChange={(event) => setForm({ ...form, reportedByDepartment: event.target.value })} required />
          </label>
        </div>

        <SearchableSelect
          label="Issue category"
          value={form.issueCategoryId}
          options={issueCategoryOptions}
          placeholder="Search category"
          onChange={(issueCategoryId) => setForm({ ...form, issueCategoryId })}
        />

        <label>
          Issue description
          <textarea value={form.issueDescription} onChange={(event) => setForm({ ...form, issueDescription: event.target.value })} rows={5} required />
        </label>

        <label className="issue-upload-field">
          <ImagePlus size={15} aria-hidden="true" />
          Photo issue
          <input type="file" accept="image/*" multiple onChange={(event) => setIssueFiles(event.target.files)} />
          <span>{issueFiles?.length ? `${issueFiles.length} photo${issueFiles.length > 1 ? "s" : ""} selected` : "Optional issue photo"}</span>
        </label>

        {error ? <p className="error-line">{error}</p> : null}
        {success ? <p className="success-line">{success}</p> : null}

        <button className="primary-action" type="submit" disabled={submitting}>
          <Send size={17} aria-hidden="true" />
          {submitting ? "Submitting..." : "Submit Work Order"}
        </button>
      </form>

      <section className="requester-tracking-panel">
        <div className="section-header">
          <div>
            <h2>Requester Tracking</h2>
            <span>{workOrders.length} work orders</span>
          </div>
          <ClipboardList size={20} aria-hidden="true" />
        </div>

        <div className="requester-tracking-list">
          {workOrders.length === 0 ? (
            <p className="quiet-panel">No work orders submitted yet.</p>
          ) : (
            workOrders.slice(0, 20).map((workOrder) => (
              <article className="requester-tracking-card" key={workOrder.id}>
                <div className="card-topline">
                  <strong>{workOrder.number}</strong>
                  <StatusBadge status={workOrder.status} />
                </div>
                <p>{workOrder.issueDescription}</p>
                <div className="card-meta">
                  <span>{workOrder.sectionName}</span>
                  <span>{workOrder.machineName}</span>
                  <span>{workOrder.issueCategoryName}</span>
                  <span>Shift {workOrder.shiftGroup}</span>
                </div>
                <div className="card-footer">
                  <span>{workOrderStatusLabels[workOrder.status]}</span>
                  <time>{formatDateTime(workOrder.updatedAt)}</time>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
      </div>

    </main>
  );
}
