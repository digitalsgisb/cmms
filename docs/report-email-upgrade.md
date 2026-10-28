# CMMS-managed recipients and an inline company logo

The recipient list now lives in **CMMS → Reports → Weekly management email → Email recipients**. Enter To and optional CC addresses, separated by commas, and click **Save recipients**. Up to 20 recipients are supported. Settings are separate for Port Klang, Sendayan and Both plants: select the same view used by the n8n workflow before saving its recipients. Only executive, admin and developer users can change them.

Both manual and scheduled deliveries capture the saved recipient list when delivery is reserved. Changes apply to later deliveries; a report already sending keeps its original recipients. The To and CC list used is shown with the saved report. Recipients are never included in AI prompts. Sender and SMTP credentials remain in n8n.

New subjects use a concise date range, for example:

```text
CMMS Maintenance Update | Port Klang | 26 Oct 2026 – 28 Oct 2026
CMMS Weekly Maintenance Report | Both Plants | 19 Oct 2026 – 25 Oct 2026
```

The email includes the monochrome CMMS logo as a PNG MIME attachment referenced by `cid:cmmsLogo`. The logo is read from packaged CMMS assets, not downloaded from the public app. Outlook can block external images (as shown by its blocked-content banner); inline attachments remove that external image dependency. Recipient mail-client policies can still affect rendering. Browser previews and HTML downloads continue using the app's logo URL. Existing sent emails are unchanged; generate a new snapshot to get the new subject.

## Upgrade the existing Linux installation

1. Update CMMS:

   ```bash
   cd /srv/apps/cmms
   git pull --ff-only origin main
   docker compose up -d --build --no-deps cmms
   ```

2. Open CMMS Reports, select the desired plant view and save To/CC recipients. Repeat for other plant views used by scheduled workflows.
3. Export your existing n8n workflows as a backup. Replace/update both workflows using these files:
   - `docs/n8n-manual-management-report.json`
   - `docs/n8n-weekly-management-report.json`

   If importing as new workflows, deactivate the old ones first: the manual webhook path must have only one active owner, and the weekly schedule should run once. Do not leave old workflows running with a fixed recipient list.
4. Reapply your existing CMMS URL, sender address, plant selection and credentials. For this installation use `http://172.19.3.62:3300` as the CMMS URL. Keep the manual plant expression. Use the existing reporting credential on HTTP Request nodes, the separate webhook credential on the manual Webhook node, and existing SMTP credential on the Send Email node. There is no `toEmail` setting in Report configuration anymore.
5. Verify the new **Prepare email with inline logo** node sits between **Delivery claimed** (true branch) and **Send management email**. Send Email reads To, CC, subject and HTML from its input and uses `cmmsLogo` in **Attachments / Attachments (Inline)**. Its existing error path still records failed delivery.
6. Save and activate/publish the updated workflows. The working HTTPS webhook URL remains:

   ```dotenv
   CMMS_REPORT_WEBHOOK_URL=https://n8n.sugidigital.org/webhook/cmms-management-send-now
   ```

7. Generate a new week-to-date report, review the subject and recipients, and click **Send email now**. CMMS updates the status when n8n records the SMTP result. Test with your own email first.

No n8n, Ollama, database or SMTP reinstall is needed. If no To recipients are saved for the selected scope, CMMS refuses delivery before reserving it.

References: [n8n Send Email implementation, including inline attachments](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/EmailSend/v2/send.operation.ts).
