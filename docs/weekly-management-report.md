# Weekly CMMS management report

The Reports page contains a weekly email preview, local AI generation, HTML download, and saved reports with delivery status. Access is restricted to executive, admin and developer roles and the selected plant. Both-plants reports require access to both plants. Generating or previewing does not send email.

The email uses a **black-and-white theme**, the white CMMS company symbol with SUGI CMMS branding, and **Open CMMS app** buttons at the top and bottom. All charts are monochrome and daily series are explicitly labelled. Set `APP_PUBLIC_URL` to the CMMS address recipients can reach (for example `https://cmms.sugidigital.org`); it supplies the button destination and preview image URL. Without a valid HTTP(S) URL, the template falls back to `https://cmms.sugidigital.org/`. Do not use an internal Docker service hostname as the public URL. The updated n8n workflows embed the logo as an inline PNG using `cid:cmmsLogo`, avoiding an external image download. Outlook policies can still affect rendering. Existing saved previews retain their template. New reports use concise subjects with the plant and date range. See [the recipients and inline-logo upgrade guide](report-email-upgrade.md) before updating an existing installation.

## Machine reliability and the current situation

Everything is included in the HTML email and preview; a separate dashboard or attachment is not required:

- **Frequent machine reports:** top five equipment groups by distinct maintenance requests in the 30 days ending at the weekly cutoff, with this-week/prior-week counts, recurring issue categories, returned repairs, measured repair duration and outstanding repairs. Two or more requests identify a repeat-report signal. A return on the same work order is not counted as a new request.
- **Lines, sections and areas:** top five places by reporting-week maintenance request volume, with prior-week comparisons, 30-day totals, carried-over repair backlog and measured job duration. These labels use the actual section and area fields; the application does not invent production-line assignments.
- **Issue patterns:** the most frequently recorded issue categories. Repeated categories justify a review but do not establish a root cause or prove independent breakdowns.
- **Live situation:** a separately timestamped snapshot at report generation, including repair backlog, critical/overdue jobs, material waits, holds, verification waits and the oldest open job. Live totals include all work types; the live location register includes maintenance only. Later-created work orders enter this snapshot without rewriting the completed week's metrics. Saved snapshots do not refresh automatically.
- **Grounded findings and actions:** the application calculates named equipment/location observations and action prompts. Ollama receives the weekly metrics, top machine/location/category aggregates, calculated findings and live snapshot to write a more specific executive summary. Raw issue descriptions, personal details and unrestricted database access are not provided.

Incident frequency uses **request creation timestamps**, not resolution dates or assumed failure dates, and excludes requests cancelled at the relevant cutoff. Only `maintenance` work orders enter incident counts; `project`, `kaizen` and `office` work do not inflate the ranking. The overall weekly scorecard continues to cover all work types. Missing equipment is excluded from machine rankings and counted in a data-coverage note. Registered machine IDs are preferred; otherwise normalised machine name, section, area, department and plant form the identity. Matching names in other plants/areas remain separate. Duplicate requests can inflate counts, and the system has no operating-hours denominator for MTBF/failure rates. Historical labels/categories, priorities and due dates reflect the current record.

AI output can now contain names with digits and supplied numeric values. Numeric tokens absent from the supplied evidence are rejected, along with malformed/oversized output; this is a grounding guard, not a guarantee of every qualitative claim or numeric association. The deterministic findings, charts and action list are available even when local AI fails. Only one local AI request runs at a time, with a two-minute timeout, a 16K context and a bounded output budget.

Reports cover the last completed Monday–Sunday in **Asia/Kuala_Lumpur**, regardless of the PC timezone. You can select an earlier Monday. A saved report is a snapshot; it does not change when a work order is edited later. An unsent draft can be regenerated. Preview uses current records and can therefore differ from an earlier saved report.

## Run locally on the CMMS PC

1. Install Ollama on the PC and download a model appropriate for its CPU/GPU. The 128 GB of RAM provides ample memory for several model sizes, but does not determine generation speed. Start by benchmarking a small instruction-following model rather than selecting a large model purely from RAM. Set `OLLAMA_MODEL` to the exact installed model tag. The application uses Ollama's `/api/chat` endpoint, a JSON schema, a bounded context, a two-minute timeout, and unloads the model after the request. It does not download models automatically.
2. Set `OLLAMA_BASE_URL` (normally `http://127.0.0.1:11434`) and `OLLAMA_MODEL` in `.env`. Restart CMMS. A missing model, timeout, network failure, or invalid AI output produces a factual report instead.
3. Create a random reporting token and, if using Docker, a separate persistent n8n encryption key. You can generate each with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Store these as `CMMS_REPORT_TOKEN` and `N8N_ENCRYPTION_KEY`. Do not commit `.env`.
4. Set `CMMS_REPORT_PLANTS=port-klang` for one plant or `CMMS_REPORT_PLANTS=port-klang,sendayan` for access to both.
5. Run a self-hosted n8n instance on the PC. Keep its editor and the Ollama endpoint private. If CMMS runs in Docker, `localhost` inside its container refers to that container, not the Windows host; use a reachable local address or the optional Compose setup below.

### Optional Docker Compose setup

The repository includes `compose.reporting.yaml`. It adds CPU-based Ollama and n8n, persistent storage and loopback-only service ports. Ensure the Docker host has sufficient resources, available disk space for models and the correct GPU drivers if GPU acceleration will be configured. The example images use `latest`; pin tested image versions for a production deployment.

```powershell
docker compose -f compose.yaml -f compose.reporting.yaml up -d --build
docker compose -f compose.yaml -f compose.reporting.yaml exec ollama ollama pull <chosen-model-tag>
```

