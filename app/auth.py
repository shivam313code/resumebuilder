import hmac
import re
import secrets
from contextlib import contextmanager
from functools import wraps
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
    jsonify,
    session,
    url_for,
)
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db
from .models import OAuthAccount, User


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
    with db.session.begin():
        yield db.session


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
            g.user = connection.get(User, user_id)
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
                user = connection.scalar(
                    select(User).where(func.lower(User.email) == email)
                )
        if user is None or user.password_hash is None or not check_password_hash(
            user.password_hash, password
        ):
            flash("Email or password is incorrect.", "error")
            return _render_account_page("login", status=401)

        _start_user_session(user.id)
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
                user = User(name=name, email=email, password_hash=password_hash)
                connection.add(user)
                connection.flush()
                user_id = user.id
        except IntegrityError:
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


@auth_blueprint.post("/account/profile")
def update_profile_name():
    if g.user is None:
        return jsonify(error="Please sign in again to continue."), 401
    token = request.headers.get("X-CSRF-Token", "")
    stored_token = session.get("_csrf_token", "")
    if not token or not stored_token or not hmac.compare_digest(token, stored_token):
        return jsonify(error="Your session expired. Reload the page and try again."), 400
    payload = request.get_json(silent=True)
    name = payload.get("name", "").strip() if isinstance(payload, dict) else ""
    if not name or len(name) > 100:
        return jsonify(error="Enter a name between 1 and 100 characters."), 400
    with _connect() as connection:
        user = connection.get(User, g.user.id)
        if user is None:
            return jsonify(error="Please sign in again to continue."), 401
        user.name = name
    return jsonify(name=name)


@auth_blueprint.post("/account/password")
def update_password():
    if g.user is None:
        flash("Sign in again before changing your password.", "error")
        return redirect(url_for("auth.login"))
    _validate_csrf()
    current_password = request.form.get("current_password", "")
    new_password = request.form.get("new_password", "")
    confirm_password = request.form.get("confirm_password", "")
    if not 12 <= len(new_password) <= 256:
        flash("Use a new password between 12 and 256 characters.", "error")
        return redirect(url_for("main.settings") + "#security")
    if new_password != confirm_password:
        flash("The new password and confirmation do not match.", "error")
        return redirect(url_for("main.settings") + "#security")
    with _connect() as connection:
        user = connection.get(User, g.user.id)
        if user is None:
            return jsonify(error="Your account could not be found."), 404
        if user.password_hash and not check_password_hash(
            user.password_hash, current_password
        ):
            flash("Your current password is incorrect.", "error")
            return redirect(url_for("main.settings") + "#security")
        user.password_hash = generate_password_hash(new_password)
    flash("Your password has been updated.", "success")
    return redirect(url_for("main.settings") + "#security")


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
        account = connection.scalar(
            select(OAuthAccount).where(
                OAuthAccount.provider == provider,
                OAuthAccount.subject == subject,
            )
        )
        if account is None:
            user = connection.scalar(
                select(User).where(func.lower(User.email) == email)
            )
            if user is None:
                user = User(
                    name=name or email.split("@", 1)[0],
                    email=email,
                )
                connection.add(user)
                connection.flush()
            user_id = user.id
            connection.add(
                OAuthAccount(provider=provider, subject=subject, user_id=user_id)
            )
        else:
            user_id = account.user_id

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
