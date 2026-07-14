import { ArrowLeft, CalendarDays, Factory, ImagePlus, Send, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { MasterData, ShiftGroup, WorkOrderType } from "@sugi-cmms/shared";
import { workOrderTypeLabels } from "@sugi-cmms/shared";
import { api } from "../api/client";
import { SearchableSelect } from "../components/SearchableSelect";
import { useCurrentUser } from "../state/UserContext";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

const initialForm = {
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

export function CreateWorkOrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assetFromQuery = searchParams.get("asset")?.trim() || "";
  const { currentUser } = useCurrentUser();
  const [masterData, setMasterData] = useState<MasterData>({ sections: [], machines: [], issueCategories: [] });
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [issueFiles, setIssueFiles] = useState<FileList | null>(null);

  useEffect(() => {
    api.masterData()
      .then((nextMasterData) => {
        setMasterData(nextMasterData);
        setForm((current) => ({
          ...current,
          sectionId: current.sectionId || nextMasterData.sections.find((section) => section.active)?.id || "",
          issueCategoryId: current.issueCategoryId || nextMasterData.issueCategories.find((category) => category.active)?.id || "",
          customMachineName: current.customMachineName || assetFromQuery,
          reportedByName: current.reportedByName || currentUser?.name || "",
          reportedByDepartment: current.reportedByDepartment || currentUser?.department || ""
        }));
      })
      .catch(console.error);
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
      ...filteredMachines.map((machine) => ({ value: machine.id, label: machine.name }))
    ],
    [filteredMachines]
  );
  const issueCategoryOptions = useMemo(
    () => activeIssueCategories.map((category) => ({ value: category.id, label: category.name })),
    [activeIssueCategories]
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!currentUser) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const selectedMachine = filteredMachines.find((machine) => machine.id === form.machineId);
      const customMachineName = form.customMachineName.trim();
      const workOrder = await api.createWorkOrder({
        type: form.type,
        requesterId: currentUser.id,
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
        await api.uploadAttachments(workOrder.id, currentUser.id, "issue", issueFiles);
      }
      navigate(`/work-orders/${workOrder.id}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to create work order.");
    } finally {
      setSubmitting(false);
    }
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

      <form className="form-panel" onSubmit={handleSubmit}>
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

        <div className="form-grid three-columns">
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

          <SearchableSelect
            label="Machine"
            value={form.machineId}
            options={machineOptions}
            placeholder="Search machine"
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
          <span>{issueFiles?.length ? `${issueFiles.length} image${issueFiles.length > 1 ? "s" : ""} selected` : "Optional, but useful for technician diagnosis."}</span>
        </label>

        {error ? <p className="error-line">{error}</p> : null}

        <div className="form-actions">
          <button className="primary-action" type="submit" disabled={submitting}>
            <Send size={17} aria-hidden="true" />
            {submitting ? "Submitting..." : "Issue Work Order"}
          </button>
        </div>
      </form>
    </section>
  );
}
