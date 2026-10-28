import { plantLabels, workOrderStatusLabels, type WeeklyReport, type WeeklyReliabilityAnalysis } from "@sugi-cmms/shared";

export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const round = (value: number) => Math.round(value * 10) / 10;
const date = (value: string) => new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const timestamp = (value: string) => new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) + " MYT";
const periodEnd = (value: string) => date(new Date(Date.parse(value) - 1).toISOString());
const td = (value: unknown) => `<td style="padding:11px 8px;border-bottom:1px solid #dddddd;font-size:12px;line-height:1.6;vertical-align:top;overflow-wrap:anywhere">${escapeHtml(value)}</td>`;
const note = (value: string) => `<p class="report-muted" style="font-size:11px;line-height:1.7;color:#555555">${escapeHtml(value)}</p>`;
const section = (title: string, body: string) => `<h2 class="report-section-title" style="font-size:19px;line-height:1.4;color:#000000;margin:32px 0 14px;border-top:2px solid #000000;padding-top:15px">${escapeHtml(title)}</h2>${body}`;
const list = (values: string[], ordered = false) => `<${ordered ? "ol" : "ul"} style="padding-left:20px;margin:0;font-size:13px;line-height:1.8">${values.map((v) => `<li style="padding-bottom:8px">${escapeHtml(v)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`;

function table(headers: string[], rows: unknown[][]) {
  return `<table class="report-table" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed"><thead><tr>${headers.map((h) => `<th align="left" bgcolor="#000000" style="padding:11px 8px;background-color:#000000;font-size:11px;line-height:1.5;color:#ffffff;overflow-wrap:anywhere">${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map(td).join("")}</tr>`).join("")}</tbody></table>`;
}

function bars(rows: { label: string; value: number }[], unit = "") {
  if (!rows.length) return note("No matching records in this reporting window.");
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="table-layout:fixed">${rows.map((r) => `<tr><td width="42%" style="padding:8px 10px 8px 0;font-size:11px;line-height:1.6;overflow-wrap:anywhere">${escapeHtml(r.label)}</td><td width="43%" style="padding:8px 0"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${r.value > 0 ? `<td width="${Math.max(1, Math.round(r.value / max * 100))}%" height="12" bgcolor="#000000" style="background-color:#000000;font-size:1px;line-height:12px">&nbsp;</td>` : ""}<td height="12" style="font-size:1px;border-bottom:1px solid #bbbbbb">&nbsp;</td></tr></table></td><td width="15%" align="right" style="font-size:12px;padding-left:6px">${escapeHtml(r.value)}${unit}</td></tr>`).join("")}</table>`;
}

function appUrl() {
  const fallback = "https://cmms.sugidigital.org/";
  try {
    const url = new URL(process.env.APP_PUBLIC_URL || fallback);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return fallback;
    url.search = ""; url.hash = ""; url.pathname = url.pathname.replace(/\/+$/, "") + "/";
    return url.href;
  } catch { return fallback; }
}

function button(url: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#000000" style="background-color:#000000;border:1px solid #000000;mso-padding-alt:14px 24px"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#ffffff;text-decoration:none;mso-padding-alt:0"><span style="color:#ffffff">Open CMMS app &#8594;</span></a></td></tr></table>`;
}

const place = (r: { plant: keyof typeof plantLabels; department: string; section: string; area: string }) => `${plantLabels[r.plant]} · ${r.department} · ${r.section} / ${r.area}`;

