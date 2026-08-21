"""Application settings loaded from environment variables and ``.env``."""

from urllib.parse import urlparse
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """Runtime settings with production safety checks."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # MySQL connection
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = ""
    mysql_database: str = "sikkim_tourism"
    mysql_ssl_ca: str = "certs/ca.pem"
    mysql_pool_size: int = Field(default=10, ge=2, le=32)

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"

    # Embedding model
    gemini_embedding_model: str = "models/gemini-embedding-001"

    # Groq
    groq_api_key: str = ""
    # Supported Groq production models. GPT-OSS 20B is the fast default for
    # concise, retrieval-grounded visitor answers; 120B remains the fallback.
    groq_model: str = "openai/gpt-oss-20b"
    groq_fallback_model: str = "openai/gpt-oss-120b"
    # Tourism questions are usually factual and retrieval-grounded. Low
    # reasoning sharply improves time-to-first-answer without weakening the
    # official-record checks performed by this application.
    groq_reasoning_effort: Literal["low", "medium", "high"] = "low"
    groq_max_tokens: int = Field(default=900, ge=128, le=4096)

    # Prompt guard
    enable_prompt_guard: bool = False
    prompt_guard_model: str = "meta-llama/llama-prompt-guard-2-86m"

    # Optional web search
    tavily_api_key: str = ""

    # Follow-up suggestions
    enable_followups: bool = False

    # Vector store
    qdrant_url: str = ""
    qdrant_api_key: str = ""
    qdrant_collection: str = "sikkim_destinations"

    # CORS
    allowed_origins: str = "http://localhost:5173"
    allowed_methods: str = "GET, POST, PUT, DELETE, OPTIONS"
    allowed_headers: str = "Content-Type, Authorization, X-Admin-Key, X-Conversation-Token"

    # Circular scraper
    circulars_allowed_host: str = "sikkimtourism.gov.in"
    circulars_notice_url: str = "https://sikkimtourism.gov.in/updates/notice"
    circulars_tender_url: str = "https://sikkimtourism.gov.in/updates/tender"
    circulars_sync_interval_minutes: int = Field(default=45, ge=1, le=24 * 60)
    circulars_max_pdf_bytes: int = Field(default=15 * 1024 * 1024, ge=1)
    circulars_max_per_run: int = Field(default=20, ge=1, le=100)
    enable_circular_scraper: bool = False

    # Request size limits
    max_admin_upload_request_bytes: int = Field(default=16 * 1024 * 1024, ge=1)
    max_chat_request_bytes: int = Field(default=6 * 1024 * 1024, ge=1)

    # Administrator authentication
    admin_api_key: str = ""

    # Runtime
    environment: str = "development"

    @field_validator("environment", mode="before")
    @classmethod
    def normalise_environment(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError("ENVIRONMENT must be a string.")
        value = value.strip().lower()
        if value not in {"development", "production"}:
            raise ValueError("ENVIRONMENT must be either 'development' or 'production'.")
        return value

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def normalise_allowed_origins(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError("ALLOWED_ORIGINS must be a comma-separated string")
        return ",".join(origin.strip() for origin in value.split(",") if origin.strip())

    @property
    def db_mode(self) -> str:
        """Database backend in use. MySQL is the only supported backend."""
        return "mysql"

    @property
    def mysql_ssl_ca_path(self) -> str:
        """Resolve the bundled CA path regardless of the process directory."""
        path = Path(self.mysql_ssl_ca)
        if not path.is_absolute():
            path = Path(__file__).resolve().parents[1] / path
        return str(path)

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def methods_list(self) -> list[str]:
        methods = [m.strip().upper() for m in self.allowed_methods.split(",") if m.strip()]
        allowed = {"GET", "POST", "PUT", "DELETE", "OPTIONS"}
        if any(method not in allowed for method in methods):
            raise ValueError("ALLOWED_METHODS contains an unsupported HTTP method.")
        return methods

    @property
    def headers_list(self) -> list[str]:
        return [h.strip() for h in self.allowed_headers.split(",") if h.strip()]

    @property
    def qdrant_mode(self) -> str:
        return "Remote_Qdrant" if self.qdrant_url else "Local_Qdrant"

    @model_validator(mode="after")
    def validate_production_security(self):
        """Reject unsafe browser-access and official-scraper settings."""
        if self.environment == "production" and self.allowed_origins == "*":
            raise ValueError("ALLOWED_ORIGINS cannot be '*' in production. Please specify explicit origins.")

        if self.environment == "production" and not self.origins_list:
            raise ValueError("ALLOWED_ORIGINS must contain at least one explicit origin in production.")

        if self.environment == "production" and any(not origin.startswith("https://") for origin in self.origins_list):
            raise ValueError("In production, all allowed origins must use 'HTTPS' for security reasons.")

        if self.environment == "production" and (
                "*" in self.methods_list or "*" in self.headers_list
        ):
            raise ValueError("Wildcard CORS methods or headers are not allowed in production.")

        if self.environment == "production" and len(self.admin_api_key) < 32:
            raise ValueError(
                "ADMIN_API_KEY must contain at least 32 characters in production."
            )

        if self.max_admin_upload_request_bytes < self.circulars_max_pdf_bytes:
            raise ValueError("MAX_ADMIN_UPLOAD_REQUEST_BYTES must be at least CIRCULARS_MAX_PDF_BYTES.")
        if self.max_chat_request_bytes < 5_600_000:
            raise ValueError("MAX_CHAT_REQUEST_BYTES must allow the maximum validated chat payload.")
        if self.mysql_host not in {"localhost", "127.0.0.1", "::1"}:

            if not Path(self.mysql_ssl_ca_path).is_file():
                raise ValueError("MYSQL_SSL_CA must point to a CA certificate for remote MySQL.")

        if self.circulars_allowed_host != "sikkimtourism.gov.in":
            raise ValueError("CIRCULARS_ALLOWED_HOST must be sikkimtourism.gov.in.")
        notice_url = urlparse(self.circulars_notice_url)
        if (
                notice_url.scheme != "https"
                or notice_url.hostname != "sikkimtourism.gov.in"
                or notice_url.port not in (None, 443)
                or notice_url.username
                or notice_url.password
        ):
            raise ValueError(
                "CIRCULARS_NOTICE_URL must be an HTTPS URL on sikkimtourism.gov.in."
            )
        return self


settings = Settings()

# ───────────────────────────────────────────────────────────
# ───────────────────────────────────────────────────────────
# ───────────────────────────────────────────────────────────
