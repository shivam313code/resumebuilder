import hashlib
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from sqlalchemy import func, inspect, select
from sqlalchemy.exc import IntegrityError

from app import create_app
from app.extensions import db
from app.models import OAuthAccount, Resume, ResumeShare, User


class SqliteModelTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        database_path = Path(self.temp_dir.name) / "models.sqlite3"
        self.app = create_app("testing", {"DATABASE": str(database_path)})
        self.addCleanup(self._dispose_database_engine)

    def _dispose_database_engine(self):
        with self.app.app_context():
            db.session.remove()
            db.engine.dispose()

    def test_application_startup_creates_legacy_sqlite_tables(self):
        with self.app.app_context():
            tables = set(inspect(db.engine).get_table_names())

        self.assertTrue(
            {"users", "oauth_accounts", "resume_shares", "resumes"}.issubset(tables)
        )
        self.assertEqual(self.app.config["DB_BACKEND"], "sqlite")

    def test_email_uniqueness_is_case_insensitive(self):
        with self.app.app_context():
            db.session.add(User(name="First", email="User@Example.com"))
            db.session.commit()
            db.session.add(User(name="Second", email="user@example.com"))

            with self.assertRaises(IntegrityError):
                db.session.commit()
            db.session.rollback()

    def test_oauth_identity_is_unique_and_models_have_relationships(self):
        with self.app.app_context():
            user = User(name="Candidate", email="candidate@example.com")
            identity = OAuthAccount(
                provider="google",
                subject="provider-subject",
                user=user,
            )
            token_hash = "a" * 64
            share = ResumeShare(
                token_hash=token_hash,
                resume_json='{"data":{"name":"Candidate"},"entries":{}}',
                user=user,
            )
            resume = Resume(
                title="Candidate Resume",
                template_id="modern-pro",
                content={"data": {"name": "Candidate"}, "entries": {}},
                user=user,
            )
            db.session.add(user)
            db.session.commit()

            persisted_share = db.session.get(ResumeShare, token_hash)
            persisted_resume = db.session.get(Resume, resume.id)
            self.assertIsNotNone(persisted_share)
            self.assertEqual(persisted_share.user_id, user.id)
            self.assertEqual(persisted_share.resume_json, share.resume_json)
            self.assertEqual(user.oauth_accounts, [identity])
            self.assertEqual(user.resume_shares, [persisted_share])
            self.assertEqual(persisted_resume.user_id, user.id)
            self.assertEqual(persisted_resume.content["data"]["name"], "Candidate")
            self.assertEqual(persisted_resume.version, 1)
            self.assertEqual(user.resumes, [persisted_resume])

            other_user = User(name="Other", email="other@example.com")
            db.session.add(
                OAuthAccount(
                    provider="google",
                    subject="provider-subject",
                    user=other_user,
                )
            )
            with self.assertRaises(IntegrityError):
                db.session.commit()
            db.session.rollback()

    def test_share_foreign_key_rejects_missing_owner(self):
        with self.app.app_context():
            db.session.add(
                ResumeShare(
                    token_hash="b" * 64,
                    user_id=999,
                    resume_json="{}",
                )
            )
            with self.assertRaises(IntegrityError):
                db.session.commit()
            db.session.rollback()

    def test_resume_foreign_key_rejects_missing_owner(self):
        with self.app.app_context():
            db.session.add(
                Resume(
                    user_id=999,
                    title="Orphan",
                    template_id="modern-pro",
                    content={"data": {}, "entries": {}},
                )
            )
            with self.assertRaises(IntegrityError):
                db.session.commit()
            db.session.rollback()

    def test_account_delete_cascades_to_oauth_and_share_records(self):
        with self.app.app_context():
            user = User(name="Candidate", email="delete@example.com")
            user.oauth_accounts.append(
                OAuthAccount(provider="google", subject="delete-subject")
            )
            user.resume_shares.append(
                ResumeShare(token_hash="c" * 64, resume_json="{}")
            )
            user.resumes.append(
                Resume(
                    title="Candidate Resume",
                    template_id="modern-pro",
                    content={"data": {}, "entries": {}},
                )
            )
            db.session.add(user)
            db.session.commit()
            user_id = user.id

            db.session.delete(user)
            db.session.commit()

            self.assertEqual(
                db.session.scalar(
                    select(func.count()).select_from(OAuthAccount).where(
                        OAuthAccount.user_id == user_id
                    )
                ),
                0,
            )
            self.assertEqual(
                db.session.scalar(
                    select(func.count()).select_from(ResumeShare).where(
                        ResumeShare.user_id == user_id
                    )
                ),
                0,
            )
            self.assertEqual(
                db.session.scalar(
                    select(func.count()).select_from(Resume).where(
                        Resume.user_id == user_id
                    )
                ),
                0,
            )

    def test_existing_sqlite_accounts_and_share_snapshots_remain_readable(self):
        database_path = Path(self.temp_dir.name) / "legacy.sqlite3"
        token = "legacy-share-token"
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        snapshot = {"data": {"name": "Legacy Candidate"}, "entries": {}}
        with closing(sqlite3.connect(database_path)) as connection:
            connection.executescript(
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
                """
            )
            connection.execute(
                "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)",
                (73, "Legacy Candidate", "legacy@example.com", "existing-password-hash"),
            )
            connection.execute(
                "INSERT INTO resume_shares (token_hash, user_id, resume_json) VALUES (?, ?, ?)",
                (token_hash, 73, json.dumps(snapshot)),
            )
            connection.commit()

        legacy_app = create_app("testing", {"DATABASE": str(database_path)})
        self.addCleanup(self._dispose_engine, legacy_app)

        response = legacy_app.test_client().get(f"/resume/shared/{token}")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Legacy Candidate", response.data)
        with legacy_app.app_context():
            user = db.session.get(User, 73)
            self.assertEqual(user.email, "legacy@example.com")
            self.assertEqual(user.password_hash, "existing-password-hash")

    @staticmethod
    def _dispose_engine(app):
        with app.app_context():
            db.session.remove()
            db.engine.dispose()
