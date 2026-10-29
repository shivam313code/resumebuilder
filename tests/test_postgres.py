import json
import os
import re
import sqlite3
import tempfile
import unittest
import uuid
from contextlib import closing
from pathlib import Path

from flask_migrate import upgrade
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from app import create_app
from app.extensions import db
from app.models import OAuthAccount, ResumeShare, User
from scripts.migrate_sqlite_to_postgres import migrate_data


POSTGRES_TEST_URL = os.environ.get("RESUMEPRO_TEST_DATABASE_URL")


@unittest.skipUnless(
    POSTGRES_TEST_URL,
    "Set RESUMEPRO_TEST_DATABASE_URL to run PostgreSQL integration tests.",
)
class PostgreSqlMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_url = make_url(POSTGRES_TEST_URL)
        if base_url.drivername in {"postgres", "postgresql", "postgresql+psycopg2"}:
            base_url = base_url.set(drivername="postgresql+psycopg")
        if base_url.drivername != "postgresql+psycopg":
            raise ValueError("RESUMEPRO_TEST_DATABASE_URL must use PostgreSQL.")

        cls.schema = f"resumepro_test_{uuid.uuid4().hex}"
        cls.base_engine = create_engine(base_url, pool_pre_ping=True)
        with cls.base_engine.begin() as connection:
            connection.exec_driver_sql(f'CREATE SCHEMA "{cls.schema}"')

        isolated_url = base_url.update_query_dict(
            {"options": f"-csearch_path={cls.schema}"}
        )
        try:
            cls.app = create_app(
                "testing",
                {
                    "SQLALCHEMY_DATABASE_URI": isolated_url.render_as_string(
                        hide_password=False
                    )
                },
            )
            cls.app.config["TESTING"] = True
            with cls.app.app_context():
                upgrade(
                    directory=str(Path(__file__).resolve().parents[1] / "migrations")
                )
        except Exception:
            with cls.base_engine.begin() as connection:
                connection.exec_driver_sql(f'DROP SCHEMA "{cls.schema}" CASCADE')
            cls.base_engine.dispose()
            raise

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "app"):
            with cls.app.app_context():
                db.session.remove()
                db.engine.dispose()
        if hasattr(cls, "base_engine"):
            with cls.base_engine.begin() as connection:
                connection.exec_driver_sql(f'DROP SCHEMA "{cls.schema}" CASCADE')
            cls.base_engine.dispose()

    def test_fresh_migration_constraints_relationships_and_share_persistence(self):
        with self.app.app_context():
            self.assertEqual(self.app.config["DB_BACKEND"], "postgresql")
            tables = set(inspect(db.engine).get_table_names(schema=self.schema))
            self.assertTrue(
                {"users", "oauth_accounts", "resume_shares", "resumes"}.issubset(tables)
            )
            user_indexes = {
                index["name"] for index in inspect(db.engine).get_indexes("users")
            }
            self.assertIn("uq_users_email_lower", user_indexes)

            with tempfile.TemporaryDirectory(prefix="resumepro-postgres-source-") as directory:
                source_path = Path(directory) / "backup.sqlite3"
                with closing(sqlite3.connect(source_path)) as source:
                    source.executescript(
                        """
                        CREATE TABLE users (
                            id INTEGER PRIMARY KEY,
                            name TEXT NOT NULL,
                            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                            password_hash TEXT,
                            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                        );
                        CREATE TABLE oauth_accounts (
                            id INTEGER PRIMARY KEY,
                            provider TEXT NOT NULL,
                            subject TEXT NOT NULL,
                            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                            UNIQUE(provider, subject)
                        );
                        CREATE TABLE resume_shares (
                            token_hash TEXT PRIMARY KEY,
                            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                            resume_json TEXT NOT NULL,
                            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                        );
                        INSERT INTO users (id, name, email, password_hash)
                        VALUES (52, 'PostgreSQL Candidate', 'pg@example.com', 'preserved-hash');
                        INSERT INTO oauth_accounts (id, provider, subject, user_id)
                        VALUES (24, 'google', 'pg-provider-subject', 52);
                        INSERT INTO resume_shares (token_hash, user_id, resume_json)
                        VALUES ('dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
                                52, '{"data":{"name":"PostgreSQL Candidate"},"entries":{}}');
                        """
                    )
                imported = migrate_data(source_path, db.engine)
                self.assertEqual(
                    imported,
                    {"users": 1, "oauth_accounts": 1, "resume_shares": 1},
                )
                with self.assertRaisesRegex(ValueError, "destination is not empty"):
                    migrate_data(source_path, db.engine)

            user = db.session.get(User, 52)
            self.assertEqual(user.password_hash, "preserved-hash")
            self.assertEqual(user.oauth_accounts[0].subject, "pg-provider-subject")
            token_hash = "d" * 64
            share = db.session.get(ResumeShare, token_hash)
            self.assertEqual(share.user_id, user.id)
            self.assertEqual(
                json.loads(share.resume_json)["data"]["name"],
                "PostgreSQL Candidate",
            )

            next_user = User(name="Next", email="next@example.com")
            db.session.add(next_user)
            db.session.commit()
            self.assertGreater(next_user.id, 52)

            db.session.add(User(name="Duplicate", email="PG@EXAMPLE.COM"))
            with self.assertRaises(IntegrityError):
                db.session.commit()
            db.session.rollback()

            db.session.add(
                OAuthAccount(
                    provider="google",
                    subject="pg-provider-subject",
                    user_id=user.id,
                )
            )
            with self.assertRaises(IntegrityError):
                db.session.commit()
            db.session.rollback()

            share = db.session.scalar(
                select(ResumeShare).where(ResumeShare.token_hash == token_hash)
            )
            self.assertIsNotNone(share)
            self.assertEqual(share.user_id, user.id)
            self.assertEqual(share.user.email, "pg@example.com")

    def test_signup_login_and_share_routes_use_postgresql(self):
        client = self.app.test_client()
        signup_page = client.get("/signup")
        self.assertEqual(signup_page.status_code, 200)
        csrf_match = re.search(
            rb'name="csrf_token" value="([^"]+)"',
            signup_page.data,
        )
        self.assertIsNotNone(csrf_match)
        csrf_token = csrf_match.group(1).decode()
        password = "postgres integration test password"
        signup = client.post(
            "/signup",
            data={
                "csrf_token": csrf_token,
                "name": "PostgreSQL Route User",
                "email": "pg-route@example.com",
                "password": password,
                "terms": "accepted",
            },
        )
        self.assertEqual(signup.status_code, 302)
        with client.session_transaction() as browser_session:
            self.assertIn("user_id", browser_session)
            owner_id = browser_session["user_id"]
            csrf_token = browser_session["_csrf_token"]
        create_resume = client.post(
            "/api/resumes",
            json={
                "title": "PostgreSQL Route Resume",
                "templateId": "modern-pro",
                "content": {
                    "data": {"name": "PostgreSQL Route User"},
                    "entries": {},
                },
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        self.assertEqual(create_resume.status_code, 201)
        resume_id = create_resume.get_json()["id"]

        another_browser = self.app.test_client()
        with another_browser.session_transaction() as browser_session:
            browser_session["user_id"] = owner_id
        cross_browser = another_browser.get(f"/api/resumes/{resume_id}")
        self.assertEqual(cross_browser.status_code, 200)
        self.assertEqual(cross_browser.get_json()["title"], "PostgreSQL Route Resume")

        payload = {
            "data": {
                "name": "PostgreSQL Route User",
                "title": "Engineer",
                "summary": "Integration route verification.",
            },
            "entries": {"experience": [], "education": []},
        }
        created = client.post(
            "/api/resume/share",
            json=payload,
            headers={"X-CSRF-Token": csrf_token},
        )
        self.assertEqual(created.status_code, 201)
        share_url = created.get_json()["url"]
        share_path = share_url.removeprefix("http://localhost")
        self.assertEqual(client.get(share_path).status_code, 200)

        logout = client.post("/logout", data={"csrf_token": csrf_token})
        self.assertEqual(logout.status_code, 302)
        login_page = client.get("/login")
        login_csrf = re.search(
            rb'name="csrf_token" value="([^"]+)"',
            login_page.data,
        ).group(1).decode()
        login = client.post(
            "/login",
            data={
                "csrf_token": login_csrf,
                "email": "PG-ROUTE@example.com",
                "password": password,
            },
        )
        self.assertEqual(login.status_code, 302)
        with client.session_transaction() as browser_session:
            login_csrf = browser_session["_csrf_token"]

        other_client = self.app.test_client()
        other_signup_page = other_client.get("/signup")
        other_csrf = re.search(
            rb'name="csrf_token" value="([^"]+)"',
            other_signup_page.data,
        ).group(1).decode()
        other_signup = other_client.post(
            "/signup",
            data={
                "csrf_token": other_csrf,
                "name": "Other PostgreSQL User",
                "email": "pg-route-other@example.com",
                "password": "another postgres test password",
                "terms": "accepted",
            },
        )
        self.assertEqual(other_signup.status_code, 302)
        self.assertEqual(other_client.get(f"/api/resumes/{resume_id}").status_code, 404)

        revoke_path = share_path.replace(
            "/resume/shared/",
            "/api/resume/share/",
        )
        revoked = client.delete(
            revoke_path,
            headers={"X-CSRF-Token": login_csrf},
        )
        self.assertEqual(revoked.status_code, 200)
        self.assertEqual(client.get(share_path).status_code, 404)