Set `OLLAMA_MODEL` to the downloaded tag and restart the CMMS service. Open n8n at `http://localhost:5678` and finish its owner account setup. Use `http://cmms:3300` for the CMMS URL in the workflow when both are in Compose. Existing CMMS data volumes remain in use. No services or model downloads are started by the code change itself.

## Configure weekly email

1. Import `docs/n8n-weekly-management-report.json` into n8n. It is initially inactive.
2. In **Report configuration**, set the CMMS URL, plant (`port-klang`, `sendayan`, or `all`) and sender address. In **CMMS → Reports → Email recipients**, save To and optional CC addresses for that same plant view. Recipients are managed in CMMS; the sender and SMTP credentials stay in n8n. The updated workflow prepares the inline logo before sending.
3. Create a **Header Auth** credential named **CMMS reporting token**: header name `X-CMMS-Report-Token`, value equal to `CMMS_REPORT_TOKEN`. Select it on every HTTP Request node.
4. Configure **CMMS SMTP** with your company's SMTP host, port, authentication and TLS settings, then select it on **Send management email**. Credentials live in n8n, not the report or browser. No Outlook/Gmail account has been connected by this implementation.
5. Generate and review a report in CMMS. Test the workflow with your own address. Testing sends real email, so use a test recipient deliberately. A successfully sent week will not send again automatically; use an isolated test database if you need to rehearse the same period repeatedly.
6. Activate the workflow after testing. Its default is **Monday at 08:00 Malaysia time**. The PC, CMMS and n8n must be running. A missed schedule is not automatically backfilled: generate the desired earlier week with a `week` body value and run a controlled delivery if needed.

The integration token can generate reports and update delivery state only; it cannot act as a normal CMMS login. Plant access is checked independently of the requested header. Do not expose the reporting token in the browser.

## Delivery and recovery

Generation is idempotent per plant view and week. n8n requests a delivery claim before sending. Only one caller can claim a draft, so parallel runs and reruns of sent reports skip email. Reports progress from `draft` to `sending` to `sent` or `failed`. SMTP acceptance is what `sent` means; it does not guarantee inbox delivery or reading.

SMTP is not an exactly-once transport. If n8n stops after SMTP accepts a message but before recording success, the report stays `sending`. Failure after partial recipient acceptance can also be uncertain. There are deliberately no automatic SMTP retries. Check the n8n execution and sent mailbox; only if the report was not sent, use the confirmation and reset control in CMMS Reports before running the workflow again. A reporting callback can safely be retried with the same attempt token. Change recipients in CMMS; each delivery captures its To/CC list when reserved. Separate audiences requiring separate delivery records should use separate report snapshots.

## Data definitions

- **Downtime** is first acknowledgement to repair resolution. It runs through pending-material/on-hold states and resumes through the next resolution after a return. It does not wait for requester closure. Cancellation freezes an active counter at cancellation. Unacknowledged records display **Not acknowledged**, including historical records with no acknowledgement event; no timing is fabricated.
- **Total Time** is hidden from work order screens. Existing lifecycle timestamps and the legacy Total Time export are retained. The Sheet's `Total Downtime` and new `Downtime` field use acknowledgement-to-resolution; `Production Downtime`, queue and hands-on maintenance fields retain their separate meanings. Redeploy the Apps Script if its handling needs changes and sync records to update existing mirrored rows.
- **New** counts work orders created within the week. **Resolved** and **Closed** count distinct work orders that reached the corresponding lifecycle event within the week, including older jobs. Repeated events on one job count once in the weekly metric; daily bars may count that job on multiple days.
- **Repair backlog** is all work still awaiting repair at the reporting cutoff. Resolved-awaiting-verification is counted separately. Historical statuses are reconstructed from recorded activity, so later closure does not erase a previous backlog.
- **Overdue** requires an explicit due date. A date-only due date expires after the whole Malaysia calendar day. Old jobs with no due date appear in ageing, not as invented SLA breaches.
- **Downtime total** sums full measured durations for distinct work orders resolved within the week. Multiple resolutions use the last resolution in that week. Missing/invalid acknowledgement timing is excluded and disclosed. Overlapping work orders can overlap in time; the sum is not unique machine/production downtime. This is a job-duration measure rather than time clipped to the reporting week.
- Priority, due dates, equipment labels and ownership reflect the current record because this system does not version those fields. Deleted work orders are excluded. The email discloses these limits.
- AI receives aggregate statistics and named machine/location/category findings. It cannot run SQL, change work orders, select recipients, send email, or modify charts. All figures and action prompts are calculated by CMMS. AI output is escaped and labelled; schema/length/numeric-grounding checks reject malformed output but cannot guarantee every qualitative statement is accurate. Review the first reports against their scorecards.
- Charts are table-based HTML bars with numeric values: no public chart service, external image fetch, JavaScript or CDN is needed in the email. Rendering varies between mail clients; verify with the company's actual client.

## API

Management session endpoints under `/api/reports/weekly`: `GET /preview?week=YYYY-MM-DD`, `GET /history`, `GET /:id`, `POST /generate` with optional `{ "week": "YYYY-MM-DD", "regenerate": true }`, and `POST /:id/reset-delivery` with `{ "confirmedNotSent": true }`.

n8n endpoints under `/api/integrations/management-reports`: `POST /weekly` (optional `week`), `POST /weekly/:id/claim`, `POST /weekly/:id/delivery` with `{ "deliveryToken": "<claim token>", "sent": true }`. Supply `X-CMMS-Report-Token` and `X-CMMS-Plant` headers. Call delivery only after the corresponding SMTP attempt.
