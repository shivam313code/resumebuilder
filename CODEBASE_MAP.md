# Codebase Map

Navigation index for the current Flask project. Verified by inspecting imports, route decorators, template references, and browser-script entry points. Update this file when architecture or dependencies change meaningfully.

## Root layout

| Path | Purpose |
| --- | --- |
| `application.py` | Compatibility module exposing `app = create_app()` for existing WSGI imports. |
| `config.py` | Compatibility re-export of `app.config.load_config`. |
| `wsgi.py` | WSGI import target that exposes `application.app` for Gunicorn. |
| `RES_Builder.py` | Local launcher that constructs the application through `app.create_app()`. |
| `app/` | Flask application package: factory, configuration, blueprints, and file-processing services. |
| `app/config.py` | Environment-aware configuration; validates `APP_ENV`, requires production `FLASK_SECRET_KEY`, and keeps production debug disabled. |
| `app/auth.py` | SQLite user accounts, password hashing, CSRF-checked authentication, sessions, and optional Google/LinkedIn OAuth. |
| `app/routes/main.py` | Homepage, protected template gallery, and protected resume editor routes. |
| `app/routes/tools.py` | PDF-to-Word and photo-resize HTTP routes, input checks, responses, and error messaging. |
| `app/services/pdf_service.py` | Temporary-file PDF-to-DOCX conversion. |
| `app/services/image_service.py` | Image validation, resize, and output-format handling. |
| `templates/` | Jinja HTML pages rendered by Flask. |
| `static/` | Shared CSS and resume-builder JavaScript. |
| `tests/test_app.py` | Standard-library `unittest` regression tests using Flask's test client. |
| `requirements.txt` | Direct Python package dependencies. |
| `requirements-dev.txt` | Includes runtime requirements plus pytest and Ruff for development/CI. |
| `requirements-prod.txt` | Includes runtime requirements plus Gunicorn for Linux deployment. |
| `pyproject.toml` | Pytest discovery and Ruff lint configuration. |
| `README.md` | Setup instructions, feature summary, and current product limitations. |
| `ARCHITECTURE.md` | Product and production architecture recommendations. |
| `.github/copilot-instructions.md` | Persistent repository-scoped Copilot navigation and editing guidance. |
| `.github/workflows/ci.yml` | GitHub Actions workflow running Ruff and pytest on pushes and pull requests. |
| `.vscode/settings.json` | Workspace Python environment-manager preferences and search exclusions. |
| `.venv/`, `__pycache__/` | Local environment and generated Python cache; not application source. |
| `migrations/`, `.github/instructions/` | Not present at the time of inspection. |

## Entry points and HTTP routes

`app.create_app()` constructs configured Flask instances and registers the `auth`, `main`, and `tools` blueprints. `application.py` preserves the existing `application:app` import; `RES_Builder.py` launches the same app factory locally; `wsgi.py` exposes the app to Gunicorn.

| Route | Handler | Main relationship |
| --- | --- | --- |
| `GET /` | `main.index` | Renders `templates/home.html`. |
| `GET /signup`, `GET, POST /login` | `auth.signup`, `auth.login` | Renders the shared account page; creates accounts and establishes login sessions. |
| `POST /logout` | `auth.logout` | Clears the signed-in session after CSRF validation. |
| `GET /auth/<provider>`, callback | `auth.oauth_login`, `auth.oauth_callback` | Optional Google/LinkedIn OAuth; enabled only when provider credentials are configured. |
| `GET /resume-builder` | `main.resume_builder` | Requires sign-in and renders the template gallery. |
| `GET /resume-builder/<template_id>` | `main.edit_resume` | Requires sign-in and renders the selected editor, which loads `static/app.js` and `static/style.css`. |
| `GET /terms`, `GET /privacy` | `auth.terms`, `auth.privacy` | Renders initial account policy notices. |
| `GET, POST /pdf-to-word` | `tools.pdf_to_word` | Renders its template on GET; validates requests and calls `pdf_service.convert_pdf_to_docx` on POST. |
| `GET, POST /photo-resize` | `tools.photo_resize` | Renders its template on GET; validates requests and calls `image_service.resize_image` on POST. |
| Error `413` | App-factory handler | Provides route-specific upload-size messages for the PDF and image tools. |

The tool templates submit multipart forms to the existing Flask URL paths. Upload validation and HTTP response handling remain in route handlers; conversion and image manipulation live in service modules.

## Front-end modules

- `templates/home.html`: Homepage and links to the resume builder and file tools using Flask `url_for`.
- `templates/index.html`: Resume editor and live-preview structure; loads `static/app.js`.
- `static/app.js`: Resume form state, experience/education entry rendering, live preview, completeness, browser-local draft persistence, print action, and optional job-description keyword comparison.
- `templates/pdf_to_word.html`, `templates/photo_resize.html`: Upload forms and tool-specific UI.
- `static/style.css`: Shared styles, responsive layouts, tool pages, and print styling.

## Data, configuration, and dependencies

- **Data models/database:** Account names, emails, password hashes, and optional provider identities are stored in SQLite at `instance/resumebuilder.sqlite3` by default. Resume and job-description drafts remain in browser `localStorage`; the server does not persist resumes.
- **Configuration:** `app/config.py` selects development/testing/production using `APP_ENV`. Production requires `FLASK_SECRET_KEY`, disables debug, and enables secure session cookies. Google/LinkedIn OAuth are optional via provider client environment variables. `RESUMEPRO_DATABASE` overrides the SQLite file path; upload-size limit is 20 MB.
- **Direct packages:** Flask, Authlib, Requests, `pdf2docx`, and Pillow, as declared in `requirements.txt`.
- **Other imports:** Python standard-library modules for I/O, logging, temporary directories, secrets, and warnings.
- **Tests:** `tests/test_app.py` covers app-factory route registration, signup/login/logout, CSRF and input validation, protected resume routes, rendered pages, upload-size handling, PDF conversion, photo resizing, and configuration. Run with `python -m pytest`; test cases use `unittest.TestCase`.
- **CI/lint:** `.github/workflows/ci.yml` runs `python -m ruff check .` and `python -m pytest`. Development tools are declared in `requirements-dev.txt`.
- **Migrations:** No database migrations were found.

## Navigation and indexing notes

The workspace contains Python, JavaScript, HTML/Jinja, and CSS. Existing VS Code settings configure Python environment-manager preferences, but the VS Code CLI is unavailable here and no workspace extension recommendations were found; installed language servers/extensions and reliable Go to Definition/symbol indexing therefore remain unverified. If the Python extension/Pylance and VS Code's JavaScript/HTML/CSS language support are available, use document/workspace symbols, Go to Definition, and Find All References before broad text search.

No dependency-graph generator is configured. For this small project, use the imports and route/template references documented above, then verify specific relationships with targeted symbol search or searches for route names and `url_for` references. Do not infer a model, API layer, or service package that is not present.
