import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  History,
  Package,
  QrCode,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Warehouse
} from "lucide-react";
import type { IScannerControls } from "@zxing/browser";
import QRCode from "qrcode";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { SparePart, SparePartDetail, SpareSyncSettings, StockMovementType, WorkOrder } from "@sugi-cmms/shared";
import { api } from "../api/client";
import { PwaInstallButton } from "../components/PwaInstallButton";
import { useCurrentUser } from "../state/UserContext";
import { formatDateTime } from "../utils/format";

type SpareView = "dashboard" | "inventory" | "scanner" | "setup" | "detail";
type StockFilter = "all" | "low" | "out";
type AdjustmentType = Exclude<StockMovementType, "issue">;
type IssueFeedback = {
  state: "loading" | "success" | "error";
  title: string;
  detail: string;
};
const spareStaticRoutes = new Set(["scanner", "inventory", "setup"]);

const money = new Intl.NumberFormat("en-MY", {
  style: "currency",
  currency: "MYR",
  maximumFractionDigits: 0
});

function numberText(value: number) {
  return new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(value || 0);
}

function stockState(part: SparePart) {
  if (part.currentStock <= 0) {
    return "out";
  }

  if (part.minStock > 0 && part.currentStock <= part.minStock) {
    return "low";
  }

  return "ok";
}

function stockLabel(part: SparePart) {
  const state = stockState(part);
  if (state === "out") {
    return "Out";
  }

  if (state === "low") {
    return "Low";
  }

  return "OK";
}

function canIssueAgainst(workOrder: WorkOrder) {
  return !["resolved", "closed", "cancelled"].includes(workOrder.status);
}

function normalizeQrLookupValue(value: string) {
  const query = value.trim();
  if (!query) {
    return query;
  }

  try {
    const url = new URL(query, window.location.origin);
    const segments = url.pathname.split("/").filter(Boolean);
    const spareIndex = segments.indexOf("spare-parts");
    if (spareIndex === -1) {
      return query;
    }

    if (segments[spareIndex + 1] === "issue" && segments[spareIndex + 2]) {
      return decodeURIComponent(segments[spareIndex + 2]);
    }

    const maybeItemNo = segments[spareIndex + 1];
    if (maybeItemNo && !spareStaticRoutes.has(maybeItemNo)) {
      return decodeURIComponent(maybeItemNo);
    }
  } catch {
    return query;
  }

  return query;
}

