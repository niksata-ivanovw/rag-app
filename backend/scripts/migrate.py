"""
scripts/migrate.py - applies the SQL files in backend/migrations/ in order.

Each file runs in its own transaction and is recorded in `schema_migrations`,
so it is applied exactly once. Re-running the script only applies new files.

Usage:
    python scripts/migrate.py            # apply pending migrations
    python scripts/migrate.py --status   # list applied / pending, change nothing
"""
import argparse
import sys
from pathlib import Path

import psycopg2

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from app.dependencies import DB_CONFIG  # noqa: E402

MIGRATIONS_DIR = PROJECT_ROOT / "migrations"
LOCK_ID = 7_243_001  # pg_advisory_lock key, so two runs can't apply migrations at the same time


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.sql"))


def applied_versions(cur) -> set[str]:
    cur.execute("SELECT version FROM schema_migrations")
    return {row[0] for row in cur.fetchall()}


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply database migrations.")
    parser.add_argument("--status", action="store_true", help="only show which migrations are applied")
    args = parser.parse_args()

    conn = psycopg2.connect(**DB_CONFIG)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version    TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            conn.commit()

            cur.execute("SELECT pg_advisory_lock(%s)", (LOCK_ID,))
            try:
                done = applied_versions(cur)
                pending = [f for f in migration_files() if f.stem not in done]

                for f in migration_files():
                    print(f"  [{'x' if f.stem in done else ' '}] {f.name}")
                if args.status or not pending:
                    print("Nothing to apply." if not pending else f"{len(pending)} pending.")
                    return 0

                for f in pending:
                    print(f"Applying {f.name} ...", end=" ", flush=True)
                    try:
                        cur.execute(f.read_text(encoding="utf-8"))
                        cur.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (f.stem,))
                        conn.commit()
                    except Exception:
                        conn.rollback()
                        print("FAILED (rolled back)")
                        raise
                    print("ok")
                return 0
            finally:
                cur.execute("SELECT pg_advisory_unlock(%s)", (LOCK_ID,))
                conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
