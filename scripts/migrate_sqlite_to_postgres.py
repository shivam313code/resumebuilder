import argparse
import os
import sqlite3
import sys
from contextlib import closing
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


TABLE_COLUMNS = {
    "users": ("id", "name", "email", "password_hash", "created_at"),
    "oauth_accounts": ("id", "provider", "subject", "user_id"),
    "resume_shares": ("token_hash", "user_id", "resume_json", "created_at"),
}


def _read_only_sqlite(path):
    source_path = Path(path).resolve()
    if not source_path.is_file():
        raise FileNotFoundError("The SQLite source file does not exist.")
    connection = sqlite3.connect(f"{source_path.as_uri()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only = ON")
    return connection


def _read_source_rows(connection):
    tables = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }
    missing = set(TABLE_COLUMNS) - tables
    if missing:
        raise ValueError("The SQLite source is missing required account tables.")

    rows = {}
    for table, columns in TABLE_COLUMNS.items():
        selected_columns = ", ".join(f'"{column}"' for column in columns)
        rows[table] = [
            dict(row)
            for row in connection.execute(f'SELECT {selected_columns} FROM "{table}"')
        ]

    orphaned = connection.execute(
        """
        SELECT
            (SELECT COUNT(*) FROM oauth_accounts AS oauth
             LEFT JOIN users ON users.id = oauth.user_id WHERE users.id IS NULL)
            +
            (SELECT COUNT(*) FROM resume_shares AS shares
             LEFT JOIN users ON users.id = shares.user_id WHERE users.id IS NULL)
        """
    ).fetchone()[0]
    if orphaned:
        raise ValueError("The SQLite source contains orphaned account references.")
    return rows


def _destination_counts(connection):
    return {
        table: connection.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
        for table in TABLE_COLUMNS
    }


def _verify_destination(connection):
    duplicate_emails = connection.execute(
        text(
            "SELECT COUNT(*) FROM ("
            "SELECT lower(email) FROM users GROUP BY lower(email) HAVING COUNT(*) > 1"
            ")"
        )
    ).scalar_one()
    duplicate_identities = connection.execute(
        text(
            "SELECT COUNT(*) FROM ("
            "SELECT provider, subject FROM oauth_accounts "
            "GROUP BY provider, subject HAVING COUNT(*) > 1"
            ")"
        )
    ).scalar_one()
    orphaned = connection.execute(
        text(
            """
            SELECT
                (SELECT COUNT(*) FROM oauth_accounts AS oauth
                 LEFT JOIN users ON users.id = oauth.user_id WHERE users.id IS NULL)
                +
                (SELECT COUNT(*) FROM resume_shares AS shares
                 LEFT JOIN users ON users.id = shares.user_id WHERE users.id IS NULL)
            """
        )
    ).scalar_one()
    if duplicate_emails or duplicate_identities or orphaned:
        raise ValueError("The destination failed uniqueness or ownership verification.")


def migrate_data(source_path, destination_engine):
    with closing(_read_only_sqlite(source_path)) as source:
        rows = _read_source_rows(source)

    with destination_engine.begin() as connection:
        existing_counts = _destination_counts(connection)
        if any(existing_counts.values()):
            raise ValueError("The PostgreSQL destination is not empty; refusing to import.")

        for table, records in rows.items():
            if records:
                columns = TABLE_COLUMNS[table]
                names = ", ".join(f'"{column}"' for column in columns)
                parameters = ", ".join(f":{column}" for column in columns)
                connection.execute(
                    text(f'INSERT INTO "{table}" ({names}) VALUES ({parameters})'),
                    records,
                )

        if destination_engine.dialect.name == "postgresql":
            for table in ("users", "oauth_accounts"):
                connection.execute(
                    text(
                        "SELECT setval(pg_get_serial_sequence(:table_name, 'id'), "
                        f"COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM {table}"
                    ),
                    {"table_name": table},
                )

        imported_counts = _destination_counts(connection)
        if imported_counts != {table: len(records) for table, records in rows.items()}:
            raise ValueError("The destination row counts do not match the source.")
        _verify_destination(connection)

    return {table: len(records) for table, records in rows.items()}


def main():
    parser = argparse.ArgumentParser(
        description="Import account data from a read-only SQLite backup into PostgreSQL."
    )
    parser.add_argument("--source", required=True, help="Path to a SQLite backup file.")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        parser.error("Set DATABASE_URL to the PostgreSQL destination.")
    try:
        parsed_url = make_url(database_url)
    except (TypeError, ValueError):
        parser.error("DATABASE_URL is not a valid database URL.")
    if parsed_url.drivername not in {
        "postgres",
        "postgresql",
        "postgresql+psycopg",
        "postgresql+psycopg2",
    }:
        parser.error("DATABASE_URL must target PostgreSQL.")
    parsed_url = parsed_url.set(drivername="postgresql+psycopg")

    engine = create_engine(parsed_url, pool_pre_ping=True, pool_timeout=30)
    try:
        imported = migrate_data(args.source, engine)
    except Exception as error:
        print(
            "Migration failed; the destination transaction was rolled back. "
            f"Imported: 0; skipped: 0; errors: 1 ({type(error).__name__}).",
            file=sys.stderr,
        )
        return 1
    finally:
        engine.dispose()

    for table, count in imported.items():
        print(f"{table}: imported={count} skipped=0 errors=0")
    print("Migration complete: imported all rows; skipped=0 errors=0.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
