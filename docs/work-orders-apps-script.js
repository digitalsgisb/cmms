/**
 * SUGI CMMS work-order mirror for Google Sheets.
 *
 * 1. Create a Google Sheet and open Extensions > Apps Script.
 * 2. Paste this file into Code.gs.
 * 3. In Project Settings > Script properties add CMMS_SHARED_TOKEN.
 * 4. Deploy as a Web app, execute as yourself, and grant access to the CMMS server.
 * 5. Copy the /exec URL and the same token into CMMS Developer Mode > Settings.
 */

const WORK_ORDER_HEADERS = [
  "WorkOrderID", "DateSubmitted", "Date", "Shift", "Type", "Section", "Area",
  "Machine Name", "MachineID", "IssueCategory", "ReportedBy", "Department", "Priority",
  "IssueDescription", "PhotoIssue", "Downtime Actual", "Total Downtime", "Status",
  "MaintenanceBy", "MaintenanceNotes", "PhotoFix", "DateAcknowledge", "AcknowledgeTime",
  "DateRepair", "RepairTime", "FinishTime", "VerifyTime", "Change Spare Part", "Part Name",
  "Quantity", "Part Number", "DateResolved", "Date Finish", "DateClosed", "Remarks",
  "ReturnPhoto", "UpdatedAt"
];

function doPost(event) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const request = JSON.parse((event.postData && event.postData.contents) || "{}");
    const expectedToken = PropertiesService.getScriptProperties().getProperty("CMMS_SHARED_TOKEN");
    if (!expectedToken || request.token !== expectedToken) return jsonResponse({ ok: false, error: "Unauthorized" });
    if (request.action !== "upsertWorkOrder" || !request.Data) return jsonResponse({ ok: false, error: "Unsupported action" });

    const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    const spreadsheet = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = String(request.sheetName || "WorkOrders");
    const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
    ensureHeaders(sheet);

    const workOrderId = String(request.Data.WorkOrderID || "").trim();
    if (!workOrderId) return jsonResponse({ ok: false, error: "WorkOrderID is required" });
    const values = WORK_ORDER_HEADERS.map((header) => request.Data[header] == null ? "" : request.Data[header]);
    const lastRow = sheet.getLastRow();
    let targetRow = lastRow + 1;
    if (lastRow > 1) {
      const match = sheet.getRange(2, 1, lastRow - 1, 1).createTextFinder(workOrderId).matchEntireCell(true).findNext();
      if (match) targetRow = match.getRow();
    }
    sheet.getRange(targetRow, 1, 1, WORK_ORDER_HEADERS.length).setValues([values]);
    return jsonResponse({ ok: true, row: targetRow, workOrderId: workOrderId });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function ensureHeaders(sheet) {
  const current = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), WORK_ORDER_HEADERS.length)).getValues()[0] : [];
  const differs = WORK_ORDER_HEADERS.some((header, index) => current[index] !== header);
  if (sheet.getLastRow() === 0 || differs) {
    sheet.getRange(1, 1, 1, WORK_ORDER_HEADERS.length).setValues([WORK_ORDER_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, WORK_ORDER_HEADERS.length).setFontWeight("bold").setBackground("#7f111b").setFontColor("#ffffff");
  }
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