function reliabilitySections(r: WeeklyReliabilityAnalysis, partial = false) {
  const machineRows = r.machines.map((m) => [
    `${m.machine} · ${place(m)}`,
    `${m.weekReports} / ${m.previousWeekReports}`,
    `${m.reports30d} reports${m.repeatedIssue ? ` · ${m.repeatedIssue}: ${m.repeatedIssueReports}` : ""}`,
    `${m.repairBacklog} open · ${m.returnedThisWeek} returned · ${round(m.downtimeMinutes / 60)} h (${m.downtimeSamples} measured)`
  ]);
  return section("Maintenance situation · evidence and priorities", list(r.findings))
    + section("Machines with frequent maintenance reports", note(`30-day window: ${date(r.lookbackStart)}–${partial ? timestamp(r.lookbackEnd) : periodEnd(r.lookbackEnd)}. ${r.maintenanceReportsThisWeek} maintenance reports this week${partial ? " so far" : ""} versus ${r.maintenanceReportsPreviousWeek} ${partial ? "in the same elapsed period last week" : "last week"}; ${r.maintenanceReports30d} in the 30-day window. ${r.repeatMachines30d} identifiable machines had at least two reports. Rankings count distinct work orders, not confirmed physical failures.`)
      + bars(r.machines.filter((m) => m.reports30d > 0).map((m) => ({ label: `${m.machine} · ${place(m)}`, value: m.reports30d })))
      + (machineRows.length ? table(["Machine / location", "This / prior week", "30-day repeat pattern", "At cutoff / weekly repair time"], machineRows) : note("No identifiable equipment is recorded for the available maintenance requests.")))
    + section("Lines, sections and areas with reported issues", note("Locations use the section and area recorded on each maintenance work order. Separate plants and departments remain separate. Ranked by this week's report count; repair backlog includes carried-over maintenance jobs.")
      + bars(r.locations.filter((l) => l.weekReports > 0).map((l) => ({ label: place(l), value: l.weekReports })))
      + (r.locations.length ? table(["Plant / department / place", "This / prior week", "30-day reports", "Repair backlog / measured hours"], r.locations.map((l) => [place(l), `${l.weekReports} / ${l.previousWeekReports}`, l.reports30d, `${l.repairBacklog} open · ${round(l.downtimeMinutes / 60)} h`])) : note("No maintenance locations are recorded in the reporting window.")))
    + section("Most reported issue categories", r.issues.length ? table(["Recorded issue category", "This week", "30-day reports"], r.issues.map((i) => [i.category, i.weekReports, i.reports30d])) : note("No maintenance issue categories are recorded in this window."))
    + section("Live situation when this report was generated", note(`Snapshot: ${timestamp(r.live.asOf)}. ${partial ? "This week-to-date snapshot" : "This is separate from the completed reporting week and"} is frozen when the report is saved. Live totals cover all work types; the location register below covers maintenance repair backlog only.`)
      + table(["Current workload", "Count"], [
        ["Awaiting repair · all work types", r.live.repairBacklog], ["Of which maintenance jobs", r.live.maintenanceBacklog],
        ["Critical awaiting repair", r.live.critical], ["Overdue awaiting repair", r.live.overdue], ["Awaiting materials", r.live.pendingMaterial], ["On hold", r.live.onHold],
        ["Resolved awaiting verification", r.live.awaitingVerification], ["Oldest awaiting-repair job · days", r.live.oldestOpenDays]
      ])
      + (r.live.locations.length ? table(["Current maintenance backlog by place", "Open jobs", "Critical", "Oldest · days"], r.live.locations.map((l) => [place(l), l.backlog, l.critical, l.oldestOpenDays])) : note("No live maintenance repair backlog is recorded.")))
    + section("Data coverage", note(`${r.unidentifiedMachineReports30d} maintenance reports in the 30-day window lack identifiable equipment and are excluded from machine rankings; ${r.missingLocationReports30d} lack a usable section/area. A registered machine ID is preferred. Without one, plant, department, section, area and normalised machine name identify a group. Duplicate requests can inflate report frequency; a returned repair is tracked separately and does not create a new incident. Projects, KAIZEN, office work and cancelled requests are excluded from maintenance incident counts. No operating-hours data is available to calculate a failure rate or MTBF.`));
}

