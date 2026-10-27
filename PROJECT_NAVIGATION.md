# Project Navigation

## Start here

- Flask app factory: `app/__init__.py`
- Page routes: `app/routes/main.py`
- Tool routes and upload validation: `app/routes/tools.py`
- PDF conversion and image resizing: `app/services/pdf_service.py` and `app/services/image_service.py`
- Environment-specific configuration: `app/config.py` (legacy import re-export: `config.py`)
- Original local launcher: `1.py`
- Production WSGI target: `wsgi.py` (`gunicorn --bind 0.0.0.0:8000 wsgi:app`); `application.py` remains a compatibility import.
- Homepage and resume editor: `templates/home.html` and `templates/index.html`
- Resume editor behavior and preview: `static/app.js`
- Shared/responsive/print styles: `static/style.css`
- PDF and photo tool pages: `templates/pdf_to_word.html` and `templates/photo_resize.html`
- Runtime and deployment dependencies: `requirements.txt` and `requirements-prod.txt`; setup: `README.md`
- Development dependencies and tool configuration: `requirements-dev.txt` and `pyproject.toml`
- Regression tests: `tests/test_app.py` (run with `.\.venv\Scripts\python.exe -m pytest`)
- CI: `.github/workflows/ci.yml` (Ruff and pytest)
- Architecture recommendations: `ARCHITECTURE.md`

There are currently no separate API or data-model/migration directories; tool processing is separated into services, and resume drafts are stored in browser `localStorage`.

## Efficient navigation

1. Consult `CODEBASE_MAP.md` to identify the likely file and its known relationships.
2. Search for the requested route, function, selector, or template endpoint before opening other files.
3. Use VS Code document/workspace symbols, Go to Definition, and Find All References when the relevant language server is available; otherwise use narrow text searches.
4. Follow imports and template/route references only when required. There is no configured dependency-graph generator.

## Refreshing the map

After a meaningful change to routes, module boundaries, dependencies, persistence, tests, or configuration, update the relevant sections of `CODEBASE_MAP.md` from the changed code. Do not regenerate the whole map for routine UI or localized fixes.
