from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings, read from environment variables (or a local .env file).

    In Kubernetes the non-secret bits (host, port, db name) come from a ConfigMap
    and the credentials come from a Secret, so DATABASE_URL is normally *not* set
    there - it gets assembled from the parts below.
    """

    app_name: str = "StockSense API"
    app_version: str = "1.0.0"
    app_env: str = "local"

    database_url: str | None = None
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "stocksense"
    db_user: str = "stocksense"
    db_password: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{quote_plus(self.db_user)}:{quote_plus(self.db_password)}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


settings = Settings()
