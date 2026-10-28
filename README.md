# ResumePro

A lightweight Flask website with a resume builder, PDF-to-Word converter, and
photo resizer. The resume builder includes a live preview, appearance controls,
PDF and DOCX exports, optional share links, and a local resume-readiness check.
Resume drafts are stored in browser local storage by default.

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

For example, in PowerShell before starting a production WSGI server:

```powershell
$env:APP_ENV = "production"
$env:FLASK_SECRET_KEY = "<set-this-through-your-deployment-secret-store>"
```

Install the production server dependency on the Linux deployment host with
`python -m pip install -r requirements-prod.txt`, then start the application
from the project root using:

```sh
gunicorn --bind 0.0.0.0:8000 wsgi:app
```

Keep the reverse proxy or managed platform responsible for HTTPS and forward
requests to Gunicorn. Do not expose Flask's development server publicly.

## Tests and lint

Install development tools and run the CI checks locally:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest
python -m ruff check .
```

GitHub Actions runs the same lint and test commands on pushes and pull requests.

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

## Accounts and sign-in

Email/password registration and login are available at `/signup` and `/login`.
New accounts are signed in immediately and sent to the resume template gallery.
Account records are stored in `instance/resumebuilder.sqlite3` (override the
path with `RESUMEPRO_DATABASE`). Passwords are stored as Werkzeug password
hashes. Resume drafts and optional job descriptions remain in browser local
storage and are not synced between devices. Resume data is stored on the server
only when you explicitly create a share link; disabling the link deletes that
shared snapshot. Clearing browser storage also clears the locally saved link
used to manage sharing.

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
