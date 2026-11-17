# GWS print agent

Prints labels sent from the Pallet Label tool's **Print** button on the stores
printer, with no print box.

How it works: the page adds the PDF to the `print_job` table
(`/api/print-jobs`). This agent, running on the stores PC, asks
`/api/print-jobs/next` every 3 seconds, prints anything waiting with
SumatraPDF, then reports back to `/api/print-jobs/done` so the page shows
"Printed ✓".

## Setup

1. Run `migration/22_print_jobs.sql`.
2. Set `PRINT_AGENT_KEY` (any long random string) in the Vercel project env
   vars and redeploy.
3. On the stores PC, from the repo folder:

   ```
   powershell -ExecutionPolicy Bypass -File print-agent\install.ps1 -Key <PRINT_AGENT_KEY>
   ```

   Use `-Printer "<name>"` for a different printer. It installs into
   `%LOCALAPPDATA%\GWS Print Agent` and adds a shortcut to the Startup folder,
   so it starts whenever this user logs in.

## If labels are not printing

- Check `%LOCALAPPDATA%\GWS Print Agent\print-agent.log`.
- The PC must be on and logged in; queued labels print once it is.
- To remove it: delete `GWS Print Agent.lnk` from the Startup folder
  (`shell:startup`) and the `%LOCALAPPDATA%\GWS Print Agent` folder.