export function renderWeeklyEmail(report: WeeklyReport) {
  const f = report.facts; const c = f.current; const p = f.previous;
  const partial = f.periodMode === "week-to-date";
  const url = appUrl(); const logo = new URL("brand/sugi_logo_white.png", url).href;
  const delta = (value: number) => value > 0 ? `+${value}` : String(value);
  const dailyMax = Math.max(1, ...f.daily.flatMap((d) => [d.created, d.resolved, d.closed]));
  const dailyChart = note("Distinct work orders per day. A returned job resolved on another day can appear again; weekly totals count each job once.")
    + `<table width="100%" role="presentation" cellpadding="0" cellspacing="0">${f.daily.map((d) => `<tr><td width="17%" valign="top" style="font-size:12px;padding:9px 4px 0 0">${escapeHtml(d.date.slice(5))}</td><td>${[["New", d.created], ["Resolved", d.resolved], ["Closed", d.closed]].map(([name, n]) => `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:6px 0"><tr><td width="28%" style="font-size:11px">${name}: ${n}</td><td><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${n ? `<td width="${Math.max(1, Math.round(Number(n) / dailyMax * 100))}%" height="9" bgcolor="#000000" style="background-color:#000000;font-size:1px;line-height:9px">&nbsp;</td>` : ""}<td height="9" style="border-bottom:1px solid #bbbbbb;font-size:1px">&nbsp;</td></tr></table></td></tr></table>`).join("")}</td></tr>`).join("")}</table>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(report.subject)}</title><style>
    :root{color-scheme:light dark;supported-color-schemes:light dark}
    @media(prefers-color-scheme:dark){.report-shell,.report-document,.report-content,.report-cta{background-color:#000000!important;color:#ffffff!important}.report-section-title{color:#ffffff!important;border-color:#ffffff!important}.report-muted,.report-definitions{color:#dddddd!important}.report-table th{background-color:#ffffff!important;color:#000000!important}.report-table td{border-color:#555555!important}.report-content td[bgcolor="#000000"]{background-color:#ffffff!important}.report-content a span{color:#000000!important}}
    [data-ogsc] .report-shell,[data-ogsc] .report-document,[data-ogsc] .report-content,[data-ogsc] .report-cta{background-color:#000000!important;color:#ffffff!important}[data-ogsc] .report-section-title{color:#ffffff!important;border-color:#ffffff!important}[data-ogsc] .report-muted,[data-ogsc] .report-definitions{color:#dddddd!important}[data-ogsc] .report-table th{background-color:#ffffff!important;color:#000000!important}[data-ogsc] .report-table td{border-color:#555555!important}[data-ogsc] .report-content td[bgcolor="#000000"]{background-color:#ffffff!important}[data-ogsc] .report-content a span{color:#000000!important}
    @media(max-width:520px){.report-padding{padding:22px 14px!important}.report-title{font-size:25px!important}.report-table th,.report-table td{font-size:10px!important;padding:9px 5px!important}}
    </style></head><body class="report-shell" bgcolor="#ffffff" style="margin:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111111"><table class="report-shell" width="100%" role="presentation" cellpadding="0" cellspacing="0" bgcolor="#ffffff"><tr><td align="center" style="padding:24px 8px"><table class="report-document" width="720" role="presentation" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:100%;max-width:720px;background-color:#ffffff;border:1px solid #000000"><tr><td class="report-padding" bgcolor="#000000" style="padding:30px;background-color:#000000;color:#ffffff">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="66"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><img class="report-logo" src="${escapeHtml(logo)}" width="52" height="52" alt="Sugihara Grand Industries Sdn. Bhd. CMMS logo" style="display:block;width:52px;height:52px;border:0;color:#ffffff"></a></td><td style="color:#ffffff"><strong style="font-size:21px;letter-spacing:1px;color:#ffffff">SUGI CMMS</strong><br><span style="font-size:10px;line-height:1.8;color:#ffffff">SUGIHARA GRAND INDUSTRIES SDN. BHD.</span></td></tr></table>
    <p style="margin:28px 0 10px;font-size:10px;letter-spacing:2px;color:#ffffff">${partial ? "WEEK-TO-DATE" : "WEEKLY"} MAINTENANCE INTELLIGENCE</p><h1 class="report-title" style="font-size:31px;line-height:1.25;margin:0 0 14px;color:#ffffff">Management report<br>&amp; reliability insights</h1><p style="margin:0;font-size:13px;line-height:1.7;color:#ffffff">${escapeHtml(f.scope === "all" ? "Port Klang & Sendayan" : plantLabels[f.scope])}<br>${partial ? "This week so far" : "Reporting week"}: ${date(f.start)} – ${partial ? timestamp(f.end) : periodEnd(f.end)}</p></td></tr><tr><td class="report-content report-padding" bgcolor="#ffffff" style="padding:26px;background-color:#ffffff">
    ${partial ? note(`Interim report: Monday to ${timestamp(f.end)}. This is an incomplete week. All previous-week comparisons use the same elapsed Monday-to-cutoff period seven days earlier. The 30-day window ends at this snapshot. The scheduled completed-week email remains separate.`) : ""}
    ${button(url)}<p style="font-size:13px;line-height:1.7;margin-top:24px">Dear Management Team,</p>
    ${section("Executive summary", `<p style="font-size:14px;line-height:1.9">${escapeHtml(report.summary)}</p>${note(report.aiMessage)}`)}
    ${section(`${partial ? "Week-to-date" : "Weekly"} scorecard · all work types`, table(["Measure", partial ? "This week so far" : "This week", partial ? "Prior week · same elapsed period" : "Previous week", "Change"], [
      ["New work orders", c.created, p.created, delta(c.created - p.created)], ["Repair resolved", c.resolved, p.resolved, delta(c.resolved - p.resolved)], ["Requester closed", c.closed, p.closed, delta(c.closed - p.closed)],
      ["Repair backlog at cutoff", c.backlog, p.backlog, delta(c.backlog - p.backlog)], ["Awaiting verification", c.awaitingVerification, p.awaitingVerification, delta(c.awaitingVerification - p.awaitingVerification)],
      ["Overdue repair backlog", c.overdue, p.overdue, delta(c.overdue - p.overdue)], ["Critical repair backlog", c.critical, p.critical, delta(c.critical - p.critical)],
      ["Recorded job downtime · hours", round(c.downtimeMinutes / 60), round(p.downtimeMinutes / 60), `${delta(round((c.downtimeMinutes - p.downtimeMinutes) / 60))} h`]
    ]))}
    ${f.reliability ? reliabilitySections(f.reliability, partial) : note("This older snapshot does not include machine/location reliability analysis. Generate a new reporting draft to include it.")}
    ${section("Management action plan", list(report.actions, true))}
    ${section("Daily work order activity", dailyChart)}
    ${section("Work order status at weekly cutoff", bars(f.statuses.filter((s) => s.count).map((s) => ({ label: workOrderStatusLabels[s.status], value: s.count }))))}
    ${section("Repair backlog ageing at weekly cutoff", bars(f.ageing.map((b) => ({ label: b.label, value: b.count }))))}
    ${section("Plant overview · reporting week", table(["Plant", "New", "Resolved", "Backlog", "Overdue"], f.plants.map((p) => [plantLabels[p.plant], p.metrics.created, p.metrics.resolved, p.metrics.backlog, p.metrics.overdue])))}
    ${section("Equipment with highest recorded downtime · all work types", f.machines.length ? bars(f.machines.map((m) => ({ label: `${plantLabels[m.plant]} · ${m.machine}${m.section ? ` · ${m.section} / ${m.area || "Unspecified area"}` : ""} (${m.jobs} jobs)`, value: round(m.minutes / 60) })), " h") : note("No measured repair resolutions in this period."))}
    ${section("Priority follow-up register · weekly cutoff", f.exceptions.length ? table(["Reference / plant", "Equipment / owner", "Status / age", "Follow-up"], f.exceptions.map((e) => [`${e.number} · ${plantLabels[e.plant]}`, `${e.machine} · ${e.owner}`, `${workOrderStatusLabels[e.status]} · ${e.ageDays} days`, e.reason])) + note(`Showing ${f.exceptions.length} of ${f.exceptionCount} items requiring attention.`) : note("No priority exceptions were recorded at the reporting cutoff."))}
    <table width="100%" role="presentation" cellpadding="0" cellspacing="0" style="margin-top:30px"><tr><td class="report-cta" bgcolor="#ffffff" style="padding:22px;background-color:#ffffff;border:1px solid #000000"><p style="font-size:16px;font-weight:bold;margin:0 0 8px">From insight to follow-up.</p><p style="font-size:13px;line-height:1.7;margin:0 0 16px">Review the work orders behind this report and agree the next maintenance actions with the responsible team.</p>${button(url)}${note("Sign in with your CMMS account. Your existing plant access applies.")}</td></tr></table>
    <div class="report-definitions" style="border-top:1px solid #dddddd;margin-top:30px;padding-top:18px;font-size:10px;line-height:1.8;color:#555555"><strong>Reporting definitions</strong><br>Week boundaries use Asia/Kuala_Lumpur and include the start but exclude the following Monday. Backlog includes carried-over work awaiting repair, and excludes resolved, closed and cancelled jobs. The separately timestamped live snapshot includes later recorded activity and is frozen when saved.<br>Weekly resolved/closed counts are distinct work orders with that event during the week; daily counts can repeat a returned job across days.<br>Downtime is full elapsed time from first acknowledgement to the latest repair resolution in the reporting week, including material waits and returned-repair intervals, excluding requester verification time. Summed job durations can overlap and are not unique production downtime. ${c.downtimeSamples} measured work orders; ${c.missingAcknowledgement} resolved work orders excluded for missing/invalid acknowledgement timing. Location and machine reliability downtime covers maintenance work only; the overall scorecard and downtime chart cover all work types.<br>Historical statuses use activity records. Equipment labels, issue categories, ownership, priority and due dates reflect the current record. Deleted work orders are excluded. Recurring reports/categories are investigation signals, not a confirmed root-cause diagnosis.<br>Prepared ${timestamp(report.generatedAt)} · Sugihara Grand Industries Sdn. Bhd.</div>
    </td></tr></table></td></tr></table></body></html>`;
}
