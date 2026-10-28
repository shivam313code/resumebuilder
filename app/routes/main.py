import hashlib
import hmac
import json
import secrets
import sqlite3
from contextlib import closing

from flask import (
    Blueprint,
    current_app,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    session,
    url_for,
)

from ..auth import login_required
from ..services.resume_service import build_docx, validate_resume


main_blueprint = Blueprint("main", __name__)


def init_resume_shares(app):
    with closing(sqlite3.connect(app.config["DATABASE"])) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS resume_shares (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                resume_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()


def _resume_payload():
    if not request.is_json:
        return None, (jsonify(error="Send resume data as JSON."), 400)
    if request.content_length and request.content_length > 3_000_000:
        return None, (jsonify(error="Resume data is too large."), 413)
    payload = request.get_json(silent=True)
    try:
        return validate_resume(payload), None
    except ValueError as error:
        return None, (jsonify(error=str(error)), 400)


def _valid_request_token():
    token = request.headers.get("X-CSRF-Token", "")
    return bool(token and session.get("_csrf_token") and hmac.compare_digest(
        session["_csrf_token"], token
    ))


def _require_resume_session():
    if g.user is None:
        return jsonify(error="Please sign in again to continue."), 401
    if not _valid_request_token():
        return jsonify(error="Your session expired. Reload the page and try again."), 400
    return None


def _open_share_database():
    connection = sqlite3.connect(current_app.config["DATABASE"])
    connection.execute("PRAGMA foreign_keys = ON")
    return connection
RESUME_TEMPLATES = [
    {
        "id": "modern-pro",
        "name": "Modern Pro",
        "description": "A polished, two-column resume with a profile sidebar.",
    },
    {
        "id": "timeless",
        "name": "Timeless",
        "description": "Classic two-column layout with a calm blue accent.",
    },
    {
        "id": "plain",
        "name": "Plain",
        "description": "Minimal, modern and ATS-conscious.",
    },
    {
        "id": "blogger",
        "name": "Blogger",
        "description": "Simple single-column layout for readable content.",
    },
    {
        "id": "pacific",
        "name": "Pacific",
        "description": "Clean two-column layout with a compact profile header.",
    },
    {
        "id": "general-ats",
        "name": "General ATS",
        "description": "Conservative, text-first layout designed for parsing.",
    },
]
TEMPLATES_BY_ID = {template["id"]: template for template in RESUME_TEMPLATES}


@main_blueprint.get("/")
def index():
    return render_template("home.html")


@main_blueprint.get("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html")


@main_blueprint.get("/ai-copilot")
@login_required
def ai_copilot():
    return render_template("ai_copilot.html")


@main_blueprint.get("/job-tracker")
@login_required
def job_tracker():
    return render_template("job_tracker.html")


@main_blueprint.get("/settings")
@login_required
def settings():
    return render_template("settings.html")


@main_blueprint.get("/resume-builder")
@login_required
def resume_builder():
    return render_template("resume_templates.html", templates=RESUME_TEMPLATES)


@main_blueprint.get("/resume-builder/<template_id>")
@login_required
def edit_resume(template_id):
    template = TEMPLATES_BY_ID.get(template_id)
    if template is None:
        return redirect(url_for("main.resume_builder"))
    return render_template(
        "index.html",
        template=template,
        template_change_url=url_for("main.resume_builder"),
    )


@main_blueprint.post("/api/resume/export/docx")
def export_resume_docx():
    error_response = _require_resume_session()
    if error_response:
        return error_response
    resume, error_response = _resume_payload()
    if error_response:
        return error_response
    file_name = "-".join(resume["data"]["name"].lower().split()) or "resume"
    return send_file(
        build_docx(resume),
        as_attachment=True,
        download_name=f"{file_name}.docx",
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@main_blueprint.post("/api/resume/share")
def create_resume_share():
    error_response = _require_resume_session()
    if error_response:
        return error_response
    resume, error_response = _resume_payload()
    if error_response:
        return error_response
    token = secrets.token_urlsafe(24)
    token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
    with closing(_open_share_database()) as connection:
        connection.execute("DELETE FROM resume_shares WHERE user_id = ?", (g.user["id"],))
        connection.execute(
            "INSERT INTO resume_shares (token_hash, user_id, resume_json) VALUES (?, ?, ?)",
            (token_hash, g.user["id"], json.dumps(resume)),
        )
        connection.commit()
    return jsonify(url=url_for("main.shared_resume", token=token, _external=True)), 201


@main_blueprint.delete("/api/resume/share/<token>")
def revoke_resume_share(token):
    error_response = _require_resume_session()
    if error_response:
        return error_response
    token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
    with closing(_open_share_database()) as connection:
        cursor = connection.execute(
            "DELETE FROM resume_shares WHERE token_hash = ? AND user_id = ?",
            (token_hash, g.user["id"]),
        )
        connection.commit()
    if cursor.rowcount == 0:
        return jsonify(error="This share link is no longer available."), 404
    return jsonify(message="Share link disabled.")


@main_blueprint.get("/resume/shared/<token>")
def shared_resume(token):
    token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
    with closing(_open_share_database()) as connection:
        row = connection.execute(
            "SELECT resume_json FROM resume_shares WHERE token_hash = ?",
            (token_hash,),
        ).fetchone()
    if row is None:
        return render_template("shared_resume.html", resume=None), 404
    resume = validate_resume(json.loads(row[0]))
    return render_template("shared_resume.html", resume=resume)
