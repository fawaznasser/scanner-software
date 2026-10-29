# Private and public document storage

The DMS uses SQLite at `.data/dms.sqlite` with two logical spaces, not separate physical databases per user. Each document has an authenticated owner and a `private` or `public` access level. Files are stored under `.data/documents`, outside Next.js public assets. Back up the entire `.data` directory securely; use a persistent disk for this single-server deployment. Node.js 22.13 or newer with the built-in `node:sqlite` module is required.

| Action | Owner | Other editor | Administrator |
| --- | --- | --- | --- |
| Read/download private document | Yes | No | Yes |
| Read/download public document | Yes | Yes | Yes |
| Change category or move between spaces | Yes | No | Yes |

Public means all authenticated DMS users, not anonymous internet visitors. Private is the default for both scans and uploads. Ownership is taken from the signed session; callers cannot choose another owner. Permission checks run before listing, searching, previewing, downloading, and modifying documents. Inaccessible file IDs return 404. Moving a public document to Private revokes other editors' access on their next request; already downloaded copies cannot be revoked.

Both scanner screens send the chosen destination with the scan job. Jobs are stored in SQLite. When the scanner bridge reports completion, the backend saves the bytes and document metadata locally before returning the completed result. The library refreshes every ten seconds and on focus. Scan jobs must be polled to import their results; an unattended background worker is not included.

`POST /api/documents` accepts multipart `file` and `visibility` fields for PDF, JPEG, and PNG uploads up to 25 MB. Scan imports allow up to 100 MB. `GET /api/documents` returns only accessible metadata; `/api/documents/:id/file` enforces access for downloads and previews. `PATCH /api/documents/:id` changes visibility/category for owners and administrators. Search and totals use the same permission-filtered document list. Text extraction is not implemented; documents are marked Processing until an OCR service is integrated.

Run `node scripts/check-document-access.mjs` against the running development server to check all four account roles using the private credentials handoff file. The check creates two named temporary documents and removes those exact records/files afterward. It never prints passwords.
