from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool, text

from app import models  # noqa: F401  (registers the tables on Base.metadata)
from app.config import settings
from app.db import Base

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata

# Any constant works - it just has to be the same number in every replica.
MIGRATION_LOCK_ID = 4210394


def run_migrations_offline():
    context.configure(
        url=settings.sqlalchemy_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    # Build the engine straight from settings (not alembic.ini) so a password with
    # '%' or '@' in it does not get mangled by configparser interpolation.
    connectable = create_engine(settings.sqlalchemy_url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        is_pg = connection.dialect.name == "postgresql"
        if is_pg:
            # Two backend replicas start at the same time and both run
            # `alembic upgrade head`. The advisory lock makes the second one wait
            # instead of racing the first one into "relation already exists".
            connection.execute(text("SELECT pg_advisory_lock(:id)"), {"id": MIGRATION_LOCK_ID})
            connection.commit()
        try:
            context.configure(connection=connection, target_metadata=target_metadata)
            with context.begin_transaction():
                context.run_migrations()
        finally:
            if is_pg:
                connection.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": MIGRATION_LOCK_ID})
                connection.commit()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
