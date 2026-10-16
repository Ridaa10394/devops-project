"""Block until the database accepts connections (used by the k8s initContainer
and the container entrypoint), so migrations don't crash-loop while Postgres boots."""

import sys
import time

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

from .config import settings


def main(attempts: int = 30, delay: float = 2.0) -> int:
    engine = create_engine(settings.sqlalchemy_url, pool_pre_ping=True)
    for i in range(1, attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print(f"database reachable after {i} attempt(s)")
            return 0
        except OperationalError as exc:
            reason = str(exc.orig).strip().splitlines()[0] if exc.orig else exc.__class__.__name__
            print(f"[{i}/{attempts}] database not ready: {reason}")
            time.sleep(delay)
    print("giving up: database never became reachable")
    return 1


if __name__ == "__main__":
    sys.exit(main())
