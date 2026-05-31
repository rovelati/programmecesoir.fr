#!/usr/bin/env python3
"""
Migrate the sister sites dataset into the new Supabase Postgres database.

Source projects:
- programmecesoir.fr / 123programmitv.it shared Supabase project
- fernsehheute.de dedicated Supabase project

Target project:
- credentials parsed from ../nuovo-supabase.md
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import psycopg2
from psycopg2 import sql
from psycopg2.extras import Json, execute_values
from dotenv import dotenv_values
from supabase import create_client


ROOT = Path(__file__).resolve().parents[1]
TARGET_MD = ROOT / "nuovo-supabase.md"
TARGET_SQL = Path(__file__).with_name("setup_unified_supabase.sql")
PAGE_SIZE = 1000
INSERT_BATCH_SIZE = 500


@dataclass(frozen=True)
class SourceConfig:
    label: str
    env_path: Path
    tables: List[str]


SOURCES = [
    SourceConfig(
        label="it-fr-shared",
        env_path=ROOT / "scripts" / ".env.backup-20260319",
        tables=["channels", "programs", "channels_fr", "programs_fr", "import_status"],
    ),
    SourceConfig(
        label="de-dedicated",
        env_path=ROOT.parent / "fernsehheute.de" / "scripts" / ".env.backup-20260319",
        tables=["channels_de", "programs_de", "content_enrichment_de", "import_status"],
    ),
]

TRUNCATE_ORDER = [
    "content_enrichment_de",
    "programs_de",
    "channels_de",
    "programs_fr",
    "channels_fr",
    "programs",
    "channels",
    "import_status",
]

SEQUENCE_TABLES = {
    "channels": "id",
    "channels_fr": "id",
    "channels_de": "id",
    "programs_de": "id",
    "content_enrichment_de": "id",
}

PROGRAM_CHANNEL_TABLES = {
    "programs_de": "channels_de",
}

PROGRAM_TABLES = set(PROGRAM_CHANNEL_TABLES.keys())
KEYSET_PROGRAM_TABLES = {"programs_de"}


def parse_target_database_url(md_path: Path) -> str:
    content = md_path.read_text(encoding="utf-8")
    password_match = re.search(r"database password:(.+)", content)
    url_match = re.search(r"(postgresql://[^\s]+)", content)
    if not password_match or not url_match:
        raise RuntimeError(f"Unable to parse target credentials from {md_path}")
    password = password_match.group(1).strip()
    url_template = url_match.group(1).strip()
    return url_template.replace("[YOUR-PASSWORD]", password)


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def get_source_client(env_path: Path):
    config = dotenv_values(env_path)
    url = config.get("SUPABASE_URL")
    key = config.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError(f"Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in {env_path}")
    return create_client(url, key)


def load_table_metadata(client, table: str) -> tuple[List[str], int, Optional[str]]:
    count_res = client.table(table).select("*", count="exact", head=True).execute()
    total = count_res.count or 0
    if total == 0:
        return [], 0, None

    sample = client.table(table).select("*").limit(1).execute().data
    if not sample:
        return [], 0, None

    columns = list(sample[0].keys())
    preferred_order = ["id", "channel_id", "updated_at", "created_at", "title"]
    order_by = next((col for col in preferred_order if col in columns), None)
    return columns, total, order_by


def normalize_value(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return Json(value)
    return value


def insert_rows(conn, table: str, columns: List[str], rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return

    rows = filter_rows_for_target(conn, table, rows)
    if not rows:
        return

    ensure_channel_references(conn, table, rows)

    column_sql = ", ".join(quote_ident(col) for col in columns)
    query = f"INSERT INTO {quote_ident(table)} ({column_sql}) VALUES %s"

    values = []
    for row in rows:
        values.append(tuple(normalize_value(row.get(col)) for col in columns))

    with conn.cursor() as cur:
        execute_values(cur, query, values, page_size=INSERT_BATCH_SIZE)


def filter_rows_for_target(conn, table: str, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if table != "content_enrichment_de":
        return rows

    program_ids = sorted({row.get("program_id") for row in rows if row.get("entity_kind") == "program" and row.get("program_id") is not None})
    if not program_ids:
        return rows

    with conn.cursor() as cur:
        cur.execute("SELECT id FROM programs_de WHERE id = ANY(%s)", (program_ids,))
        valid_program_ids = {row[0] for row in cur.fetchall()}

    filtered = []
    skipped = 0
    for row in rows:
        if row.get("entity_kind") == "program":
            program_id = row.get("program_id")
            if program_id not in valid_program_ids:
                skipped += 1
                continue
        filtered.append(row)

    if skipped:
        print(f"[migration] content_enrichment_de: skipped {skipped} rows with missing programs_de references")

    return filtered


def ensure_channel_references(conn, table: str, rows: List[Dict[str, Any]]) -> None:
    channels_table = PROGRAM_CHANNEL_TABLES.get(table)
    if not channels_table:
        return

    channel_ids = sorted({str(row.get("channel_id") or "").strip() for row in rows if row.get("channel_id")})
    if not channel_ids:
        return

    with conn.cursor() as cur:
        cur.execute(
            sql.SQL("SELECT channel_id FROM {} WHERE channel_id = ANY(%s)").format(sql.Identifier(channels_table)),
            (channel_ids,),
        )
        existing = {row[0] for row in cur.fetchall()}

        missing = [(channel_id, channel_id) for channel_id in channel_ids if channel_id not in existing]
        if not missing:
            return

        insert_query = sql.SQL(
            "INSERT INTO {} (channel_id, name) VALUES %s ON CONFLICT (channel_id) DO NOTHING"
        ).format(sql.Identifier(channels_table))
        execute_values(cur, insert_query.as_string(cur), missing, page_size=INSERT_BATCH_SIZE)


def fetch_page(client, table: str, start: int, end: int, order_by: Optional[str]):
    query = client.table(table).select("*")
    if order_by:
        query = query.order(order_by)
    return query.range(start, end).execute().data or []


def get_program_date_bounds(client, table: str) -> tuple[date, date]:
    first = client.table(table).select("date").order("date").limit(1).execute().data or []
    last = client.table(table).select("date").order("date", desc=True).limit(1).execute().data or []
    if not first or not last:
        raise RuntimeError(f"Unable to determine date bounds for {table}")
    return date.fromisoformat(first[0]["date"]), date.fromisoformat(last[0]["date"])


def truncate_target(conn) -> None:
    tables = ", ".join(quote_ident(name) for name in TRUNCATE_ORDER)
    with conn.cursor() as cur:
        cur.execute(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE")


def reset_sequences(conn) -> None:
    with conn.cursor() as cur:
        for table, column in SEQUENCE_TABLES.items():
            cur.execute(
                """
                SELECT pg_get_serial_sequence(%s, %s)
                """,
                (table, column),
            )
            sequence_name = cur.fetchone()[0]
            if not sequence_name:
                continue
            cur.execute(
                sql.SQL(
                    """
                    SELECT setval(
                        %s,
                        COALESCE((SELECT MAX({column}) FROM {table}), 1),
                        EXISTS (SELECT 1 FROM {table})
                    )
                    """
                ).format(
                    table=sql.Identifier(table),
                    column=sql.Identifier(column),
                ),
                (sequence_name,),
            )


def newer_status_row(current: Optional[Dict[str, Any]], candidate: Dict[str, Any]) -> Dict[str, Any]:
    if current is None:
        return candidate

    def parse_timestamp(row: Dict[str, Any]) -> datetime:
        raw = row.get("updated_at") or row.get("finished_at") or row.get("last_run_at") or row.get("started_at")
        if not raw:
            return datetime.min
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))

    return candidate if parse_timestamp(candidate) >= parse_timestamp(current) else current


def migrate_source_table(conn, client, source_label: str, table: str, import_status_rows: Dict[str, Dict[str, Any]]) -> int:
    columns, total, order_by = load_table_metadata(client, table)
    if total == 0:
        print(f"[{source_label}] {table}: empty")
        return 0

    print(f"[{source_label}] {table}: migrating {total} rows")
    moved = 0
    if table in PROGRAM_TABLES:
        if table in KEYSET_PROGRAM_TABLES:
            last_id = 0
            while True:
                query = client.table(table).select("*").gt("id", last_id).order("id").limit(PAGE_SIZE)
                rows = query.execute().data or []
                if not rows:
                    break
                insert_rows(conn, table, columns, rows)
                conn.commit()
                moved += len(rows)
                last_id = rows[-1]["id"]
                print(f"[{source_label}] {table}: {moved}/{total}")
            return moved

        min_date, max_date = get_program_date_bounds(client, table)
        current_date = min_date
        while current_date <= max_date:
            offset = 0
            while True:
                end = offset + PAGE_SIZE - 1
                query = client.table(table).select("*").eq("date", current_date.isoformat())
                if order_by:
                    query = query.order(order_by)
                rows = query.range(offset, end).execute().data or []
                if not rows:
                    break
                insert_rows(conn, table, columns, rows)
                conn.commit()
                moved += len(rows)
                print(f"[{source_label}] {table}: {moved}/{total}")
                if len(rows) < PAGE_SIZE:
                    break
                offset += PAGE_SIZE
            current_date += timedelta(days=1)
    else:
        for start in range(0, total, PAGE_SIZE):
            end = min(start + PAGE_SIZE - 1, total - 1)
            rows = fetch_page(client, table, start, end, order_by)
            if not rows:
                break
            if table == "import_status":
                for row in rows:
                    row_id = row["id"]
                    import_status_rows[row_id] = newer_status_row(import_status_rows.get(row_id), row)
            else:
                insert_rows(conn, table, columns, rows)
                conn.commit()
                moved += len(rows)
            print(f"[{source_label}] {table}: {min(end + 1, total)}/{total}")
    return moved


def apply_schema(conn) -> None:
    schema_sql = TARGET_SQL.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(schema_sql)


def insert_import_status(conn, rows: Iterable[Dict[str, Any]]) -> None:
    rows = list(rows)
    if not rows:
        return
    columns = list(rows[0].keys())
    column_sql = ", ".join(quote_ident(col) for col in columns)
    updates = ", ".join(f"{quote_ident(col)} = EXCLUDED.{quote_ident(col)}" for col in columns if col != "id")
    query = (
        f"INSERT INTO {quote_ident('import_status')} ({column_sql}) VALUES %s "
        f"ON CONFLICT ({quote_ident('id')}) DO UPDATE SET {updates}"
    )
    values = [tuple(normalize_value(row.get(col)) for col in columns) for row in rows]
    with conn.cursor() as cur:
        execute_values(cur, query, values, page_size=INSERT_BATCH_SIZE)


def verify_counts(conn) -> None:
    print("\nTarget counts:")
    with conn.cursor() as cur:
        for table in [
            "channels",
            "programs",
            "channels_fr",
            "programs_fr",
            "channels_de",
            "programs_de",
            "content_enrichment_de",
            "import_status",
        ]:
            cur.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table)))
            count = cur.fetchone()[0]
            print(f"  {table}: {count}")


def main() -> int:
    target_url = parse_target_database_url(TARGET_MD)
    print(f"Connecting to target database from {TARGET_MD}")

    with psycopg2.connect(target_url) as conn:
        conn.autocommit = False
        apply_schema(conn)
        truncate_target(conn)

        import_status_rows: Dict[str, Dict[str, Any]] = {}
        for source in SOURCES:
            client = get_source_client(source.env_path)
            for table in source.tables:
                migrate_source_table(conn, client, source.label, table, import_status_rows)

        insert_import_status(conn, import_status_rows.values())
        reset_sequences(conn)
        conn.commit()
        verify_counts(conn)

    print("\nMigration completed successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
