import hashlib
import hmac
import json
import secrets

from flask import (
    Blueprint,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    session,
    url_for,
)
from sqlalchemy import delete, func, select, update

from ..auth import login_required
from ..extensions import db
from ..models import Resume, ResumeShare, User
from ..services.resume_service import (
    build_docx,
    validate_resume,
    validate_resume_document,
)


main_blueprint = Blueprint("main", __name__)


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


def _resume_request_payload(*, require_version=False):
    if not request.is_json:
        return None, (jsonify(error="Send resume data as JSON."), 400)
    if request.content_length and request.content_length > 3_000_000:
        return None, (jsonify(error="Resume data is too large."), 413)
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None, (jsonify(error="Resume data is invalid."), 400)
    title = payload.get("title", "")
    template_id = payload.get("templateId", "")
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 120:
        return None, (jsonify(error="Resume title must be between 1 and 120 characters."), 400)
    if not isinstance(template_id, str) or template_id not in TEMPLATES_BY_ID:
        return None, (jsonify(error="Choose one of the available resume templates."), 400)
    content = payload.get("content")
    try:
        clean_content = validate_resume_document(content)
    except (TypeError, ValueError) as error:
        return None, (jsonify(error=str(error)), 400)

    version = payload.get("version")
    if require_version and (type(version) is not int or version < 1):
        return None, (jsonify(error="A valid resume version is required."), 400)
    return {
        "title": title.strip(),
        "template_id": template_id,
        "content": clean_content,
        "version": version,
    }, None


def _resume_response(resume):
    return {
        "id": resume.id,
        "title": resume.title,
        "templateId": resume.template_id,
        "templateName": TEMPLATES_BY_ID[resume.template_id]["name"],
        "content": resume.content,
        "version": resume.version,
        "createdAt": resume.created_at.isoformat(),
        "updatedAt": resume.updated_at.isoformat(),
    }


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


@main_blueprint.get("/api/resumes")
def list_resumes():
    if g.user is None:
        return jsonify(error="Please sign in again to continue."), 401
    resumes = db.session.scalars(
        select(Resume)
        .where(Resume.user_id == g.user.id)
        .order_by(Resume.updated_at.desc(), Resume.id.desc())
    ).all()
    return jsonify(resumes=[_resume_response(resume) for resume in resumes])


@main_blueprint.post("/api/resumes")
def create_resume():
    error_response = _require_resume_session()
    if error_response:
        return error_response
    payload, error_response = _resume_request_payload()
    if error_response:
        return error_response
    resume = Resume(
        user_id=g.user.id,
        title=payload["title"],
        template_id=payload["template_id"],
        content=payload["content"],
    )
    with db.session.begin():
        db.session.add(resume)
        db.session.flush()
    return jsonify(_resume_response(resume)), 201


@main_blueprint.get("/api/resumes/<int:resume_id>")
def get_resume(resume_id):
    if g.user is None:
        return jsonify(error="Please sign in again to continue."), 401
    resume = db.session.scalar(
        select(Resume).where(
            Resume.id == resume_id,
            Resume.user_id == g.user.id,
        )
    )
    if resume is None:
        return jsonify(error="Resume not found."), 404
    return jsonify(_resume_response(resume))


@main_blueprint.put("/api/resumes/<int:resume_id>")
def update_resume(resume_id):
    error_response = _require_resume_session()
    if error_response:
        return error_response
    payload, error_response = _resume_request_payload(require_version=True)
    if error_response:
        return error_response
    with db.session.begin():
        result = db.session.execute(
            update(Resume)
            .where(
                Resume.id == resume_id,
                Resume.user_id == g.user.id,
                Resume.version == payload["version"],
            )
            .values(
                title=payload["title"],
                template_id=payload["template_id"],
                content=payload["content"],
                version=Resume.version + 1,
                updated_at=func.current_timestamp(),
            )
        )
        if result.rowcount == 0:
            owned_resume = db.session.scalar(
                select(Resume.id).where(
                    Resume.id == resume_id,
                    Resume.user_id == g.user.id,
                )
            )
            if owned_resume is None:
                return jsonify(error="Resume not found."), 404
            return jsonify(
                error="This resume changed elsewhere. Reload it before saving again."
            ), 409
        resume = db.session.scalar(
            select(Resume).where(
                Resume.id == resume_id,
                Resume.user_id == g.user.id,
            )
        )
    return jsonify(_resume_response(resume))


@main_blueprint.post("/api/resumes/<int:resume_id>/duplicate")
def duplicate_resume(resume_id):
    error_response = _require_resume_session()
    if error_response:
        return error_response
    with db.session.begin():
        source = db.session.scalar(
            select(Resume).where(
                Resume.id == resume_id,
                Resume.user_id == g.user.id,
            )
        )
        if source is None:
            return jsonify(error="Resume not found."), 404
        duplicate = Resume(
            user_id=g.user.id,
            title=f"{source.title[:113]} (Copy)",
            template_id=source.template_id,
            content=source.content,
            version=1,
        )
        db.session.add(duplicate)
        db.session.flush()
    return jsonify(_resume_response(duplicate)), 201


@main_blueprint.delete("/api/resumes/<int:resume_id>")
def delete_resume(resume_id):
    error_response = _require_resume_session()
    if error_response:
        return error_response
    with db.session.begin():
        result = db.session.execute(
            delete(Resume).where(
                Resume.id == resume_id,
                Resume.user_id == g.user.id,
            )
        )
    if result.rowcount == 0:
        return jsonify(error="Resume not found."), 404
    return jsonify(message="Resume deleted.")


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


@main_blueprint.get("/pricing")
def pricing():
    return render_template("pricing.html")


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
    with db.session.begin():
        db.session.execute(
            select(User.id).where(User.id == g.user.id).with_for_update()
        )
        db.session.execute(
            delete(ResumeShare).where(ResumeShare.user_id == g.user.id)
        )
        db.session.add(
            ResumeShare(
                token_hash=token_hash,
                user_id=g.user.id,
                resume_json=json.dumps(resume),
            )
        )
    return jsonify(url=url_for("main.shared_resume", token=token, _external=True)), 201


@main_blueprint.delete("/api/resume/share/<token>")
def revoke_resume_share(token):
    error_response = _require_resume_session()
    if error_response:
        return error_response
    token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
    with db.session.begin():
        result = db.session.execute(
            delete(ResumeShare).where(
                ResumeShare.token_hash == token_hash,
                ResumeShare.user_id == g.user.id,
            )
        )
    if result.rowcount == 0:
        return jsonify(error="This share link is no longer available."), 404
    return jsonify(message="Share link disabled.")


@main_blueprint.get("/resume/shared/<token>")
def shared_resume(token):
    token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
    share = db.session.get(ResumeShare, token_hash)
    if share is None:
        return render_template("shared_resume.html", resume=None), 404
    resume = validate_resume(json.loads(share.resume_json))
    return render_template("shared_resume.html", resume=resume)
