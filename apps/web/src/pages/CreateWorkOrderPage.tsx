import { ArrowLeft, CalendarDays, Factory, Send, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import type { MasterData, ShiftGroup, WorkOrderDepartment, WorkOrderType } from "@sugi-cmms/shared";
import { workOrderDepartmentForUser, workOrderDepartments, workOrderTypeLabels } from "@sugi-cmms/shared";
import { api } from "../api/client";
import { SearchableSelect } from "../components/SearchableSelect";
import { MultiPhotoPicker } from "../components/MultiPhotoPicker";
import { useCurrentUser } from "../state/UserContext";

function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const initialForm = {
  type: "maintenance" as WorkOrderType,
  workDate: todayDate(),
  shiftGroup: "A" as ShiftGroup,
  sectionId: "",
  machineId: "",
  customMachineName: "",
  reportedByName: "",
  reportedByDepartment: "",
  responsibleDepartment: "Production" as WorkOrderDepartment,
  issueCategoryId: "",
  issueDescription: ""
};

function reporterDepartmentOptions(current: string) {
  return current && !workOrderDepartments.some((department) => department === current)
    ? [current, ...workOrderDepartments]
    : workOrderDepartments;
}

export function CreateWorkOrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assetFromQuery = searchParams.get("asset")?.trim() || "";
  const { currentUser } = useCurrentUser();
  const [masterData, setMasterData] = useState<MasterData>({ sections: [], machines: [], issueCategories: [] });
  const [form, setForm] = useState(() => ({ ...initialForm, workDate: todayDate() }));
  const [masterReady, setMasterReady] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [issueFiles, setIssueFiles] = useState<File[]>([]);

  useEffect(() => {
    api.masterData()
      .then((nextMasterData) => {
        setMasterData(nextMasterData);
        setMasterReady(true);
        setForm((current) => ({
          ...current,
          sectionId: current.sectionId || nextMasterData.sections.find((section) => section.active)?.id || "",
          issueCategoryId: current.issueCategoryId || nextMasterData.issueCategories.find((category) => category.active)?.id || "",
          customMachineName: current.customMachineName || assetFromQuery,
          reportedByName: current.reportedByName || currentUser?.name || "",
          reportedByDepartment: current.reportedByDepartment || currentUser?.department || "",
          responsibleDepartment: workOrderDepartmentForUser(currentUser?.department || "") || current.responsibleDepartment
        }));
      })
      .catch(() => setError("Couldn’t load sections and machines. Reload this page before submitting."));
  }, [assetFromQuery, currentUser?.department, currentUser?.name]);

  const activeSections = useMemo(() => masterData.sections.filter((section) => section.active), [masterData.sections]);
  const activeIssueCategories = useMemo(() => masterData.issueCategories.filter((category) => category.active), [masterData.issueCategories]);
  const filteredMachines = useMemo(() => {
    return masterData.machines.filter((machine) => machine.active && machine.sectionId === form.sectionId);
  }, [masterData.machines, form.sectionId]);
  const sectionOptions = useMemo(() => activeSections.map((section) => ({ value: section.id, label: section.name })), [activeSections]);
  const machineOptions = useMemo(
    () => [
      { value: "", label: "Others", meta: "Unregistered machine" },
      ...filteredMachines.map((machine) => ({ value: machine.id, label: machine.name, meta: machine.area }))
    ],
    [filteredMachines]
  );
  const issueCategoryOptions = useMemo(
    () => activeIssueCategories.map((category) => ({ value: category.id, label: category.name })),
    [activeIssueCategories]
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!currentUser || submitting || !masterReady) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const selectedMachine = filteredMachines.find((machine) => machine.id === form.machineId);
      const customMachineName = form.customMachineName.trim();
      const workOrder = createdOrderId ? { id: createdOrderId } : await api.createWorkOrder({
        type: form.type,
        requesterId: currentUser.id,
        workDate: form.workDate || todayDate(),
        shiftGroup: form.responsibleDepartment === "Production" ? form.shiftGroup : "N/A",
        sectionId: form.sectionId || null,
        machineId: selectedMachine?.id || null,
        area: selectedMachine?.area || "General",
        machineName: selectedMachine?.name || customMachineName || "Others",
        reportedByName: form.reportedByName,
        reportedByDepartment: form.reportedByDepartment,
        responsibleDepartment: form.responsibleDepartment,
        issueCategoryId: form.issueCategoryId || null,
        issueDescription: form.issueDescription
      });
      setCreatedOrderId(workOrder.id);
      if (issueFiles && issueFiles.length > 0) {
        await api.uploadAttachments(workOrder.id, currentUser.id, "issue", issueFiles);
      }
      navigate(`/work-orders/${workOrder.id}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to create work order.");
    } finally {
      setSubmitting(false);
    }
  }

  if (currentUser?.role === "technician") {
    return <Navigate to="/technician" replace />;
  }

  return (
    <section className="page-stack">
      <div className="page-title-row page-title-clean">
        <div>
          <p className="eyebrow">Requester flow</p>
          <h1>New Work Order</h1>
        </div>
        <Link className="secondary-action" to="/work-orders">
          <ArrowLeft size={17} aria-hidden="true" />
          Back
        </Link>
      </div>

      <form className="form-panel" onSubmit={handleSubmit} aria-busy={submitting}>
        <p className="ux-form-help">Describe the issue and where it happened. Photos are optional and help the maintenance team prepare.</p>
        <fieldset className="ux-form-fields" disabled={submitting || Boolean(createdOrderId)}>
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

        <div className={`form-grid ${form.responsibleDepartment === "Production" ? "three-columns" : "two-columns"}`}>
          {form.responsibleDepartment === "Production" ? (
            <label>
              Shift group
              <select value={form.shiftGroup} onChange={(event) => setForm({ ...form, shiftGroup: event.target.value as ShiftGroup })}>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </label>
          ) : null}

          <SearchableSelect
            label="Section"
            icon={<Factory size={15} aria-hidden="true" />}
            value={form.sectionId}
            options={sectionOptions}
            placeholder="Choose a section"
            disabled={submitting || Boolean(createdOrderId)}
            onChange={(sectionId) => setForm({ ...form, sectionId, machineId: "", customMachineName: "" })}
          />

          <SearchableSelect
            label="Machine"
            value={form.machineId}
            options={machineOptions}
            placeholder="Choose a machine"
            disabled={submitting || Boolean(createdOrderId)}
            onChange={(machineId) => setForm({ ...form, machineId, customMachineName: "" })}
          />
        </div>

        {!form.machineId ? (
          <label>
            Machine name
            <input value={form.customMachineName} onChange={(event) => setForm({ ...form, customMachineName: event.target.value })} required />
          </label>
        ) : null}

        <div className="form-grid two-columns">
          <label>
            Responsible department
            <select value={form.responsibleDepartment} onChange={(event) => setForm({ ...form, responsibleDepartment: event.target.value as WorkOrderDepartment })}>
              {workOrderDepartments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>

          <label>
            <UserRound size={15} aria-hidden="true" />
            Reported by
            <input value={form.reportedByName} onChange={(event) => setForm({ ...form, reportedByName: event.target.value })} required />
          </label>

          <label>
            Reported by department
            <select value={form.reportedByDepartment} onChange={(event) => setForm({ ...form, reportedByDepartment: event.target.value })} required>
              <option value="">Choose department</option>
              {reporterDepartmentOptions(form.reportedByDepartment).map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
        </div>

        <SearchableSelect
          label="Issue category"
          value={form.issueCategoryId}
          options={issueCategoryOptions}
          placeholder="Choose an issue category"
          disabled={submitting || Boolean(createdOrderId)}
          onChange={(issueCategoryId) => setForm({ ...form, issueCategoryId })}
        />

        <label>
          Issue description
          <textarea value={form.issueDescription} onChange={(event) => setForm({ ...form, issueDescription: event.target.value })} rows={5} placeholder="What happened? Include symptoms, when it started, and any impact on production." required />
        </label>

        <MultiPhotoPicker
          files={issueFiles}
          onChange={setIssueFiles}
          disabled={submitting}
          help="Choose several issue photos before creating the work order."
        />

        </fieldset>
        {error ? <p className="error-line" role="alert">{createdOrderId ? "Your work order was created, but the photos could not be uploaded. Retry the upload or open the work order to add photos later. " : ""}{error}</p> : null}
        {createdOrderId ? <Link className="secondary-action" to={`/work-orders/${createdOrderId}`}>Open created work order</Link> : null}

        <div className="form-actions">
          <button className="primary-action" type="submit" disabled={submitting || !masterReady}>
            <Send size={17} aria-hidden="true" />
            {submitting ? "Submitting..." : createdOrderId ? "Retry photo upload" : "Create work order"}
          </button>
        </div>
      </form>
    </section>
  );
}
