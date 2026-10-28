import hmac
import re
import secrets
import sqlite3
from contextlib import closing, contextmanager
from functools import wraps
from pathlib import Path
from urllib.parse import unquote, urlsplit

from authlib.integrations.flask_client import OAuth
from flask import (
    Blueprint,
    abort,
    current_app,
    flash,
    g,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash


auth_blueprint = Blueprint("auth", __name__)
oauth = OAuth()
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
OAUTH_PROVIDERS = {
    "google": {
        "server_metadata_url": "https://accounts.google.com/.well-known/openid-configuration",
        "scope": "openid email profile",
    },
    "linkedin": {
        "server_metadata_url": "https://www.linkedin.com/oauth/.well-known/openid-configuration",
        "scope": "openid profile email",
    },
}


def init_auth(app):
    database_path = Path(app.config["DATABASE"])
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(database_path)) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS oauth_accounts (
                id INTEGER PRIMARY KEY,
                provider TEXT NOT NULL,
                subject TEXT NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(provider, subject)
            );
            """
        )
        connection.commit()

    oauth.init_app(app)
    oauth_enabled = {}
    for provider, settings in OAUTH_PROVIDERS.items():
        client_id = app.config.get(f"{provider.upper()}_CLIENT_ID")
        client_secret = app.config.get(f"{provider.upper()}_CLIENT_SECRET")
        if client_id and client_secret:
            oauth.register(
                name=provider,
                client_id=client_id,
                client_secret=client_secret,
                server_metadata_url=settings["server_metadata_url"],
                client_kwargs={"scope": settings["scope"]},
            )
            oauth_enabled[provider] = True
    app.config["OAUTH_ENABLED"] = oauth_enabled


@contextmanager
def _connect():
    connection = sqlite3.connect(current_app.config["DATABASE"])
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _csrf_token():
    token = session.get("_csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["_csrf_token"] = token
    return token


def _validate_csrf():
    token = request.form.get("csrf_token", "")
    stored_token = session.get("_csrf_token", "")
    if not stored_token or not token or not hmac.compare_digest(stored_token, token):
        abort(400, description="The form expired. Reload the page and try again.")


def _safe_next_url():
    target = request.values.get("next", session.get("_next_url", ""))
    decoded_target = unquote(target)
    parsed = urlsplit(decoded_target)
    if (
        target.startswith("/")
        and not decoded_target.startswith("//")
        and not parsed.netloc
        and not parsed.scheme
        and "\\" not in decoded_target
        and not any(ord(character) < 32 for character in decoded_target)
    ):
        return target
    return url_for("main.resume_builder")


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            flash("Sign in to continue to your resume.", "info")
            return redirect(url_for("auth.login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


@auth_blueprint.before_app_request
def load_logged_in_user():
    g.user = None
    user_id = session.get("user_id")
    if user_id is not None:
        with _connect() as connection:
            g.user = connection.execute(
                "SELECT id, name, email FROM users WHERE id = ?", (user_id,)
            ).fetchone()
        if g.user is None:
            session.pop("user_id", None)
    _csrf_token()


@auth_blueprint.app_context_processor
def inject_auth_context():
    return {"current_user": g.get("user"), "csrf_token": _csrf_token}


def _start_user_session(user_id):
    session.clear()
    session["user_id"] = user_id
    _csrf_token()
    session.permanent = True


def _render_account_page(mode, *, status=200):
    return (
        render_template(
            "account.html",
            mode=mode,
            google_enabled=current_app.config["OAUTH_ENABLED"].get("google", False),
            linkedin_enabled=current_app.config["OAUTH_ENABLED"].get("linkedin", False),
            next_url=_safe_next_url(),
        ),
        status,
    )


@auth_blueprint.route("/login", methods=("GET", "POST"))
def login():
    if g.user is not None:
        return redirect(_safe_next_url())

    if request.method == "POST":
        _validate_csrf()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        user = None
        if len(email) <= 254 and len(password) <= 256:
            with _connect() as connection:
                user = connection.execute(
                    "SELECT id, password_hash FROM users WHERE email = ?", (email,)
                ).fetchone()
        if user is None or user["password_hash"] is None or not check_password_hash(
            user["password_hash"], password
        ):
            flash("Email or password is incorrect.", "error")
            return _render_account_page("login", status=401)

        _start_user_session(user["id"])
        flash("You're signed in.", "success")
        return redirect(_safe_next_url())

    return _render_account_page("login")


@auth_blueprint.route("/signup", methods=("GET", "POST"))
def signup():
    if g.user is not None:
        return redirect(_safe_next_url())

    if request.method == "POST":
        _validate_csrf()
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        if not name or len(name) > 100:
            flash("Enter your name (up to 100 characters).", "error")
            return _render_account_page("signup", status=400)
        if not EMAIL_PATTERN.fullmatch(email) or len(email) > 254:
            flash("Enter a valid email address.", "error")
            return _render_account_page("signup", status=400)
        if len(password) < 12 or len(password) > 256:
            flash("Use a password between 12 and 256 characters.", "error")
            return _render_account_page("signup", status=400)
        if request.form.get("terms") != "accepted":
            flash("Please agree to the Terms of Service and Privacy Policy.", "error")
            return _render_account_page("signup", status=400)

        password_hash = generate_password_hash(password)
        try:
            with _connect() as connection:
                cursor = connection.execute(
                    "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                    (name, email, password_hash),
                )
                user_id = cursor.lastrowid
        except sqlite3.IntegrityError:
            flash("An account with that email already exists. Sign in instead.", "error")
            return _render_account_page("signup", status=409)

        _start_user_session(user_id)
        flash("Your account is ready. Welcome to ResumePro!", "success")
        return redirect(_safe_next_url())

    return _render_account_page("signup")


@auth_blueprint.post("/logout")
def logout():
    _validate_csrf()
    session.clear()
    flash("You have been signed out.", "success")
    return redirect(url_for("main.index"))


@auth_blueprint.get("/auth/<provider>")
def oauth_login(provider):
    client = (
        oauth.create_client(provider)
        if current_app.config["OAUTH_ENABLED"].get(provider, False)
        else None
    )
    if client is None or provider not in OAUTH_PROVIDERS:
        flash(f"{provider.title()} sign-in is not configured yet.", "error")
        return redirect(url_for("auth.login"))
    session["_next_url"] = _safe_next_url()
    callback_url = url_for("auth.oauth_callback", provider=provider, _external=True)
    return client.authorize_redirect(callback_url)


@auth_blueprint.get("/auth/<provider>/callback")
def oauth_callback(provider):
    client = (
        oauth.create_client(provider)
        if current_app.config["OAUTH_ENABLED"].get(provider, False)
        else None
    )
    if client is None or provider not in OAUTH_PROVIDERS:
        abort(404)

    token = client.authorize_access_token()
    user_info_response = client.get("userinfo", token=token)
    user_info_response.raise_for_status()
    user_info = user_info_response.json()
    email = str(user_info.get("email", "")).strip().lower()
    subject = str(user_info.get("sub", "")).strip()
    name = str(user_info.get("name", "")).strip()[:100]
    if (
        not EMAIL_PATTERN.fullmatch(email)
        or not subject
        or user_info.get("email_verified") is not True
    ):
        flash("The provider did not return a verified email address.", "error")
        return redirect(url_for("auth.login"))

    with _connect() as connection:
        account = connection.execute(
            """
            SELECT users.id
            FROM oauth_accounts
            JOIN users ON users.id = oauth_accounts.user_id
            WHERE oauth_accounts.provider = ? AND oauth_accounts.subject = ?
            """,
            (provider, subject),
        ).fetchone()
        if account is None:
            user = connection.execute(
                "SELECT id FROM users WHERE email = ?", (email,)
            ).fetchone()
            if user is None:
                cursor = connection.execute(
                    "INSERT INTO users (name, email) VALUES (?, ?)",
                    (name or email.split("@", 1)[0], email),
                )
                user_id = cursor.lastrowid
            else:
                user_id = user["id"]
            connection.execute(
                "INSERT INTO oauth_accounts (provider, subject, user_id) VALUES (?, ?, ?)",
                (provider, subject, user_id),
            )
        else:
            user_id = account["id"]

    next_url = _safe_next_url()
    _start_user_session(user_id)
    flash("You're signed in.", "success")
    return redirect(next_url)


@auth_blueprint.get("/terms")
def terms():
    return render_template("legal.html", page="terms")


@auth_blueprint.get("/privacy")
def privacy():
    return render_template("legal.html", page="privacy")
