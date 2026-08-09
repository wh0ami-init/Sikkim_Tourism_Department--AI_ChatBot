"""
Repository factory — returns the MySQL-backed repository.

Import `get_repo` wherever you need data access. The rest of the app never
imports MySQLRepository directly, so swapping in a different backend later
is still a one-file change.
"""
from __future__ import annotations

from functools import lru_cache

from app.config import settings
from app.database.base import BaseRepository


@lru_cache(maxsize=1)
def get_repo() -> BaseRepository:
    from app.database.mysql_repo import MySQLRepository
    return MySQLRepository(
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        database=settings.mysql_database,
        ssl_ca=settings.mysql_ssl_ca_path,
        require_tls=settings.mysql_host not in {"localhost", "127.0.0.1", "::1"},
    )