from flask import Blueprint, render_template


main_blueprint = Blueprint("main", __name__)


@main_blueprint.get("/")
def index():
    return render_template("home.html")


@main_blueprint.get("/resume-builder")
def resume_builder():
    return render_template("index.html")
