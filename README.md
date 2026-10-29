# ResumePro

A lightweight Flask website with a resume builder, PDF-to-Word converter, and
photo resizer. The resume builder includes a live preview, appearance controls,
PDF and DOCX exports, optional share links, and a local resume-readiness check.
Resumes are stored in the signed-in account and can be reopened across browsers.
Unimported browser drafts remain account-scoped local recovery copies.

## Run on Windows

1. Install Python 3.10 or newer if it is not already installed.
2. Open PowerShell in this project folder and run:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   python RES_Builder.py
   ```

3. Open <http://127.0.0.1:5000> in your browser.

If PowerShell blocks virtual-environment activation, run the install and app
commands using the environment's executable directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe RES_Builder.py
```

## Configuration

`APP_ENV` selects `development`, `testing`, or `production` and defaults to
`development`. Debug mode is off by default; set `FLASK_DEBUG=true` only for
local development when you need the debugger. Production always disables debug
mode and requires a stable `FLASK_SECRET_KEY` supplied by the deployment
environment or secrets manager. Do not commit production secrets.
Production startup also requires an explicit `DATABASE_URL` or legacy
`RESUMEPRO_DATABASE` setting so it cannot silently fall back to a local
development database. Use PostgreSQL for new production deployments; the
explicit legacy SQLite path remains available for backward compatibility.

For example, in PowerShell before starting a production WSGI server:

```powershell
$env:APP_ENV = "production"
$env:FLASK_SECRET_KEY = "<set-this-through-your-deployment-secret-store>"
$env:DATABASE_URL = "postgresql+psycopg://resumepro:<password>@127.0.0.1:5432/resumepro"
```

Install the production server dependency on the Linux deployment host with
`python -m pip install -r requirements-prod.txt`, then start the application
from the project root using:

```sh
gunicorn --bind 0.0.0.0:8000 wsgi:app
```

Keep the reverse proxy or managed platform responsible for HTTPS and forward
requests to Gunicorn. Do not expose Flask's development server publicly.

## Database configuration and migrations

The application uses SQLAlchemy for account, OAuth-identity, persistent resume,
and shared-resume records. PostgreSQL uses the `psycopg` driver. When `DATABASE_URL` is set, it
takes precedence over the legacy `RESUMEPRO_DATABASE` SQLite file path; plain
`postgresql://` URLs are normalized to `postgresql+psycopg://`. If neither
variable is set, development continues to use
`instance/resumebuilder.sqlite3`. Testing defaults to an isolated in-memory
SQLite database. Production still requires `FLASK_SECRET_KEY`; PostgreSQL
credentials belong only in the environment or a secret manager.

