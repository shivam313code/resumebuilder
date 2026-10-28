import os
import secrets
from datetime import timedelta
from pathlib import Path


MAX_CONTENT_LENGTH = 20 * 1024 * 1024
TEST_SECRET_KEY = "test-only-secret-key"


def _parse_bool(value, *, name):
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean value.")


def load_config(environment=None):
    environment = (environment or os.environ.get("APP_ENV", "development")).strip().lower()
    if environment not in {"development", "testing", "production"}:
        raise ValueError(
            "APP_ENV must be one of: development, testing, or production."
        )

    production = environment == "production"
    testing = environment == "testing"
    secret_key = os.environ.get("FLASK_SECRET_KEY")

    if production and (not secret_key or not secret_key.strip()):
        raise RuntimeError("FLASK_SECRET_KEY must be set when APP_ENV=production.")

    debug = False
    if environment == "development":
        debug_value = os.environ.get("FLASK_DEBUG")
        debug = _parse_bool(debug_value, name="FLASK_DEBUG") if debug_value else False

    return {
        "SECRET_KEY": secret_key or (TEST_SECRET_KEY if testing else secrets.token_hex(32)),
        "DEBUG": debug,
        "TESTING": testing,
        "MAX_CONTENT_LENGTH": MAX_CONTENT_LENGTH,
        "SESSION_COOKIE_HTTPONLY": True,
        "SESSION_COOKIE_SAMESITE": "Lax",
        "SESSION_COOKIE_SECURE": production,
        "PERMANENT_SESSION_LIFETIME": timedelta(days=7),
        "DATABASE": os.environ.get(
            "RESUMEPRO_DATABASE",
            str(Path(__file__).resolve().parents[1] / "instance" / "resumebuilder.sqlite3"),
        ),
        "GOOGLE_CLIENT_ID": os.environ.get("GOOGLE_CLIENT_ID"),
        "GOOGLE_CLIENT_SECRET": os.environ.get("GOOGLE_CLIENT_SECRET"),
        "LINKEDIN_CLIENT_ID": os.environ.get("LINKEDIN_CLIENT_ID"),
        "LINKEDIN_CLIENT_SECRET": os.environ.get("LINKEDIN_CLIENT_SECRET"),
    }
