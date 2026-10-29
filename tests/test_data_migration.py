import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from sqlalchemy import create_engine, text

from app.extensions import db
from app.models import OAuthAccount, Resume, ResumeShare, User
from scripts.migrate_sqlite_to_postgres import migrate_data


class SqliteDataMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.source_path = Path(self.temp_dir.name) / "backup.sqlite3"
        self.destination_path = Path(self.temp_dir.name) / "destination.sqlite3"
        self._create_source_backup()
        self.destination_engine = create_engine(
            f"sqlite:///{self.destination_path.as_posix()}",
        )
        self.addCleanup(self.destination_engine.dispose)
        db.metadata.create_all(self.destination_engine)

    def _create_source_backup(self):
        with closing(sqlite3.connect(self.source_path)) as connection:
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
                INSERT INTO users (id, name, email, password_hash, created_at)
                VALUES (42, 'Migration Candidate', 'migration@example.com', 'preserved-hash', '2025-01-02 03:04:05');
                INSERT INTO oauth_accounts (id, provider, subject, user_id)
                VALUES (17, 'google', 'provider-subject', 42);
                INSERT INTO resume_shares (token_hash, user_id, resume_json, created_at)
                VALUES ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 42, '{"data":{"name":"Migration Candidate"},"entries":{}}', '2025-02-03 04:05:06');
                """
            )

    def test_import_preserves_ids_hashes_identities_and_share_snapshots(self):
        self.assertEqual(
            {
                User.__tablename__,
                OAuthAccount.__tablename__,
                Resume.__tablename__,
                ResumeShare.__tablename__,
            },
            set(db.metadata.tables),
        )
        imported = migrate_data(self.source_path, self.destination_engine)

        self.assertEqual(imported, {"users": 1, "oauth_accounts": 1, "resume_shares": 1})
        with self.destination_engine.connect() as connection:
            user = connection.execute(
                text("SELECT id, email, password_hash FROM users WHERE id = 42")
            ).one()
            identity = connection.execute(
                text(
                    "SELECT id, provider, subject, user_id FROM oauth_accounts WHERE id = 17"
                )
            ).one()
            share = connection.execute(
                text(
                    "SELECT token_hash, user_id, resume_json FROM resume_shares"
                )
            ).one()

        self.assertEqual(user, (42, "migration@example.com", "preserved-hash"))
        self.assertEqual(identity, (17, "google", "provider-subject", 42))
        self.assertEqual(share[0:2], ("a" * 64, 42))
        self.assertEqual(json.loads(share[2])["data"]["name"], "Migration Candidate")

        with closing(
            sqlite3.connect(f"{self.source_path.as_uri()}?mode=ro", uri=True)
        ) as source:
            self.assertEqual(source.execute("SELECT COUNT(*) FROM users").fetchone()[0], 1)

    def test_import_refuses_a_populated_destination(self):
        with self.destination_engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users (id, name, email) VALUES "
                    "(1, 'Existing', 'existing@example.com')"
                )
            )

        with self.assertRaisesRegex(ValueError, "destination is not empty"):
            migrate_data(self.source_path, self.destination_engine)

        with self.destination_engine.connect() as connection:
            self.assertEqual(
                connection.execute(text("SELECT COUNT(*) FROM users")).scalar_one(),
                1,
            )
