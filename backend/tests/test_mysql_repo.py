import logging

import mysql.connector

from app.database.mysql_repo import MySQLRepository


def test_mysql_connection_close_failure_is_non_fatal(caplog):
    class BrokenConnection:
        def close(self):
            raise mysql.connector.InterfaceError(errno=2013)

    caplog.set_level(logging.WARNING)

    MySQLRepository._close_connection(BrokenConnection())

    assert "Ignoring MySQL connection close/reset failure" in caplog.text
