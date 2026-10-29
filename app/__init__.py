import logging
from pathlib import Path

from flask import Flask, flash, render_template, request, url_for
from sqlalchemy import event
from sqlalchemy.engine import URL, make_url

from .auth import auth_blueprint, init_auth
from .config import load_config
from .extensions import db, migrate
from .routes.main import main_blueprint
from .routes.tools import tools_blueprint


def create_app(environment=None, config_overrides=None):
    app = Flask(__name__, template_folder="../templates", static_folder="../static")
    app.config.from_mapping(load_config(environment))
    if config_overrides:
        app.config.update(config_overrides)
        if "DATABASE" in config_overrides and "SQLALCHEMY_DATABASE_URI" not in config_overrides:
            app.config["SQLALCHEMY_DATABASE_URI"] = URL.create(
                "sqlite",
                database=str(config_overrides["DATABASE"]),
            ).render_as_string(hide_password=False)
            app.config["DB_BACKEND"] = "sqlite"

    logging.basicConfig(level=logging.INFO)
    database_url = make_url(app.config["SQLALCHEMY_DATABASE_URI"])
    app.config["DB_BACKEND"] = (
        "sqlite" if database_url.drivername.startswith("sqlite") else "postgresql"
    )
    if app.config["DB_BACKEND"] == "postgresql":
        if database_url.drivername != "postgresql+psycopg":
            raise RuntimeError("PostgreSQL connections must use the psycopg driver.")
        if config_overrides and "SQLALCHEMY_DATABASE_URI" in config_overrides:
            app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
                "pool_pre_ping": True,
                "pool_size": 5,
                "max_overflow": 10,
                "pool_timeout": 30,
                "pool_recycle": 1800,
            }
    elif config_overrides and "SQLALCHEMY_DATABASE_URI" in config_overrides:
        app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
            "pool_pre_ping": True,
            "connect_args": {"timeout": 20},
        }

    if app.config["DB_BACKEND"] == "sqlite":
        sqlite_path = database_url.database
        app.config["DATABASE"] = sqlite_path
        if sqlite_path and sqlite_path != ":memory:":
            Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)

    db.init_app(app)
    migrate.init_app(app, db, compare_type=True)
    if app.config["DB_BACKEND"] == "sqlite":
        with app.app_context():
            engine = db.engine

            @event.listens_for(engine, "connect")
            def _enable_sqlite_foreign_keys(connection, _record):
                cursor = connection.cursor()
                cursor.execute("PRAGMA foreign_keys = ON")
                cursor.close()

    if app.config["DB_BACKEND"] == "sqlite" and app.config["SQLITE_AUTO_CREATE"]:
        with app.app_context():
            db.create_all()

    init_auth(app)
    app.register_blueprint(auth_blueprint)
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