export function SparePartsPage() {
  const { currentUser } = useCurrentUser();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const routeItemNo = params.itemNo || "";
  const issueRoute = location.pathname.startsWith("/spare-parts/issue/");
  const canManage = currentUser ? ["executive", "admin"].includes(currentUser.role) : false;
  const canIssue = currentUser ? currentUser.role !== "requester" : false;
  const technicianMode = currentUser?.role === "technician";
  const view: SpareView =
    technicianMode || issueRoute || location.pathname.startsWith("/spare-parts/scanner")
      ? "scanner"
      : location.pathname.startsWith("/spare-parts/setup")
        ? "setup"
        : location.pathname.startsWith("/spare-parts/inventory")
          ? "inventory"
          : routeItemNo
            ? "detail"
            : "dashboard";

  const [parts, setParts] = useState<SparePart[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [detail, setDetail] = useState<SparePartDetail | null>(null);
  const [suppliersCount, setSuppliersCount] = useState(0);
  const [summary, setSummary] = useState({
    totalParts: 0,
    lowStock: 0,
    outOfStock: 0,
    totalValue: 0,
    unsyncedMovements: 0
  });
  const [syncConfigured, setSyncConfigured] = useState(false);
  const [recentMovements, setRecentMovements] = useState<SparePartDetail["movements"]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [qrText, setQrText] = useState("");
  const [qrMatches, setQrMatches] = useState<SparePart[]>([]);
  const [issuePart, setIssuePart] = useState<SparePart | null>(null);
  const [manualPartSearch, setManualPartSearch] = useState("");
  const [issueWorkOrderId, setIssueWorkOrderId] = useState("");
  const [issueQuantity, setIssueQuantity] = useState("1");
  const [issueNote, setIssueNote] = useState("");
  const [masterText, setMasterText] = useState("");
  const [supplierText, setSupplierText] = useState("");
  const [syncSettings, setSyncSettings] = useState<SpareSyncSettings>({
    scriptUrl: "",
    hasToken: false,
    masterSheetName: "Masterlist",
    supplierSheetName: "Supplier",
    movementSheetName: "Movement Log",
    configured: false
  });
  const [syncToken, setSyncToken] = useState("");
  const [adjustType, setAdjustType] = useState<AdjustmentType>("restock");
  const [adjustQuantity, setAdjustQuantity] = useState("1");
  const [adjustNote, setAdjustNote] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [issueFeedback, setIssueFeedback] = useState<IssueFeedback | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanDetected, setScanDetected] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scanCloseTimerRef = useRef<number | null>(null);
  const issueFeedbackTimerRef = useRef<number | null>(null);

  function clearIssueFeedbackTimer() {
    if (issueFeedbackTimerRef.current) {
      window.clearTimeout(issueFeedbackTimerRef.current);
      issueFeedbackTimerRef.current = null;
    }
  }

  function showIssueFeedback(feedback: IssueFeedback, timeoutMs = 2800) {
    clearIssueFeedbackTimer();
    setIssueFeedback(feedback);

    if (feedback.state !== "loading") {
      issueFeedbackTimerRef.current = window.setTimeout(() => {
        setIssueFeedback(null);
        issueFeedbackTimerRef.current = null;
      }, timeoutMs);
    }
  }

  function vibratePhone(pattern: number | number[]) {
    const vibratingNavigator = navigator as Navigator & {
      vibrate?: (pattern: number | number[]) => boolean;
    };

    vibratingNavigator.vibrate?.(pattern);
  }

  async function loadInventory() {
    const inventory = await api.spareInventory();
    setParts(inventory.parts);
    setSuppliersCount(inventory.suppliers.length);
    setSummary(inventory.summary);
    setRecentMovements(inventory.recentMovements);
    setSyncConfigured(inventory.syncConfigured);
  }

  async function loadDetail(itemNo: string) {
    const nextDetail = await api.sparePart(itemNo);
    setDetail(nextDetail);
    if (issueRoute) {
      setIssuePart(nextDetail);
    }
  }

  useEffect(() => {
    loadInventory().catch(console.error);
    api.workOrders().then(setWorkOrders).catch(console.error);
    api.spareSyncSettings().then(setSyncSettings).catch(console.error);
  }, []);

  useEffect(() => {
    return () => clearIssueFeedbackTimer();
  }, []);

  useEffect(() => {
    if (!routeItemNo || ["setup", "scanner", "inventory"].includes(routeItemNo)) {
      setDetail(null);
      return;
    }

    loadDetail(routeItemNo).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Unable to load spare part.");
    });
  }, [routeItemNo, issueRoute]);

  useEffect(() => {
    if (!detail) {
      setQrSvg("");
      return;
    }

    const targetUrl = `${window.location.origin}/spare-parts/issue/${encodeURIComponent(detail.itemNo)}`;
    QRCode.toString(targetUrl, { type: "svg", margin: 1, width: 220 })
      .then(setQrSvg)
      .catch(console.error);
  }, [detail?.itemNo]);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current) {
      return;
    }

    let disposed = false;
    let handled = false;
    setBusy("camera");

    import("@zxing/browser")
      .then(({ BrowserQRCodeReader }) => {
        if (disposed || !videoRef.current) {
          return null;
        }

        const codeReader = new BrowserQRCodeReader();
        return codeReader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" }
            }
          },
          videoRef.current,
          (result, _error, controls) => {
          scannerControlsRef.current = controls;
            const value = normalizeQrLookupValue(result?.getText() || "");
            if (disposed || handled || !value) {
              return;
            }

            handled = true;
            setScanDetected(true);
            setQrText(value);
            void lookupQr(value);
            scanCloseTimerRef.current = window.setTimeout(() => {
              controls.stop();
              scannerControlsRef.current = null;
              setCameraOpen(false);
              setScanDetected(false);
            }, 650);
          }
        );
      })
      .then((controls) => {
        if (!controls) {
          return;
        }

        if (disposed) {
          controls.stop();
          return;
        }

        scannerControlsRef.current = controls;
        setBusy("");
      })
      .catch((cameraError) => {
        if (disposed) {
          return;
        }

        setBusy("");
        setCameraOpen(false);
        setError(cameraError instanceof Error ? cameraError.message : "Unable to open camera.");
      });

    return () => {
      disposed = true;
      if (scanCloseTimerRef.current) {
        window.clearTimeout(scanCloseTimerRef.current);
        scanCloseTimerRef.current = null;
      }
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [cameraOpen]);

  const categories = useMemo(() => [...new Set(parts.map((part) => part.category).filter(Boolean))].sort(), [parts]);
  const activeWorkOrders = useMemo(() => workOrders.filter(canIssueAgainst), [workOrders]);
  const lowStockParts = useMemo(() => parts.filter((part) => stockState(part) === "low").slice(0, 8), [parts]);
  const outOfStockParts = useMemo(() => parts.filter((part) => stockState(part) === "out").slice(0, 8), [parts]);
  const categoryStats = useMemo(() => {
    return categories.map((name) => {
      const categoryParts = parts.filter((part) => part.category === name);
      return {
        name,
        count: categoryParts.length,
        low: categoryParts.filter((part) => stockState(part) !== "ok").length
      };
    }).sort((first, second) => second.count - first.count || first.name.localeCompare(second.name));
  }, [categories, parts]);
  const categorySnapshot = useMemo(() => categoryStats.slice(0, 8), [categoryStats]);
  const categoryChartMax = useMemo(() => Math.max(1, ...categorySnapshot.map((item) => item.count)), [categorySnapshot]);

  const filteredParts = useMemo(() => {
    const needle = search.toLowerCase().trim();
    return parts.filter((part) => {
      const matchesCategory = category === "all" || part.category === category;
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "low" && stockState(part) === "low") ||
        (stockFilter === "out" && stockState(part) === "out");
      const searchable = [
        part.itemNo,
        part.searchName,
        part.description,
        part.category,
        part.supplier,
        part.supplier1,
        part.supplier2,
        part.supplier3,
        part.partRank,
        part.stockRank,
        part.status
      ].join(" ").toLowerCase();
      return matchesCategory && matchesStock && searchable.includes(needle);
    });
  }, [parts, search, category, stockFilter]);

  const filteredPartGroups = useMemo(() => {
    const groups = new Map<string, SparePart[]>();
    filteredParts.forEach((part) => {
      const key = part.category || "Uncategorised";
      const current = groups.get(key) || [];
      current.push(part);
      groups.set(key, current);
    });

    return [...groups.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([name, items]) => ({
        name,
        items: [...items].sort((first, second) => {
          const firstLabel = first.searchName || first.description || first.itemNo;
          const secondLabel = second.searchName || second.description || second.itemNo;
          return firstLabel.localeCompare(secondLabel);
        }),
        low: items.filter((part) => stockState(part) === "low").length,
        out: items.filter((part) => stockState(part) === "out").length
      }));
  }, [filteredParts]);

  const manualPartOptions = useMemo(() => {
    const needle = manualPartSearch.toLowerCase().trim();
    const source = needle
      ? parts.filter((part) => {
          const searchable = [
            part.itemNo,
            part.searchName,
            part.description,
            part.category,
            part.supplier,
            part.supplier1,
            part.supplier2,
            part.supplier3
          ].join(" ").toLowerCase();
          return searchable.includes(needle);
        })
      : parts;

    return [...source]
      .sort((first, second) => {
        const firstState = stockState(first);
        const secondState = stockState(second);
        if (firstState === "out" && secondState !== "out") {
          return 1;
        }
        if (firstState !== "out" && secondState === "out") {
          return -1;
        }
        return (first.searchName || first.description || first.itemNo).localeCompare(second.searchName || second.description || second.itemNo);
      })
      .slice(0, 12);
  }, [manualPartSearch, parts]);

  function chooseIssuePart(part: SparePart) {
    setIssuePart(part);
    setQrMatches([]);
    setManualPartSearch(`${part.itemNo} ${part.searchName || part.description || part.category || "Spare part"}`);
  }

  async function lookupQr(value = qrText) {
    const query = normalizeQrLookupValue(value);
    setError("");
    setMessage("");
    setQrText(query);
    setBusy("lookup");
    try {
      const result = await api.lookupSpareQr(query);
      setQrMatches(result.matches);
      if (result.matches.length === 1) {
        chooseIssuePart(result.matches[0]);
      }
      if (result.matches.length === 0) {
        setError("No spare part matched that QR value.");
      }
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Unable to lookup QR.");
    } finally {
      setBusy("");
    }
  }

  async function startCamera() {
    setError("");
    setMessage("");
    if (!window.isSecureContext) {
      setError("Camera needs HTTPS. Open the Cloudflare https:// URL, not the local IP or http:// URL.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not available in this browser. Open the HTTPS app in Safari or Chrome and allow camera permission.");
      return;
    }

    setCameraOpen(true);
  }

  function stopCamera() {
    if (scanCloseTimerRef.current) {
      window.clearTimeout(scanCloseTimerRef.current);
      scanCloseTimerRef.current = null;
    }
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current!.srcObject = null;
    }
    setCameraOpen(false);
    setScanDetected(false);
    setBusy((currentBusy) => (currentBusy === "camera" ? "" : currentBusy));
  }

  async function submitIssue(event: FormEvent) {
    event.preventDefault();
    if (!currentUser || !issuePart) {
      return;
    }

    const selectedPart = issuePart;
    const quantity = Number(issueQuantity);
    const unit = selectedPart.uom || "unit";

    setBusy("issue");
    setError("");
    setMessage("");
    showIssueFeedback({
      state: "loading",
      title: "Issuing spare",
      detail: `Deducting ${numberText(quantity)} ${unit} from ${selectedPart.itemNo}.`
    });

    try {
      const movement = await api.issueSparePart(selectedPart.itemNo, {
        actorId: currentUser.id,
        workOrderId: issueWorkOrderId,
        quantity,
        note: issueNote
      });
      setIssueQuantity("1");
      setIssueNote("");
      setIssuePart((selectedPart) => selectedPart?.itemNo === movement.itemNo ? { ...selectedPart, currentStock: movement.afterStock } : selectedPart);
      setMessage(`Stock updated: ${movement.itemNo} is now ${numberText(movement.afterStock)}.`);
      vibratePhone([50, 35, 90]);
      showIssueFeedback({
        state: "success",
        title: "Stock deducted",
        detail: `${movement.itemNo} is now ${numberText(movement.afterStock)} ${unit}.`
      });
      await loadInventory();
      if (detail?.itemNo === selectedPart.itemNo) {
        await loadDetail(selectedPart.itemNo);
      }
    } catch (issueError) {
      const issueMessage = issueError instanceof Error ? issueError.message : "Unable to issue spare part.";
      setError(issueMessage);
      vibratePhone(130);
      showIssueFeedback({
        state: "error",
        title: "Issue failed",
        detail: issueMessage
      }, 4200);
    } finally {
      setBusy("");
    }
  }

  async function saveSyncSettings(event: FormEvent) {
    event.preventDefault();
    if (!currentUser) {
      return;
    }

    setBusy("settings");
    setError("");
    setMessage("");
    try {
      const nextSettings = await api.updateSpareSyncSettings({
        actorId: currentUser.id,
        scriptUrl: syncSettings.scriptUrl,
        token: syncToken || undefined,
        masterSheetName: syncSettings.masterSheetName,
        supplierSheetName: syncSettings.supplierSheetName,
        movementSheetName: syncSettings.movementSheetName
      });
      setSyncSettings(nextSettings);
      setSyncConfigured(nextSettings.configured);
      setSyncToken("");
      setMessage("Sheet sync settings saved.");
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "Unable to save sheet sync settings.");
    } finally {
      setBusy("");
    }
  }

  async function importParts(event: FormEvent) {
    event.preventDefault();
    if (!currentUser) {
      return;
    }

    setBusy("import");
    setError("");
    setMessage("");
    try {
      const result = await api.importSpareParts({
        actorId: currentUser.id,
        masterText,
        supplierText
      });
      setMasterText("");
      setSupplierText("");
      setParts(result.inventory.parts);
      setSummary(result.inventory.summary);
      setRecentMovements(result.inventory.recentMovements);
      setSuppliersCount(result.inventory.suppliers.length);
      setSyncConfigured(result.inventory.syncConfigured);
      setMessage(`${result.importedParts} parts imported, ${result.updatedParts} updated, ${result.importedSuppliers} suppliers loaded.`);
      if (result.errors.length > 0) {
        setError(result.errors.slice(0, 4).join(" "));
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Unable to import spare parts.");
    } finally {
      setBusy("");
    }
  }

  async function pullFromSheet() {
    if (!currentUser) {
      return;
    }

    setBusy("pull");
    setError("");
    setMessage("");
    try {
      const result = await api.pullSparePartsFromSheet(currentUser.id);
      if (result.inventory) {
        setParts(result.inventory.parts);
        setSummary(result.inventory.summary);
        setRecentMovements(result.inventory.recentMovements);
        setSuppliersCount(result.inventory.suppliers.length);
        setSyncConfigured(result.inventory.syncConfigured);
      }
      setMessage(result.message);
      if (!result.ok) {
        setError(result.errors.join(" "));
      }
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Unable to sync from Google Sheet.");
    } finally {
      setBusy("");
    }
  }

  async function retrySync() {
    if (!currentUser) {
      return;
    }

    setBusy("retry");
    setError("");
    setMessage("");
    try {
      const result = await api.retrySpareSync(currentUser.id);
      if (result.inventory) {
        setParts(result.inventory.parts);
        setSummary(result.inventory.summary);
        setRecentMovements(result.inventory.recentMovements);
      }
      setMessage(result.message);
      if (!result.ok) {
        setError(result.errors.join(" "));
      }
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Unable to retry sync.");
    } finally {
      setBusy("");
    }
  }

  async function submitAdjustment(event: FormEvent) {
    event.preventDefault();
    if (!currentUser || !detail) {
      return;
    }

    setBusy("adjust");
    setError("");
    setMessage("");
    try {
      const movement = await api.adjustSparePart(detail.itemNo, {
        actorId: currentUser.id,
        type: adjustType,
        quantity: Number(adjustQuantity),
        note: adjustNote
      });
      setAdjustQuantity("1");
      setAdjustNote("");
      setMessage(`Adjustment saved. ${movement.itemNo} is now ${numberText(movement.afterStock)}.`);
      await loadInventory();
      await loadDetail(detail.itemNo);
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : "Unable to adjust stock.");
    } finally {
      setBusy("");
    }
  }

  async function copyQrUrl() {
    if (!detail) {
      return;
    }

    await navigator.clipboard.writeText(`${window.location.origin}/spare-parts/issue/${encodeURIComponent(detail.itemNo)}`);
    setMessage("QR link copied.");
  }

  function downloadQr() {
    if (!qrSvg || !detail) {
      return;
    }

    const blob = new Blob([qrSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spare-${detail.itemNo.replace(/[^a-z0-9-]+/gi, "_")}-qr.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderMetrics() {
    return (
      <div className="spare-metrics">
        <article>
          <Package size={18} aria-hidden="true" />
          <span>SKUs</span>
          <strong>{numberText(summary.totalParts)}</strong>
        </article>
        <article className={summary.lowStock > 0 ? "warn" : ""}>
          <AlertTriangle size={18} aria-hidden="true" />
          <span>Low stock</span>
          <strong>{numberText(summary.lowStock)}</strong>
        </article>
        <article className={summary.outOfStock > 0 ? "danger" : ""}>
          <Boxes size={18} aria-hidden="true" />
          <span>Out</span>
          <strong>{numberText(summary.outOfStock)}</strong>
        </article>
        <article>
          <Warehouse size={18} aria-hidden="true" />
          <span>Value</span>
          <strong>{money.format(summary.totalValue)}</strong>
        </article>
        <article className={summary.unsyncedMovements > 0 ? "warn" : ""}>
          <RefreshCw size={18} aria-hidden="true" />
          <span>Unsynced</span>
          <strong>{numberText(summary.unsyncedMovements)}</strong>
        </article>
      </div>
    );
  }

  function renderTabs() {
    if (technicianMode) {
      return null;
    }

    const tabs = [
      { to: "/spare-parts", label: "Dashboard", tabView: "dashboard" as SpareView, Icon: Warehouse },
      { to: "/spare-parts/inventory", label: "Inventory", tabView: "inventory" as SpareView, Icon: Package },
      { to: "/spare-parts/scanner", label: "QR Scanner", tabView: "scanner" as SpareView, Icon: QrCode },
      ...(canManage ? [{ to: "/spare-parts/setup", label: "Sheet Setup", tabView: "setup" as SpareView, Icon: Settings2 }] : [])
    ];

    return (
      <div className="spare-module-tabs" role="tablist" aria-label="Spare part sections">
        {tabs.map(({ to, label, tabView, Icon }) => {
          const active = view === tabView || (view === "detail" && tabView === "inventory");
          return (
            <Link key={to} to={to} className={active ? "active" : ""}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </div>
    );
  }

  function renderIssueFeedback() {
    if (!issueFeedback) {
      return null;
    }

    const FeedbackIcon = issueFeedback.state === "success" ? CheckCircle2 : issueFeedback.state === "error" ? AlertTriangle : RefreshCw;

    return (
      <div className={`issue-feedback-toast ${issueFeedback.state}`} role={issueFeedback.state === "error" ? "alert" : "status"} aria-live="polite">
        <span className="issue-feedback-icon">
          <FeedbackIcon size={20} aria-hidden="true" />
        </span>
        <div>
          <h3>{issueFeedback.title}</h3>
          <p>{issueFeedback.detail}</p>
        </div>
        {issueFeedback.state === "loading" ? (
          <span className="issue-feedback-bar" aria-hidden="true">
            <i />
          </span>
        ) : null}
      </div>
    );
  }

  function renderScannerPanel() {
    return (
      <section className="section-panel spare-issue-panel">
        <div className="section-header">
          <div>
            <h2>QR / Manual Issue</h2>
            <span>{canIssue ? "Issue spare parts to active work orders" : "Read only"}</span>
          </div>
          <QrCode size={20} aria-hidden="true" />
        </div>

        <div className="qr-lookup-row">
          <label className="search-input">
            <Search size={17} aria-hidden="true" />
            <input value={qrText} onChange={(event) => setQrText(event.target.value)} placeholder="Scan value, item no, search name" />
          </label>
          <button type="button" onClick={() => lookupQr()} disabled={busy === "lookup" || !qrText.trim()}>
            <QrCode size={16} aria-hidden="true" />
            {busy === "lookup" ? "Checking" : "Lookup"}
          </button>
          <button type="button" onClick={cameraOpen ? stopCamera : startCamera}>
            <ExternalLink size={16} aria-hidden="true" />
            {cameraOpen ? "Stop Camera" : "Camera"}
          </button>
        </div>

        {cameraOpen ? (
          <div className={`spare-camera-box ${scanDetected ? "detected" : ""}`}>
            <video ref={videoRef} muted playsInline />
            <span className="camera-scan-overlay" aria-hidden="true" />
          </div>
        ) : null}

        {qrMatches.length > 1 ? (
          <div className="qr-match-list">
            {qrMatches.map((part) => (
              <button key={part.itemNo} type="button" onClick={() => chooseIssuePart(part)}>
                <strong>{part.itemNo}</strong>
                <span>{part.searchName || part.description}</span>
                <em>{numberText(part.currentStock)} {part.uom}</em>
              </button>
            ))}
          </div>
        ) : null}

        <div className="manual-part-picker">
          <div className="manual-picker-header">
            <strong>Manual spare selection</strong>
            <span>{manualPartOptions.length} quick matches</span>
          </div>
          <label className="search-input">
            <Package size={17} aria-hidden="true" />
            <input
              value={manualPartSearch}
              onChange={(event) => setManualPartSearch(event.target.value)}
              placeholder="Choose by item no, name, category, supplier"
            />
          </label>
          <div className="manual-part-results">
            {manualPartOptions.length === 0 ? (
              <p>No spare parts found.</p>
            ) : (
              manualPartOptions.map((part) => (
                <button
                  key={part.itemNo}
                  type="button"
                  className={issuePart?.itemNo === part.itemNo ? "active" : ""}
                  onClick={() => chooseIssuePart(part)}
                >
                  <span>
                    <strong>{part.itemNo}</strong>
                    <em>{part.searchName || part.description}</em>
                  </span>
                  <small>{part.category || "Uncategorised"}</small>
                  <b>{numberText(part.currentStock)} {part.uom}</b>
                </button>
              ))
            )}
          </div>
        </div>

        <form className="spare-issue-form" onSubmit={submitIssue}>
          <div className="selected-spare">
            {issuePart ? (
              <>
                <strong>{issuePart.itemNo}</strong>
                <span>{issuePart.searchName || issuePart.description}</span>
                <em>{numberText(issuePart.currentStock)} {issuePart.uom} available</em>
              </>
            ) : (
              <span>No spare selected</span>
            )}
          </div>

          <select value={issueWorkOrderId} onChange={(event) => setIssueWorkOrderId(event.target.value)} disabled={!canIssue}>
            <option value="">Select active work order</option>
            {activeWorkOrders.map((workOrder) => (
              <option key={workOrder.id} value={workOrder.id}>
                {workOrder.number} - {workOrder.machineName || workOrder.title}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            step="1"
            value={issueQuantity}
            onChange={(event) => setIssueQuantity(event.target.value)}
            disabled={!canIssue}
            aria-label="Issue quantity"
          />
          <input value={issueNote} onChange={(event) => setIssueNote(event.target.value)} placeholder="Note" disabled={!canIssue} />
          <button className={busy === "issue" ? "loading" : ""} type="submit" disabled={!canIssue || !issuePart || !issueWorkOrderId || busy === "issue"}>
            {busy === "issue" ? <span className="spare-button-spinner" aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
            {busy === "issue" ? "Issuing" : "Deduct Stock"}
          </button>
        </form>

        {busy === "issue" ? (
          <div className="issue-inline-progress" role="status" aria-live="polite">
            <span className="issue-progress-ring" aria-hidden="true" />
            <div>
              <strong>Updating stock movement</strong>
              <span>Recording deduction, work order link, and sheet sync status.</span>
              <em aria-hidden="true"><i /></em>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  function renderInventoryPanel() {
    return (
      <section className="section-panel spare-inventory-panel">
        <div className="section-header">
          <div>
            <h2>Inventory Register</h2>
            <span>{filteredParts.length} visible across {filteredPartGroups.length} categories, {suppliersCount} supplier rows</span>
          </div>
          <SlidersHorizontal size={20} aria-hidden="true" />
        </div>

        <div className="filter-bar spare-filter-bar">
          <label className="search-input">
            <Search size={17} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search spare parts" />
          </label>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as StockFilter)}>
            <option value="all">All stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
        </div>

        <div className="inventory-category-list">
          {filteredParts.length === 0 ? (
            <p className="quiet-panel">No spare parts found.</p>
          ) : (
            filteredPartGroups.map((group) => (
              <section key={group.name} className="inventory-category-section">
                <div className="inventory-category-header">
                  <div>
                    <h3>{group.name}</h3>
                    <span>{group.items.length} spare parts</span>
                  </div>
                  <div className="inventory-category-summary">
                    <span>{group.low} low</span>
                    <span>{group.out} out</span>
                  </div>
                </div>
                <div className="spare-list">
                  {group.items.map((part) => (
                    <article key={part.itemNo} className={`spare-row stock-${stockState(part)}`}>
                      <Link to={`/spare-parts/${encodeURIComponent(part.itemNo)}`}>
                        <div>
                          <strong>{part.itemNo}</strong>
                          <span>{part.searchName || part.description}</span>
                        </div>
                        <em>{part.category || "Uncategorised"}</em>
                        <span>{part.supplier || part.supplier1 || "No supplier"}</span>
                        <span>{numberText(part.currentStock)} {part.uom}</span>
                        <span className="stock-pill">{stockLabel(part)}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          chooseIssuePart(part);
                          navigate("/spare-parts/scanner");
                        }}
                        disabled={!canIssue}
                      >
                        <QrCode size={15} aria-hidden="true" />
                        Issue
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </section>
    );
  }

  function renderSetupPanel() {
    if (!canManage) {
      return <p className="quiet-panel">Executive or admin access is required.</p>;
    }

    return (
      <div className="spare-setup-grid">
        <section className="section-panel spare-import-panel">
          <div className="section-header">
            <div>
              <h2>Apps Script Bridge</h2>
              <span>{syncSettings.configured ? "Configured" : "Not configured"}</span>
            </div>
            <Settings2 size={20} aria-hidden="true" />
          </div>
          <form onSubmit={saveSyncSettings}>
            <label>
              Apps Script URL
              <input
                value={syncSettings.scriptUrl}
                onChange={(event) => setSyncSettings({ ...syncSettings, scriptUrl: event.target.value })}
                placeholder="https://script.google.com/macros/s/..."
              />
            </label>
            <label>
              Sync token
              <input
                type="password"
                value={syncToken}
                onChange={(event) => setSyncToken(event.target.value)}
                placeholder={syncSettings.hasToken ? "Token saved; leave blank to keep" : "Sync token"}
              />
            </label>
            <div className="sheet-name-grid">
              <label>
                Master sheet
                <input value={syncSettings.masterSheetName} onChange={(event) => setSyncSettings({ ...syncSettings, masterSheetName: event.target.value })} />
              </label>
              <label>
                Supplier sheet
                <input value={syncSettings.supplierSheetName} onChange={(event) => setSyncSettings({ ...syncSettings, supplierSheetName: event.target.value })} />
              </label>
              <label>
                Movement sheet
                <input value={syncSettings.movementSheetName} onChange={(event) => setSyncSettings({ ...syncSettings, movementSheetName: event.target.value })} />
              </label>
            </div>
            <div className="spare-sync-actions">
              <button type="submit" disabled={busy === "settings"}>
                <CheckCircle2 size={16} aria-hidden="true" />
                {busy === "settings" ? "Saving" : "Save Settings"}
              </button>
              <button type="button" onClick={pullFromSheet} disabled={busy === "pull" || !syncSettings.configured}>
                <RefreshCw size={16} aria-hidden="true" />
                {busy === "pull" ? "Syncing" : "Pull Sheet"}
              </button>
              <button type="button" onClick={retrySync} disabled={busy === "retry" || summary.unsyncedMovements === 0}>
                <RefreshCw size={16} aria-hidden="true" />
                {busy === "retry" ? "Retrying" : "Retry Sync"}
              </button>
            </div>
          </form>
        </section>

        <section className="section-panel spare-import-panel">
          <div className="section-header">
            <div>
              <h2>Sheet Import</h2>
              <span>Masterlist and supplier data</span>
            </div>
            <FileSpreadsheet size={20} aria-hidden="true" />
          </div>
          <form onSubmit={importParts}>
            <label>
              Masterlist
              <textarea
                value={masterText}
                onChange={(event) => setMasterText(event.target.value)}
                rows={8}
                placeholder={"NO\tCATEGORY\tITEM NAME\tITEM NO.\tOUM\tPRICE(RM)\tPART RANK\tSTATUS\tSTOCK RANK\tMIN\tMAX\tSEARCH NAME\tOPENING"}
              />
            </label>
            <label>
              Supplier info
              <textarea
                value={supplierText}
                onChange={(event) => setSupplierText(event.target.value)}
                rows={6}
                placeholder={"SUPPLIER\nKANAI JUYO KOGYO CO., LTD\nYIK BEE TRADING SDN. BHD."}
              />
            </label>
            <div className="spare-sync-actions">
              <button type="submit" disabled={!masterText.trim() || busy === "import"}>
                <FileSpreadsheet size={16} aria-hidden="true" />
                {busy === "import" ? "Importing" : "Import"}
              </button>
              <button type="button" onClick={() => {
                setMasterText("");
                setSupplierText("");
              }}>
                Clear
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  function renderDetailPanel() {
    if (!detail) {
      return <p className="quiet-panel">Select a spare part from the inventory register.</p>;
    }

    return (
      <section className="section-panel spare-detail-panel">
        <div className="section-header">
          <div>
            <h2>{detail.itemNo}</h2>
            <span>{detail.searchName || detail.description}</span>
          </div>
          <Package size={20} aria-hidden="true" />
        </div>

        <dl className="spare-detail-grid">
          <div>
            <dt>Stock</dt>
            <dd>{numberText(detail.currentStock)} {detail.uom}</dd>
          </div>
          <div>
            <dt>Min / Max</dt>
            <dd>{numberText(detail.minStock)} / {numberText(detail.maxStock)}</dd>
          </div>
          <div>
            <dt>Price</dt>
            <dd>{money.format(detail.price)}</dd>
          </div>
          <div>
            <dt>Lead time</dt>
            <dd>{detail.leadTime || "-"}</dd>
          </div>
          <div>
            <dt>Rank</dt>
            <dd>{detail.partRank || "-"} / {detail.stockRank || "-"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{detail.status || "Active"}</dd>
          </div>
        </dl>

        <div className="spare-qr-card">
          <div className="spare-qr-code" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="spare-qr-actions">
            <button type="button" onClick={copyQrUrl}>
              <ClipboardCopy size={15} aria-hidden="true" />
              Copy
            </button>
            <button type="button" onClick={downloadQr} disabled={!qrSvg}>
              <Download size={15} aria-hidden="true" />
              Download
            </button>
            <Link to={`/spare-parts/issue/${encodeURIComponent(detail.itemNo)}`}>
              <ExternalLink size={15} aria-hidden="true" />
              Open Issue
            </Link>
          </div>
        </div>

        {canManage ? (
          <form className="spare-adjust-form" onSubmit={submitAdjustment}>
            <h3>Adjustment</h3>
            <select value={adjustType} onChange={(event) => setAdjustType(event.target.value as AdjustmentType)}>
              <option value="restock">Restock</option>
              <option value="return">Return to store</option>
              <option value="write_off">Write-off</option>
              <option value="correction">Correction delta</option>
            </select>
            <input type="number" step="1" value={adjustQuantity} onChange={(event) => setAdjustQuantity(event.target.value)} />
            <input value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} placeholder="Reason" />
            <button type="submit" disabled={!adjustNote.trim() || busy === "adjust"}>
              <CheckCircle2 size={15} aria-hidden="true" />
              {busy === "adjust" ? "Saving" : "Save"}
            </button>
          </form>
        ) : null}

        <div className="supplier-list">
          <h3>Suppliers</h3>
          {detail.suppliers.length === 0 ? (
            <p>No supplier rows matched.</p>
          ) : (
            detail.suppliers.slice(0, 5).map((supplier) => (
              <article key={supplier.id}>
                <strong>{supplier.supplier}</strong>
                <span>{supplier.pic || supplier.contactNo || supplier.email || supplier.address}</span>
              </article>
            ))
          )}
        </div>

        <div className="movement-list">
          <h3>
            <History size={16} aria-hidden="true" />
            Movement History
          </h3>
          {detail.movements.length === 0 ? (
            <p>No movements yet.</p>
          ) : (
            detail.movements.slice(0, 20).map((movement) => (
              <article key={movement.id} className={`movement-row sync-${movement.syncStatus}`}>
                <div>
                  <strong>{movement.type.replace("_", " ")}</strong>
                  <span>{movement.workOrderNumber || "Manual"} - {movement.actorName}</span>
                </div>
                <em>{numberText(movement.beforeStock)} to {numberText(movement.afterStock)}</em>
                <time>{formatDateTime(movement.createdAt)}</time>
              </article>
            ))
          )}
        </div>
      </section>
    );
  }

  function renderRecentMovementPanel() {
    return (
      <section className="section-panel spare-detail-panel">
        <div className="section-header">
          <div>
            <h2>Recent Movement</h2>
            <span>{recentMovements.length} latest transactions</span>
          </div>
          <Activity size={20} aria-hidden="true" />
        </div>
        <div className="movement-list">
          {recentMovements.length === 0 ? (
            <p>No stock movements yet.</p>
          ) : (
            recentMovements.map((movement) => (
              <article key={movement.id} className={`movement-row sync-${movement.syncStatus}`}>
                <div>
                  <strong>{movement.itemNo}</strong>
                  <span>{movement.type.replace("_", " ")} - {movement.actorName}</span>
                </div>
                <em>{numberText(movement.beforeStock)} to {numberText(movement.afterStock)}</em>
              </article>
            ))
          )}
        </div>
      </section>
    );
  }

  function renderDashboard() {
    return (
      <>
        <section className="spare-dashboard-banner">
          <div>
            <span>Store control</span>
            <h2>Spare inventory health</h2>
            <p>{summary.lowStock + summary.outOfStock} parts need attention across {categories.length} categories.</p>
          </div>
          <div className="spare-banner-stats">
            <strong>{numberText(summary.totalParts)} SKUs</strong>
            <strong>{numberText(summary.lowStock)} low</strong>
            <strong>{numberText(summary.outOfStock)} out</strong>
            <strong>{syncConfigured ? "Sheet ready" : "Sheet off"}</strong>
          </div>
        </section>

        <div className="spare-dashboard-grid">
          <section className="section-panel spare-health-panel">
          <div className="section-header">
            <div>
              <h2>Stock Watch</h2>
              <span>{summary.lowStock + summary.outOfStock} parts need attention</span>
            </div>
            <AlertTriangle size={20} aria-hidden="true" />
          </div>
          <div className="stock-watch-columns">
            <div>
              <h3>Low Stock</h3>
              {lowStockParts.length === 0 ? <p>Clear</p> : lowStockParts.map((part) => (
                <Link key={part.itemNo} to={`/spare-parts/${encodeURIComponent(part.itemNo)}`}>
                  <strong>{part.itemNo}</strong>
                  <span>{part.searchName || part.description}</span>
                  <em>{numberText(part.currentStock)} {part.uom}</em>
                </Link>
              ))}
            </div>
            <div>
              <h3>Out of Stock</h3>
              {outOfStockParts.length === 0 ? <p>Clear</p> : outOfStockParts.map((part) => (
                <Link key={part.itemNo} to={`/spare-parts/${encodeURIComponent(part.itemNo)}`}>
                  <strong>{part.itemNo}</strong>
                  <span>{part.searchName || part.description}</span>
                  <em>{numberText(part.currentStock)} {part.uom}</em>
                </Link>
              ))}
            </div>
          </div>
          </section>

          <section className="section-panel spare-category-panel">
          <div className="section-header">
            <div>
              <h2>Category Snapshot</h2>
              <span>{categories.length} categories</span>
            </div>
            <Boxes size={20} aria-hidden="true" />
          </div>
          <div className="category-chart-list">
            {categorySnapshot.length === 0 ? (
              <p>No category data yet.</p>
            ) : (
              categorySnapshot.map((item) => (
                <Link
                  key={item.name}
                  to="/spare-parts/inventory"
                  onClick={() => {
                    setCategory(item.name);
                    setStockFilter("all");
                    setSearch("");
                  }}
                  className="category-bar-row"
                >
                  <strong>{item.name}</strong>
                  <span className="category-bar-track">
                    <i style={{ width: `${Math.max(8, (item.count / categoryChartMax) * 100)}%` }} />
                  </span>
                  <em>{item.count} items / {item.low} attention</em>
                </Link>
              ))
            )}
          </div>
          </section>

          {renderRecentMovementPanel()}

          <section className="section-panel spare-command-panel">
          <div className="section-header">
            <div>
              <h2>Command</h2>
              <span>{syncConfigured ? "Sheet sync ready" : "Sheet sync off"}</span>
            </div>
            <SlidersHorizontal size={20} aria-hidden="true" />
          </div>
          <div className="spare-command-links">
            <Link to="/spare-parts/inventory">
              <Package size={17} aria-hidden="true" />
              Inventory
            </Link>
            <Link to="/spare-parts/scanner">
              <QrCode size={17} aria-hidden="true" />
              QR Scanner
            </Link>
            {canManage ? (
              <Link to="/spare-parts/setup">
                <Settings2 size={17} aria-hidden="true" />
                Sheet Setup
              </Link>
            ) : null}
          </div>
          </section>
        </div>
      </>
    );
  }

  const title = technicianMode ? "Spare Part Issue" : view === "setup" ? "Spare Sheet Setup" : view === "scanner" ? "Spare Part Issue" : view === "inventory" || view === "detail" ? "Spare Inventory" : "Spare Parts";

  return (
    <section className={`page-stack spare-page spare-view-${view} ${technicianMode ? "technician-spare-page" : ""}`}>
      <div className="page-title-row page-title-clean">
        <div>
          <p className="eyebrow">Store inventory</p>
          <h1>{title}</h1>
        </div>
        {technicianMode ? (
          <PwaInstallButton className="spare-install-action" />
        ) : (
          <span className={`sync-chip ${syncConfigured ? "ready" : "offline"}`}>
            <RefreshCw size={16} aria-hidden="true" />
            {syncConfigured ? "Sheet sync ready" : "Sheet sync off"}
          </span>
        )}
      </div>

      {renderTabs()}
      {renderIssueFeedback()}
      {message ? <p className="success-line">{message}</p> : null}
      {error ? <p className="error-line">{error}</p> : null}

      {!["scanner", "setup"].includes(view) ? renderMetrics() : null}
      {view === "dashboard" ? renderDashboard() : null}
      {view === "inventory" ? (
        <div className="spare-inventory-shell">{renderInventoryPanel()}</div>
      ) : null}
      {view === "detail" ? (
        <div className="spare-layout">
          <div className="spare-main">{renderDetailPanel()}</div>
          <aside className="spare-side">{renderRecentMovementPanel()}</aside>
        </div>
      ) : null}
      {view === "scanner" ? (
        <div className="spare-scanner-shell">
          <div className="spare-scanner-only">{renderScannerPanel()}</div>
          {!technicianMode ? <div className="spare-scanner-recent">{renderRecentMovementPanel()}</div> : null}
        </div>
      ) : null}
      {view === "setup" ? renderSetupPanel() : null}
    </section>
  );
}
