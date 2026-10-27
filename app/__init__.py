import logging

from flask import Flask, flash, render_template, request, url_for

from .config import load_config
from .routes.main import main_blueprint
from .routes.tools import tools_blueprint


def create_app(environment=None, config_overrides=None):
    app = Flask(__name__, template_folder="../templates", static_folder="../static")
    app.config.from_mapping(load_config(environment))
    if config_overrides:
        app.config.update(config_overrides)

    logging.basicConfig(level=logging.INFO)
    app.register_blueprint(main_blueprint)
    app.register_blueprint(tools_blueprint)

    @app.errorhandler(413)
    def file_too_large(_error):
        if request.path == url_for("tools.pdf_to_word"):
            flash("The PDF is too large. Please upload a file under 20 MB.", "error")
            return render_template("pdf_to_word.html"), 413
        if request.path == url_for("tools.photo_resize"):
            flash("The photo is too large. Please upload a file under 20 MB.", "error")
            return render_template("photo_resize.html"), 413
        return "File too large. Maximum upload size is 20 MB.", 413

    return app
