from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional, Sequence, Tuple

import psycopg2
from psycopg2 import sql
from psycopg2.extras import Json, execute_values


@dataclass
class QueryResult:
    data: Optional[List[dict]] = None
    count: Optional[int] = None


def _normalize_value(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return Json(value)
    return value


def _collect_columns(rows: Sequence[dict]) -> List[str]:
    columns: List[str] = []
    seen = set()
    for row in rows:
        for key in row.keys():
            if key in seen:
                continue
            seen.add(key)
            columns.append(key)
    return columns


class PostgresQuery:
    def __init__(self, client: "PostgresClient", table: str):
        self.client = client
        self.table = table
        self.operation: Optional[str] = None
        self.selected_columns = "*"
        self.count_mode: Optional[str] = None
        self.head = False
        self.payload: Any = None
        self.conflict_column: Optional[str] = None
        self.filters: List[Tuple[str, str, Any]] = []
        self.order_by: List[Tuple[str, bool]] = []
        self.limit_value: Optional[int] = None
        self.offset_value: Optional[int] = None

    def select(self, columns: str = "*", count: Optional[str] = None, head: bool = False):
        self.operation = "select"
        self.selected_columns = columns or "*"
        self.count_mode = count
        self.head = head
        return self

    def insert(self, payload: Any):
        self.operation = "insert"
        self.payload = payload
        return self

    def upsert(self, payload: Any, on_conflict: str):
        self.operation = "upsert"
        self.payload = payload
        self.conflict_column = on_conflict
        return self

    def update(self, payload: dict):
        self.operation = "update"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def eq(self, column: str, value: Any):
        self.filters.append((column, "=", value))
        return self

    def lt(self, column: str, value: Any):
        self.filters.append((column, "<", value))
        return self

    def lte(self, column: str, value: Any):
        self.filters.append((column, "<=", value))
        return self

    def gt(self, column: str, value: Any):
        self.filters.append((column, ">", value))
        return self

    def gte(self, column: str, value: Any):
        self.filters.append((column, ">=", value))
        return self

    def in_(self, column: str, values: Sequence[Any]):
        self.filters.append((column, "IN", list(values)))
        return self

    def is_(self, column: str, value: Any):
        self.filters.append((column, "IS", value))
        return self

    def order(self, column: str, desc: bool = False, ascending: Optional[bool] = None):
        if ascending is not None:
            desc = not ascending
        self.order_by.append((column, desc))
        return self

    def limit(self, value: int):
        self.limit_value = value
        return self

    def range(self, start: int, end: int):
        self.offset_value = start
        self.limit_value = (end - start) + 1
        return self

    def execute(self) -> QueryResult:
        if self.operation == "select":
            return self._execute_select()
        if self.operation == "insert":
            return self._execute_insert()
        if self.operation == "upsert":
            return self._execute_upsert()
        if self.operation == "update":
            return self._execute_update()
        if self.operation == "delete":
            return self._execute_delete()
        raise RuntimeError(f"Unsupported operation: {self.operation}")

    def _table_identifier(self):
        return sql.Identifier(self.table)

    def _render_columns(self):
        if self.selected_columns.strip() == "*":
            return sql.SQL("*")
        columns = [sql.Identifier(col.strip()) for col in self.selected_columns.split(",") if col.strip()]
        return sql.SQL(", ").join(columns)

    def _build_where(self):
        if not self.filters:
            return sql.SQL(""), []

        fragments = []
        params: List[Any] = []
        for column, operator, value in self.filters:
            if operator == "IN":
                values = list(value or [])
                if not values:
                    fragments.append(sql.SQL("FALSE"))
                    continue
                placeholders = sql.SQL(", ").join(sql.Placeholder() for _ in values)
                fragments.append(
                    sql.SQL("{} IN ({})").format(sql.Identifier(column), placeholders)
                )
                params.extend(_normalize_value(item) for item in values)
            elif operator == "IS":
                normalized = str(value).strip().lower() if value is not None else "null"
                if normalized == "null":
                    fragments.append(sql.SQL("{} IS NULL").format(sql.Identifier(column)))
                elif normalized == "not null":
                    fragments.append(sql.SQL("{} IS NOT NULL").format(sql.Identifier(column)))
                else:
                    raise RuntimeError(f"Unsupported IS filter value: {value}")
            else:
                fragments.append(
                    sql.SQL("{} {} {}").format(
                        sql.Identifier(column),
                        sql.SQL(operator),
                        sql.Placeholder(),
                    )
                )
                params.append(_normalize_value(value))

        where_sql = sql.SQL(" WHERE ") + sql.SQL(" AND ").join(fragments)
        return where_sql, params

    def _build_order_limit(self):
        parts = []
        params: List[Any] = []

        if self.order_by:
            clauses = []
            for column, desc in self.order_by:
                direction = sql.SQL("DESC" if desc else "ASC")
                clauses.append(sql.SQL("{} {}").format(sql.Identifier(column), direction))
            parts.append(sql.SQL(" ORDER BY ") + sql.SQL(", ").join(clauses))

        if self.limit_value is not None:
            parts.append(sql.SQL(" LIMIT {}").format(sql.Literal(int(self.limit_value))))
        if self.offset_value is not None:
            parts.append(sql.SQL(" OFFSET {}").format(sql.Literal(int(self.offset_value))))

        return sql.SQL("").join(parts), params

    def _rows_to_dicts(self, cursor) -> List[dict]:
        rows = cursor.fetchall()
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in rows]

    def _execute_select(self) -> QueryResult:
        where_sql, params = self._build_where()
        order_limit_sql, extra_params = self._build_order_limit()
        params.extend(extra_params)

        if self.count_mode == "exact":
            count_query = sql.SQL("SELECT COUNT(*) FROM {}").format(self._table_identifier()) + where_sql
            with self.client.cursor() as cur:
                cur.execute(count_query, params)
                total = cur.fetchone()[0]
            if self.head:
                return QueryResult(data=[], count=total)
        else:
            total = None

        query = (
            sql.SQL("SELECT {} FROM {}").format(self._render_columns(), self._table_identifier())
            + where_sql
            + order_limit_sql
        )
        with self.client.cursor() as cur:
            cur.execute(query, params)
            data = self._rows_to_dicts(cur)
        return QueryResult(data=data, count=total)

    def _execute_insert(self) -> QueryResult:
        rows = self.payload if isinstance(self.payload, list) else [self.payload]
        if not rows:
            return QueryResult(data=[])

        columns = _collect_columns(rows)
        query = sql.SQL("INSERT INTO {} ({}) VALUES %s").format(
            self._table_identifier(),
            sql.SQL(", ").join(sql.Identifier(col) for col in columns),
        )
        values = [tuple(_normalize_value(row.get(col)) for col in columns) for row in rows]
        with self.client.cursor() as cur:
            execute_values(cur, query.as_string(cur), values, page_size=self.client.page_size)
        return QueryResult(data=[])

    def _execute_upsert(self) -> QueryResult:
        rows = self.payload if isinstance(self.payload, list) else [self.payload]
        if not rows:
            return QueryResult(data=[])
        if not self.conflict_column:
            raise RuntimeError("on_conflict is required for upsert")

        columns = _collect_columns(rows)
        conflict_columns = [col.strip() for col in str(self.conflict_column).split(",") if col.strip()]
        update_columns = [col for col in columns if col not in conflict_columns]
        if update_columns:
            update_sql = sql.SQL(", ").join(
                sql.SQL("{col} = EXCLUDED.{col}").format(col=sql.Identifier(col))
                for col in update_columns
            )
        else:
            update_sql = sql.SQL("NOTHING")

        query = sql.SQL(
            "INSERT INTO {} ({}) VALUES %s ON CONFLICT ({}) DO UPDATE SET {}"
        ).format(
            self._table_identifier(),
            sql.SQL(", ").join(sql.Identifier(col) for col in columns),
            sql.SQL(", ").join(sql.Identifier(col) for col in conflict_columns),
            update_sql,
        )

        values = [tuple(_normalize_value(row.get(col)) for col in columns) for row in rows]
        with self.client.cursor() as cur:
            execute_values(cur, query.as_string(cur), values, page_size=self.client.page_size)
        return QueryResult(data=[])

    def _execute_update(self) -> QueryResult:
        payload = self.payload or {}
        set_columns = list(payload.keys())
        set_sql = sql.SQL(", ").join(
            sql.SQL("{} = {}").format(sql.Identifier(column), sql.Placeholder())
            for column in set_columns
        )
        where_sql, where_params = self._build_where()
        params = [_normalize_value(payload.get(column)) for column in set_columns] + where_params
        query = sql.SQL("UPDATE {} SET {}").format(self._table_identifier(), set_sql) + where_sql
        with self.client.cursor() as cur:
            cur.execute(query, params)
        return QueryResult(data=[])

    def _execute_delete(self) -> QueryResult:
        where_sql, params = self._build_where()
        query = sql.SQL("DELETE FROM {}").format(self._table_identifier()) + where_sql
        with self.client.cursor() as cur:
            cur.execute(query, params)
            rowcount = cur.rowcount
        return QueryResult(data=[{}] * max(rowcount, 0), count=rowcount)


class PostgresClient:
    def __init__(self, dsn: str, page_size: int = 1000):
        self.dsn = dsn
        self.page_size = page_size
        self._conn = psycopg2.connect(dsn)
        self._conn.autocommit = True

    def cursor(self):
        return self._conn.cursor()

    def table(self, table_name: str) -> PostgresQuery:
        return PostgresQuery(self, table_name)

    def close(self):
        if self._conn and not self._conn.closed:
            self._conn.close()


def create_postgres_client(dsn: str, page_size: int = 1000) -> PostgresClient:
    return PostgresClient(dsn, page_size=page_size)
