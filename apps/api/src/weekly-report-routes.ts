import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import type { PlantId } from "@sugi-cmms/shared";
import { plantContext } from "./plant-context.js";
import { acceptManualDelivery, claimWeeklyDelivery, completeWeeklyDelivery, generateCurrentReport, generateWeeklyReport, previewWeeklyReport, readWeeklyReport, resetWeeklyDelivery, sendReportNow, weeklyReportHistory } from "./weekly-report.js";

const asyncRoute = (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
function week(req: Request) {
  const value = req.method === "GET" ? req.query.week : req.body?.week;
  if (value !== undefined && typeof value !== "string") throw new Error("Choose one reporting week.");
  return value as string | undefined;
}

/** Mounted before session auth, with its own token and explicit plant allowlist.
 * This token only permits report generation and delivery callbacks. */
export function weeklyAutomationRouter() {
  const router = Router();
  router.use((req, res, next) => {
    const expected = process.env.CMMS_REPORT_TOKEN || "";
    const supplied = req.header("x-cmms-report-token") || "";
    if (expected.length < 32 || !timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(supplied).digest())) {
      res.status(401).json({ error: "A valid reporting integration token is required." }); return;
    }
    const plants = (process.env.CMMS_REPORT_PLANTS || "port-klang").split(",").map((p) => p.trim());
    const plant = String(req.header("x-cmms-plant") || "port-klang");
    if (!["port-klang", "sendayan", "all"].includes(plant)) { res.status(400).json({ error: "Select a valid report plant." }); return; }
    if (plant === "all" ? !["port-klang", "sendayan"].every((p) => plants.includes(p)) : !plants.includes(plant)) {
      res.status(403).json({ error: "The report integration cannot access this plant." }); return;
    }
    plantContext.run({ plant: plant as PlantId | "all" }, next);
  });
  router.post("/weekly", asyncRoute(async (req, res) => { res.json(await generateWeeklyReport(week(req))); }));
  router.post("/weekly/:id/claim", (req, res) => { res.json(claimWeeklyDelivery(req.params.id)); });
  router.post("/weekly/:id/accept-manual", (req, res) => {
    if (typeof req.body?.deliveryToken !== "string") throw new Error("A delivery token is required.");
    res.json(acceptManualDelivery(req.params.id, req.body.deliveryToken));
  });
  router.post("/weekly/:id/delivery", (req, res) => {
    if (typeof req.body?.deliveryToken !== "string" || typeof req.body?.sent !== "boolean") throw new Error("A delivery token and boolean delivery result are required.");
    res.json(completeWeeklyDelivery(req.params.id, req.body.deliveryToken, req.body.sent));
  });
  // Do not let an integration token fall through into the normal API.
  router.use((_req, res) => { res.status(404).json({ error: "Unknown reporting integration endpoint." }); });
  return router;
}

export function weeklyManagementRouter() {
  const router = Router();
  router.use((req, res, next) => {
    if (!req.cmmsUser || !["executive", "admin", "developer"].includes(req.cmmsUser.role)) {
      res.status(403).json({ error: "Management access is required." }); return;
    }
    next();
  });
  router.get("/preview", asyncRoute(async (req, res) => { res.json(await previewWeeklyReport(week(req), false, req.query.current === "true")); }));
  router.get("/history", (_req, res) => { res.json(weeklyReportHistory()); });
  router.get("/:id", (req, res) => { res.json(readWeeklyReport(req.params.id)); });
  router.post("/generate", asyncRoute(async (req, res) => { res.json(await generateWeeklyReport(week(req), req.body?.regenerate === true)); }));
  router.post("/current", asyncRoute(async (_req, res) => { res.json(await generateCurrentReport()); }));
  router.post("/:id/send", asyncRoute(async (req, res) => { res.json(await sendReportNow(req.params.id)); }));
  router.post("/:id/reset-delivery", (req, res) => {
    if (req.body?.confirmedNotSent !== true) throw new Error("Confirm the email was not sent before allowing another delivery attempt.");
    res.json(resetWeeklyDelivery(req.params.id));
  });
  return router;
}
