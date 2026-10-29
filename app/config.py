import os
import secrets
from datetime import timedelta
from pathlib import Path

from sqlalchemy.engine import URL, make_url


MAX_CONTENT_LENGTH = 20 * 1024 * 1024
TEST_SECRET_KEY = "test-only-secret-key"


def _parse_bool(value, *, name):
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean value.")


def _database_config(environment):
    database_url = os.environ.get("DATABASE_URL")
    legacy_database = os.environ.get("RESUMEPRO_DATABASE")

    if database_url:
        try:
            parsed_url = make_url(database_url)
        except (TypeError, ValueError) as error:
            raise ValueError("DATABASE_URL is not a valid database URL.") from error
        if parsed_url.drivername in {"postgres", "postgresql", "postgresql+psycopg2"}:
            parsed_url = parsed_url.set(drivername="postgresql+psycopg")
        elif parsed_url.drivername == "postgresql+psycopg":
            pass
        elif not parsed_url.drivername.startswith("sqlite"):
            raise ValueError("DATABASE_URL must use PostgreSQL or SQLite.")
        uri = parsed_url.render_as_string(hide_password=False)
        is_sqlite = parsed_url.drivername.startswith("sqlite")
        database = parsed_url.database if is_sqlite else None
    else:
        if legacy_database:
            database = legacy_database
        elif environment == "testing":
            database = ":memory:"
        else:
            database = str(
                Path(__file__).resolve().parents[1]
                / "instance"
                / "resumebuilder.sqlite3"
            )
        uri = (
            "sqlite:///:memory:"
            if database == ":memory:"
            else URL.create("sqlite", database=database).render_as_string(
                hide_password=False
            )
        )
        is_sqlite = True

    engine_options = {"pool_pre_ping": True}
    if is_sqlite:
        engine_options["connect_args"] = {"timeout": 20}
    else:
        engine_options.update(
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=1800,
        )

    return {
        "DATABASE": database,
        "DB_BACKEND": "sqlite" if is_sqlite else "postgresql",
        "SQLITE_AUTO_CREATE": _parse_bool(
            os.environ.get("RESUMEPRO_SQLITE_AUTO_CREATE", "true"),
            name="RESUMEPRO_SQLITE_AUTO_CREATE",
        ),
        "SQLALCHEMY_DATABASE_URI": uri,
        "SQLALCHEMY_ENGINE_OPTIONS": engine_options,
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
    }


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
    if production and not (
        os.environ.get("DATABASE_URL") or os.environ.get("RESUMEPRO_DATABASE")
    ):
        raise RuntimeError(
            "DATABASE_URL or RESUMEPRO_DATABASE must be set when APP_ENV=production."
        )

    debug = False
    if environment == "development":
        debug_value = os.environ.get("FLASK_DEBUG")
        debug = _parse_bool(debug_value, name="FLASK_DEBUG") if debug_value else False

    config = {
        "SECRET_KEY": secret_key or (TEST_SECRET_KEY if testing else secrets.token_hex(32)),
        "DEBUG": debug,
        "TESTING": testing,
        "MAX_CONTENT_LENGTH": MAX_CONTENT_LENGTH,
        "SESSION_COOKIE_HTTPONLY": True,
        "SESSION_COOKIE_SAMESITE": "Lax",
        "SESSION_COOKIE_SECURE": production,
        "PERMANENT_SESSION_LIFETIME": timedelta(days=7),
        "GOOGLE_CLIENT_ID": os.environ.get("GOOGLE_CLIENT_ID"),
        "GOOGLE_CLIENT_SECRET": os.environ.get("GOOGLE_CLIENT_SECRET"),
        "LINKEDIN_CLIENT_ID": os.environ.get("LINKEDIN_CLIENT_ID"),
        "LINKEDIN_CLIENT_SECRET": os.environ.get("LINKEDIN_CLIENT_SECRET"),
    }
    config.update(_database_config(environment))
    return config
