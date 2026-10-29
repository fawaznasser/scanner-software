# DMS accounts

Four local application accounts have individual random passwords. Aline and Rabab Majzoub are Editors; Dr Chadi Abdalla and Mahdi Maatouk are Administrators. The email addresses are login identifiers, not newly created email mailboxes.

Initial credentials are in `credentials.local.txt`, excluded from Git. Distribute each password only to its owner and delete that plaintext handoff file after distribution. The application uses salted scrypt hashes from `.data/accounts.json`; it never reads the plaintext handoff file. Roles persist across restarts. Back up `.data` securely and use a persistent private volume when deploying. Windows access inherits the project directory permissions; restrict that directory to the service account and administrators.

Run `npm run users:provision` once on a fresh installation before starting the server. It refuses to overwrite existing accounts. A random signing key is provisioned in `.data/session-secret`, or set a random `AUTH_SECRET` of at least 32 characters. Old demo sessions and the shared demo password are invalid. Password changes invalidate previous sessions.

The authenticated `POST /api/auth/password` accepts `currentPassword` and `newPassword` (12–128 characters). Administrators can also change their password from Settings > Security. Usernames and credentials are no longer prefilled or published on the sign-in page.

Scanner simulation and the active sample document library are disabled. Scanning requires a running native bridge and scanner drivers; see `SCANNER_BACKEND.md`. The retained sample PDF assets are development fixtures, not live documents. The application still uses local storage/in-memory state in some document and settings features; these account changes do not turn those features into a database-backed document platform.
