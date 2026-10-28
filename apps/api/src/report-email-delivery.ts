import { readFileSync } from "node:fs";
import type { WeeklyReport } from "@sugi-cmms/shared";
import { db } from "./db.js";
import { plantContext } from "./plant-context.js";
import { renderWeeklyEmail } from "./weekly-report-email.js";

export type ReportEmailSettings = { to: string[]; cc: string[]; updatedAt: string | null };
const scope = () => plantContext.getStore()?.plant ?? "port-klang";

export function initializeReportEmailSettings() {
  db.exec("CREATE TABLE IF NOT EXISTS report_email_settings (scope TEXT PRIMARY KEY, recipients TEXT NOT NULL, updatedAt TEXT NOT NULL)");
}

function addresses(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("Enter up to 20 email addresses, separated by commas.");
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || /[\r\n]/.test(item)) throw new Error("Enter plain email addresses without line breaks or display names.");
    const address = item.trim();
    if (address.length > 254 || !/^[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(address)) throw new Error(`Invalid email address: ${address.slice(0, 80)}`);
    if (!result.some((a) => a.toLowerCase() === address.toLowerCase())) result.push(address);
  }
  return result;
}

export function reportEmailSettings(): ReportEmailSettings {
  const row = db.prepare("SELECT recipients, updatedAt FROM report_email_settings WHERE scope = ?").get(scope()) as { recipients: string; updatedAt: string } | undefined;
  return row ? { ...JSON.parse(row.recipients), updatedAt: row.updatedAt } : { to: [], cc: [], updatedAt: null };
}

export function saveReportEmailSettings(input: unknown): ReportEmailSettings {
  const value = input as { to?: unknown; cc?: unknown } | null;
  const to = addresses(value?.to); const cc = addresses(value?.cc ?? []).filter((a) => !to.some((t) => t.toLowerCase() === a.toLowerCase()));
  if (to.length + cc.length > 20) throw new Error("Use no more than 20 recipients in total.");
  db.prepare("INSERT INTO report_email_settings (scope, recipients, updatedAt) VALUES (?, ?, ?) ON CONFLICT(scope) DO UPDATE SET recipients = excluded.recipients, updatedAt = excluded.updatedAt")
    .run(scope(), JSON.stringify({ to, cc }), new Date().toISOString());
  return reportEmailSettings();
}

export function requireReportRecipients() {
  const settings = reportEmailSettings();
  if (!settings.to.length) throw new Error("Save at least one To recipient in CMMS report email settings before sending.");
  return settings;
}

function logoData() {
  for (const relative of ["../../web/dist/brand/sugi_logo_white.png", "../../web/public/brand/sugi_logo_white.png"]) {
    try { return readFileSync(new URL(relative, import.meta.url)).toString("base64"); } catch { /* Try the development asset after the production build. */ }
  }
  throw new Error("CMMS email logo is missing. Rebuild the CMMS image before sending.");
}

/** The saved browser preview stays usable; SMTP receives a CID image attachment. */
export function reportDeliveryPacket(report: WeeklyReport) {
  return {
    subject: report.subject,
    html: renderWeeklyEmail(report, "cid:cmmsLogo"),
    toEmail: (report.deliveryTo || []).join(", "), ccEmail: (report.deliveryCc || []).join(", "),
    logo: { data: logoData(), mimeType: "image/png", fileName: "cmms-logo.png" }
  };
}
