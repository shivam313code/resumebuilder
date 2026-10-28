# Resume Builder: Product and Production Architecture

This document uses Resume Now as a product-flow reference, not as a source to copy its branding, wording, or visual assets. The reference page could not be accessed during preparation, so this guide is based on common resume-builder patterns and the current project structure.

## 1. Current project baseline

The project is a small Flask application with:

- A home page and resume editor rendered with Jinja templates.
- A live resume preview and browser-based print-to-PDF export.
- Email/password accounts backed by SQLite, with optional Google and LinkedIn OAuth.
- Browser-local draft storage; resumes are not synced between devices.
- PDF-to-Word conversion and photo resizing tools.
- No server-side resume database, AI generation, or billing.

`RES_Builder.py` launches the app factory used by `application.py`; `wsgi.py`
exposes the same app for a production WSGI server. Templates remain under
`templates/` and browser assets under `static/`. Keep these features working
while introducing the architecture below incrementally.

## 2. Recommended product experience

1. **Landing page:** Explain the value clearly and provide a prominent resume-building action.
2. **Template selection:** Offer a small set of readable, accessible templates. Avoid overly complex layouts that export poorly or are difficult for applicant systems to parse.
3. **Guided editor:** Collect personal details, summary, experience, education, and skills in focused sections. Allow users to add, edit, reorder, and remove entries.
4. **Live preview:** Update the resume as the user edits. Show honest completeness checks and useful guidance without claiming to predict hiring outcomes.
5. **Save and return:** Accounts currently protect the resume-builder entry points, while drafts remain browser-local. Add cross-device sync only when product requirements justify collecting and storing resume data on the server.
6. **Export:** Retain browser print-to-PDF while validating output across browsers. Add server-side PDF or DOCX export only when users need it and the output can be tested reliably.
7. **Job matching:** Present job-description terms as optional review prompts. Do not promise ATS scores, rankings, or interviews.
8. **Billing:** Introduce paid plans only after the core workflow, account model, support, cancellation, and refund behavior are defined.

## 3. Suggested folder structure

Continue with Flask, Jinja, and the current JavaScript/CSS for the next stage. Split the single application module into focused components as the project grows:

```text
resumebuilder/
├── app/
│   ├── __init__.py              # App factory and blueprint registration
│   ├── config.py                # Development, test, and production settings
│   ├── extensions.py            # Database, migrations, and login extensions
│   ├── models/                  # User, resume, and related data models
│   ├── routes/
│   │   ├── main.py              # Home and shared pages
│   │   ├── resumes.py           # Resume editor, save, and export
│   │   └── tools.py             # PDF conversion and image resizing
│   ├── services/                # Resume and file-processing business logic
│   ├── templates/
│   └── static/
├── migrations/                  # Database schema migrations
├── tests/
│   ├── unit/
│   └── integration/
├── instance/                    # Local-only configuration; never commit secrets
├── requirements.txt
├── Dockerfile
├── compose.yaml                 # Optional local app/database development setup
├── .env.example                 # Variable names and safe placeholders only
└── README.md
```

Do not move everything in one large rewrite. First add tests for current routes, then introduce an app factory and blueprints while preserving existing URLs and behavior.

## 4. Recommended production technology

| Area | Recommended starting choice | When to add or change |
| --- | --- | --- |
| Web application | Flask modular monolith, Jinja, current JavaScript/CSS | Keep until there is a concrete reason to introduce a separate frontend |
| Database | PostgreSQL with SQLAlchemy and Flask-Migrate/Alembic | When accounts, server-side resumes, or cross-device access are required |
| Authentication | Flask-Login with secure session settings; Flask-WTF/CSRF for forms | Before storing private resumes against user accounts |
| Web serving | Gunicorn behind a managed HTTPS service or reverse proxy | For production; never expose Flask's development server |
| File storage | Temporary local storage for processing; private object storage such as S3 if persistent files become necessary | Use short retention and access controls for uploaded documents |
| Background jobs | None initially; Celery and Redis only when work is too slow for requests | Add for expensive exports or queued processing |
| Tests and lint | pytest and Ruff | Run in CI on every change |
| CI/CD | GitHub Actions for tests, lint, and deployment | Add environment approvals for production |
| Monitoring | Hosting-provider logs, health checks, error reporting, and alerts | Configure before public production launch |
| Payments | Stripe, only after product and account requirements are settled | Do not collect payment details directly |

### Hosting options

- **Simpler first deployment:** A managed Python application host with HTTPS, environment-based secrets, managed PostgreSQL, and automated backups.
- **AWS deployment:** ECS Fargate for the Flask service, RDS PostgreSQL, S3 for private uploads if needed, CloudFront for static assets, Secrets Manager for secrets, and CloudWatch for logs and alarms.

