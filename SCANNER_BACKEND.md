# Scanner backend connection

## Running on this Windows computer

### Control from DMS

On Windows, authenticated scanner discovery automatically starts the bundled local bridge if it is stopped. No second terminal is required after DMS starts. Dashboard, Scan Documents, and Settings > Scanner provide Connect/Reconnect actions. Returning to the browser refreshes discovery and jobs. The bridge launch is restricted to the fixed bundled script and loopback port 8765; remote bridge configurations are not auto-launched.

Administrators also have **Repair Windows scanner connection**, with confirmation. It restarts only the Windows Image Acquisition service (`stisvc`) and then rediscovers devices. It refuses while a DMS scan or connection check is running. The DMS account role is checked on the server, and successful recovery/reconnection is audited. This requires the local Windows process to have service start/stop permission: being a DMS Administrator does not grant Windows administrator rights. If Windows denies repair, an administrator of this computer must configure service-control permission or run the local bridge with appropriate rights. DMS never escalates privileges automatically, kills unrelated applications, or remotely clears physical jams. Loading sheets, closing covers, USB cables, and scanner power remain physical operations.

The included real WIA bridge is `scripts/scanner-bridge.mjs`, with a PowerShell STA worker in `scripts/scanner-wia.ps1`. Run `npm run scanner:bridge`, then `npm run dev` in another terminal. Alternatively run `powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1` to start both hidden with logs in `.data/run-logs`.

The bridge binds only to 127.0.0.1:8765, generates a private key under `.data/scanner-bridge/api-key`, and configures `.env.local` without changing the authentication secret. Restart Next.js after the initial bridge configuration. Keep the bridge running while scanning.

The HP ScanJet Flow 5000 s5 USB driver has been discovered successfully. The initial implementation supports single-sided and duplex feeder scans at the driver's reported resolutions, regular image-only PDF (multiple pages), JPEG, and PNG (one page). Duplex requires PDF format and the automatic feeder; the driver capability controls whether it is enabled. One duplex sheet produces two PDF pages. Automatic paper detection, automatic image enhancement, and searchable PDF/OCR are not enabled. The interface uses the reported capabilities. PDF feeder scans stop when the feeder empties or after 50 sheets (up to 100 sides in duplex mode). Cancellation stops the worker; a page already inside the scanner may finish feeding. A scan takes at most five minutes. The HP driver may return bitmap data even when JPEG is requested; the worker converts to the actual output encoding before assembling PDFs. Bridge job history is temporary; completed files imported into DMS and DMS job records persist in SQLite. Working image files remain under `.data/scanner-bridge`; treat that private directory as sensitive.

Both scanner screens provide Private/Public destination, category, and maximum-sheet controls (one sheet by default; up to 50). Available resolutions come from the driver, including supported lower resolutions. Feeder loaded/empty/jam/cover status is shown after discovery. Category and visibility are persisted with the scanned document and audit entry. JPEG and PNG always acquire one side; choose PDF for multi-page or duplex jobs. Cancellation is available on both screens. A page already in the mechanism may finish physically even after cancellation; cancelled jobs are not imported as documents.

Save settings on the dashboard stores a browser-local profile used by both scan screens. Settings > Scanner provides browser-local mode/resolution defaults when there is no overriding profile. The profile is not shared between computers. Invalid saved options are normalized against the connected device.

Diagnostics: `node scripts/check-scanner-connection.mjs` checks authenticated discovery, rejection of unsupported requests, routes, and the existing duplex-test download without starting a scan. `powershell -ExecutionPolicy Bypass -File scripts/check-scanner-driver.ps1` validates several driver settings without acquiring images. A busy driver can block both checks; close HP/Windows scanning apps or power-cycle the scanner, then refresh in DMS. `npm run test:document-access` verifies document access, uploads, categories, audit persistence, and presence using temporary records which it cleans afterward.

For the first physical test load one non-sensitive sheet, choose Color, A4, 300 dpi, PDF, and Private, then press Start scan. Check completion, preview, download, and the Scan saved audit entry. Real OCR text search is not available until an OCR engine is integrated.

The DMS backend only enables real scanner connections. The `bridge` provider connects the DMS server to a native scanner service using TWAIN/WIA on Windows or SANE on Linux. Simulated scanner discovery is disabled, including when an old environment file specifies demo mode.

Browsers cannot reliably control document scanners directly. The native bridge should run on the computer connected to the scanner. Copy `.env.example` to `.env.local`, set `SCANNER_PROVIDER=bridge`, configure the bridge URL and API key, then restart Next.js.

## DMS endpoints

All endpoints require a signed-in DMS session.

Scan jobs persist in SQLite. Scan settings accept `visibility: "private" | "public"` (default Private). Completed files are saved in the permission-controlled document library before completion is returned. See `DOCUMENT_STORAGE.md` for the storage model and access checks.

- `GET /api/scanners` discovers connected scanners and their capabilities.
- `GET /api/scanners/:scannerId` returns one scanner.
- `POST /api/scan-jobs` validates settings and starts a scan.
- `GET /api/scan-jobs` lists the signed-in user's recent jobs.
- `GET /api/scan-jobs/:jobId` returns current progress and the result.
- `DELETE /api/scan-jobs/:jobId` cancels an active job.
- `GET /api/scan-jobs/:jobId/file` securely proxies the completed file.

## Native bridge contract

The bridge must accept `Authorization: Bearer <SCANNER_BRIDGE_API_KEY>` and expose:

### `GET /v1/scanners`

Return `{ "scanners": ScannerDevice[] }`. Each device must include its supported sources, color modes, paper sizes, resolutions, formats, duplex support, feeder support, and feeder capacity. Device status is one of `ready`, `busy`, `offline`, or `error`.

### `POST /v1/scan-jobs`

Accept `{ "scannerId": string, "settings": ScanSettings }` and return:

```json
{
  "job": {
    "jobId": "native-job-id",
    "status": "queued",
    "progress": 0
  }
}
```

### `GET /v1/scan-jobs/:jobId`

Return current status and progress. When complete, also return `pageCount`, `fileName`, `mimeType`, `sizeBytes`, and `fileUrl`. The file URL must use the same origin as `SCANNER_BRIDGE_URL`; DMS rejects other origins.

### `DELETE /v1/scan-jobs/:jobId`

Cancel scanning and return `{ "ok": true }`.

The DMS server enforces session authentication, ownership of scan jobs, capability validation, request timeouts, scanner bridge authentication, same-origin file downloads, safe filenames, and audit logging.