For local PostgreSQL, create an empty database and provide its URL before
running migrations and the app:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://resumepro:<password>@127.0.0.1:5432/resumepro"
python -m flask --app wsgi db upgrade
python RES_Builder.py
```

Run `flask --app wsgi db upgrade` as a controlled deployment/release step
before starting Gunicorn. This applies the account/share foundation and the
persistent-resume schema. Gunicorn workers do not run migrations at startup.
Generate revisions with `flask --app wsgi db migrate -m "short migration summary"`
and review the generated migration before committing it.

SQLite remains supported through SQLAlchemy. Its existing database file is not
replaced or copied; SQLite schema creation at app startup creates missing
tables, including the new resumes table, but does not migrate existing data.
Do not run the initial migration against an existing SQLite account database:
it already has the account tables and is not stamped with the Alembic revision.
PostgreSQL uses migrations and does not create tables automatically.
Application startup never copies data.

To move account and share data, first make and verify a SQLite backup, create a
fresh PostgreSQL database, and run its migrations. Then set `DATABASE_URL` to
that PostgreSQL destination and run the standalone importer against the backup:

```powershell
New-Item -ItemType Directory -Path .\backups -ErrorAction SilentlyContinue
$backup = Join-Path .\backups ("resumebuilder-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".sqlite3")
if (Test-Path $backup) { throw "Choose a new backup filename; existing files are never overwritten." }
sqlite3 .\instance\resumebuilder.sqlite3 ".backup '$backup'"
sqlite3 $backup "PRAGMA integrity_check;"
python scripts/migrate_sqlite_to_postgres.py --source $backup
```

Proceed only when the backup integrity check prints `ok`.
The importer opens the source read-only, preserves user and OAuth IDs, password
hashes, hashed share-token keys, and snapshot JSON, and refuses a populated
destination. It reports counts and never prints credentials or record contents.
Keep the source and backup unchanged until destination counts and application
behavior have been verified. Restore the backup before retrying a failed import.

PostgreSQL integration tests use an isolated temporary schema and require a test
database URL with schema-creation privileges:

```powershell
$env:RESUMEPRO_TEST_DATABASE_URL = "postgresql+psycopg://resumepro:<password>@127.0.0.1:5432/resumepro_test"
python -m pytest tests/test_postgres.py
```

When that variable is unset, PostgreSQL integration tests are reported as
skipped; SQLite tests are not a substitute for PostgreSQL verification.

## Tests and lint

Install development tools and run the CI checks locally:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest
python -m ruff check .
node --test tests/test_resume_storage.js
```

GitHub Actions runs the lint, Python tests, and resume-storage tests on pushes
and pull requests.

Uploads are limited to 20 MB. PDF conversion uses `pdf2docx`, and photo resizing
uses Pillow. Supported photo formats are JPG, PNG, and WebP; the selected
reduction percentage is applied to both image dimensions.

The homepage is in `templates/home.html`. Edit the templates in `templates/`
and `static/style.css` to customize the site.

## Resume template gallery

The resume builder includes six free, editable layouts: Modern Pro, Timeless,
Plain, Blogger, Pacific, and General ATS. Each design has a visible gallery preview
that grows by 25% when hovered. Choose a design to open the live resume editor.

Work experience and education fields provide searchable browser suggestions
for common roles, employers, locations, degrees, and schools. The suggestion
lists are examples rather than exhaustive catalogs; users can type any custom
value or select the custom-entry option. Dates can be typed in DD-MM-YY format
or selected from a calendar; selected dates are shown on the resume in
DD-MM-YY format. Existing free-form dates remain visible until changed.

## Resume editor and analysis

Choose color, layout, font, and visible sections in the editor. Add a profile
photo, highlights, projects, and certifications to the Modern Pro resume. PDF export uses
the browser print dialog; DOCX export creates an editable Word document. Share
links are opt-in, read-only snapshots stored in the account database and can
be revoked from the editor. The latest link is saved in browser storage so it
can be managed after a reload; creating an updated link disables its previous
version. Anyone with an active link can view its snapshot.

The local resume-readiness score is calculated from six content checks; it is
not an employer ATS score or a prediction of ranking. Optional job matching
compares selected words and phrases with resume fields. Writing suggestions
reformat or lightly polish user-provided text; cover-letter drafts use only
resume content and should be reviewed before use. This is not a generative AI
service. Add suggested terms only when they accurately describe your experience.

## Dashboard and AI Copilot

After signing in, use `/dashboard` to manage resumes saved to your account.
Resume content is stored in the configured SQL database and loads across
browsers for the same account. The editor saves explicitly when a new resume is
created, then saves later edits automatically; the version field rejects stale
concurrent updates. DOCX, print-to-PDF, and share snapshots continue to use the
editor's current validated content.

Pre-existing drafts in account-scoped browser storage are never silently
assigned to the server. Open the editor and use **Import browser draft** to
choose one explicitly. Browser-global legacy drafts have no ownership metadata;
the editor requires an additional confirmation before importing, so import one
only when you know it belongs to the signed-in account. Keep a backup of local
drafts before clearing browser data. The dashboard and Copilot may still use the
current browser draft for local analysis; job applications and Copilot data do
not sync between devices. Suggestions are generated
in the browser from text you provide, do not call an AI service, and must be
reviewed before applying. Cover-letter drafts and interview practice notes remain
in browser storage as well.

## Job Tracker and Settings

Signed-in users can open `/job-tracker` to add, edit, search, filter, and remove
job applications, update application status, and review dated next steps in the
calendar. Application records are stored in browser local storage and scoped to
the signed-in account on that device; they are not synchronized to the server.
The tracker starts empty rather than displaying example applications.

The `/settings` page updates the account name and password, and saves optional
profile details, appearance preferences, reminders, and visibility preferences
in the browser. The sign-in email cannot be changed there. Password changes are
validated against the current account password (OAuth-only accounts may set
their first password). Profile visibility is only a local preference; the app
does not publish public recruiter profiles. Paid billing, email/push
notifications, external job-board integrations, and language translations are
not configured. This account's local profile, preferences, resume draft, and
job applications can be exported or cleared from Settings. Unassigned legacy
drafts are excluded unless explicitly imported.

## Accounts and sign-in

Email/password registration and login are available at `/signup` and `/login`.
New accounts are signed in immediately. Homepage account links open the
dashboard; choosing a template remains available from the dashboard or at
`/resume-builder`.
Account records are stored in `instance/resumebuilder.sqlite3` (override the
path with `RESUMEPRO_DATABASE`). Passwords are stored as Werkzeug password
hashes. Resume drafts and optional job descriptions remain in browser local
storage and are not synced between devices. Drafts are separated by the
signed-in account on that browser. Use **Import browser draft** in the editor
to explicitly save a browser draft to the account database. Older browser-global
drafts have no account ownership metadata and are never assigned automatically;
the editor requires confirmation before importing one. Resume records are
available across browsers after signing into the same account. Share links
remain independent read-only snapshots and can be revoked in the editor.
Clearing local profile data does not delete account resumes or active share
links.

Google and LinkedIn sign-in are optional. Register OAuth applications with each
provider and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`LINKEDIN_CLIENT_ID`, and `LINKEDIN_CLIENT_SECRET` in the deployment
environment. Register these callback URLs with the provider:

- `https://your-domain/auth/google/callback`
- `https://your-domain/auth/linkedin/callback`

For local development, use the matching `http://127.0.0.1:5000/...` callback
URLs. Without provider credentials, the buttons explain that social sign-in is
not configured. Do not put OAuth secrets in source control.

Password reset and email verification are not implemented yet. Add those
account-recovery and verification flows, and configure rate limiting, before
opening account registration to the public.

The Terms of Service and Privacy Policy pages are initial product notices, not
legal advice; have them reviewed before public launch.