Choose one hosting approach initially rather than building cloud infrastructure before the product needs it.

## 5. Current account data and future resume storage

Start with the smallest useful model:

- **User (current):** SQLite stores a name, unique email, password hash (nullable for provider-only users), and creation timestamp. Optional OAuth identities store provider and provider subject. Passwords are hashed with Werkzeug; account forms use CSRF tokens.
- **Resume (future):** Owner ID, title, validated structured resume content, selected template, and timestamps.
- **ResumeVersion (optional):** Resume ID, content snapshot, and creation time if version history is a product requirement.

Every resume read, update, delete, and export must verify ownership on the server. Define retention, deletion, and user export behavior before storing resume content. Do not put resume text, uploaded document contents, credentials, or session tokens in application logs.

## 6. Security, privacy, and reliability requirements

- Load a stable production secret from the hosting environment or secrets manager. Never rely on a newly generated secret for production sessions.
- Disable debug mode in production and run behind a production WSGI server.
- Use HTTPS, secure/HTTP-only/SameSite session cookies, CSRF protection for state-changing form submissions, and appropriate security headers.
- Validate form values and uploaded file size, type, and content. Treat file extensions and client-provided MIME types as untrusted.
- Keep temporary uploads outside public static directories and delete them after processing. Use private storage and limited retention if files must persist.
- Add rate limits to public upload and conversion endpoints before exposing them broadly.
- Back up the database and test recovery. Use migrations for schema changes.
- Make errors visible through appropriate user messages and server-side logs, without returning stack traces or sensitive data.
- Add health checks and monitor application errors, latency, and processing failures.

## 7. Incremental implementation roadmap

### Phase 1: Production foundations

- Add pytest coverage for the current home, resume-builder, conversion, and resize routes.
- Add development, test, and production configuration.
- Configure the production secret from the environment.
- Ensure debug mode is disabled outside local development.
- Add Ruff and a CI workflow for tests and lint.

**Implemented:** Environment-specific configuration is in `config.py`; production requires
`FLASK_SECRET_KEY`, disables debug, and enables secure session cookies. `wsgi.py` exposes the
application for Gunicorn, while `1.py` remains available for local startup. Pytest, Ruff, and a
GitHub Actions workflow are configured. Gunicorn is isolated in `requirements-prod.txt` because
the development machine is Windows.

### Phase 2: Safe Flask restructuring

- Create an application factory.
- Move routes into focused blueprints.
- Move conversion and image-processing logic into service modules.
- Preserve existing route URLs and verify templates and static assets still load.

**Implemented:** `app.create_app()` registers `main` and `tools` blueprints. PDF conversion and
image resizing are implemented in separate services. Existing public URL paths, the `1.py` local
launcher, and `application:app` compatibility import are preserved. Regression tests cover
factory registration, existing pages, and upload-size handling.

### Phase 3: Improve the builder

- Add guided editing, template selection, accessible keyboard behavior, and clear autosave status.
- Test persistence and reset behavior.
- Validate print-to-PDF output in supported browsers and paper sizes.
- Keep ATS and job-match claims transparent and modest.

### Phase 4: Persistent resumes (only if required)

- Add account recovery and email-verification policy before public launch.
- Move account storage to PostgreSQL and add schema migrations when deployment needs require it.
- Move drafts to server storage only with explicit consent and enforce per-user authorization for every resume operation.
- Define consent, retention, export, and deletion behavior.
- Add integration tests for account recovery, unauthorized access, and ownership boundaries.

### Phase 5: Production deployment and operations

- Deploy the app behind HTTPS using a production WSGI server.
- Configure secrets, database backups, health checks, logs, and alerts.
- Add a staging environment and deployment approvals.
- Test rollback and database recovery procedures.

### Phase 6: Optional monetization

- Define free and paid feature boundaries, pricing, cancellation, refunds, and support.
- Integrate a hosted payment provider such as Stripe.
- Keep payment card data out of the application and verify payment webhooks.

## 8. Immediate project-specific priorities

1. **Done:** Replace the direct debug-enabled server path with environment-aware configuration and a production WSGI entry point.
2. **Done:** Require a stable `FLASK_SECRET_KEY` in production; keep any development fallback limited to local use.
3. **Done:** Add tests for existing routes and file-processing failure cases before restructuring.
4. **Done:** Refactor route registration into an app factory and blueprints, and move file processing into services without changing public route paths.
5. **Done:** Implement local email/password accounts, optional provider OAuth, and authenticated resume-builder access; continue keeping resume drafts in browser storage until sync is deliberately in scope.