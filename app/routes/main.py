from flask import Blueprint, redirect, render_template, url_for

from ..auth import login_required


main_blueprint = Blueprint("main", __name__)
RESUME_TEMPLATES = [
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
