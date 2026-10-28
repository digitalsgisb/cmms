# Send a management summary before the week ends

In **Reports → Weekly management email**, choose **This week so far**, click **Generate & save report**, review the email, then click **Send email now**. The server prepares the AI summary using Monday-to-snapshot data in Malaysia time. Previous-week comparisons use the same elapsed period seven days earlier. Machine/location analysis, charts and the monochrome CMMS logo template are included.

You can also select a completed week and send its saved draft. Sent snapshots cannot be sent again. Generate a new week-to-date snapshot when you deliberately need a later update. Sending an interim report does not consume or change Monday's scheduled report.

## One-time setup on your existing Linux AI PC

Keep the existing weekly workflow. Import `docs/n8n-manual-management-report.json` as a **second** workflow in your existing n8n.

1. In **Report configuration**, set `cmmsUrl` to `http://172.19.3.62:3300`, your sender address and your boss's recipient address. Plant is supplied by CMMS; leave that expression in place.
2. Select the existing **CMMS reporting token** Header Auth credential on all HTTP Request nodes. This uses header `X-CMMS-Report-Token` with the existing `CMMS_REPORT_TOKEN`. Select your existing **CMMS SMTP** credential on the email node.
3. Generate a separate manual-webhook secret:

   ```bash
   openssl rand -hex 32
   ```

4. Create a Header Auth credential named **CMMS manual webhook token**: header **Name** `X-CMMS-Webhook-Token`, **Value** the secret from step 3. Select it in **Send now webhook**.
5. Save and activate/publish this workflow. Copy the Webhook node's **Production URL** (not its test URL). It must be reachable from the CMMS container. With native n8n on port 5678 this is typically `http://172.19.3.62:5678/webhook/cmms-management-send-now`; use the actual displayed URL and reachable host.
6. Edit the existing CMMS environment file:

   ```bash
   cd /srv/apps/cmms
   nano .env
   ```

   Add these values, replacing the example URL and secret:

   ```dotenv
   CMMS_REPORT_WEBHOOK_URL=http://172.19.3.62:5678/webhook/cmms-management-send-now
   CMMS_REPORT_WEBHOOK_TOKEN=PASTE_THE_SECRET_FROM_STEP_3
   ```

   Keep the existing `CMMS_REPORT_TOKEN`, `CMMS_REPORT_PLANTS` and Ollama settings. Both selected plants must be allowed in `CMMS_REPORT_PLANTS` to send the combined view.

7. After pulling this change, rebuild CMMS:

   ```bash
   cd /srv/apps/cmms
   git pull --ff-only origin main
   docker compose up -d --build --no-deps cmms
   ```

The button is available to executive, admin and developer users with the current plant access. Recipients and SMTP credentials stay in n8n; no SMTP credentials are placed in the browser.

## Delivery status

CMMS reserves the report before triggering n8n. The workflow accepts each delivery token once, sends the saved HTML, then records success/failure. The page polls for the final result. Webhook acceptance alone is not proof of email delivery. A repeated button press or replayed webhook cannot send the same reserved snapshot twice.

If delivery stays **sending** or becomes **failed**, check the n8n execution and sent mailbox. Only use **Allow another delivery attempt** after confirming it was not sent. Automatic email retries remain disabled because an SMTP response can be lost after acceptance. After recovery, click **Send email now** on that saved report again.

Webhook behavior reference: [n8n Webhook documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/).
