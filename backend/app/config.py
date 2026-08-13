"""
|| App_Configuration || —> reads from .env (Environment_Variables).
No Hardcoded Credentials within this File ...
"""

from urllib.parse import urlparse
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # MySQL--Conf.
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = ""
    mysql_database: str = "sikkim_tourism"
    mysql_ssl_ca: str = "certs/ca.pem"

    # Gemini_AI--Conf.
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # Embedding_Model_AI--Conf.
    gemini_embedding_model: str = "models/gemini-embedding-001"

    # Groq_AI--Conf.
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_fallback_model: str = "llama-3.1-8b-instant"

    # Prompt_Guard--Conf.
    enable_prompt_guard: bool = False
    prompt_guard_model: str = "meta-llama/llama-prompt-guard-2-86m"

    # Tavily_AI_Web_Search--Conf.
    tavily_api_key: str = ""

    # Follow_Up_Suggestions--Conf.
    enable_followups: bool = False

    # Vector_Store--Conf.
    qdrant_url: str = ""
    qdrant_api_key: str = ""
    qdrant_collection: str = "sikkim_destinations"

    # Cross_Origin_Resource_Sharing--Conf
    allowed_origins: str = "http://localhost:5173"
    allowed_methods: str = "GET, POST, PUT, DELETE, OPTIONS"
    allowed_headers: str = "Content-Type, Authorization, X-Admin-Key, X-Conversation-Token"

    # Circular_Scraper--Conf.
    circulars_allowed_host: str = "sikkimtourism.gov.in"
    circulars_notice_url: str = "https://sikkimtourism.gov.in/updates/notice"
    circulars_sync_interval_minutes: int = 45
    circulars_max_pdf_bytes: int = 15 * 1024 * 1024
    circulars_max_per_run: int = 20
    enable_circular_scraper: bool = False

    # Restricted_File_Uploads--Conf.
    max_admin_upload_request_bytes: int = 16 * 1024 * 1024
    max_chat_request_bytes: int = 6 * 1024 * 1024

    # Administrator_Authentication--Conf.
    admin_api_key: str = ""

    # Runtime--Conf.
    environment: str = "development"

    # Environment_Normalizer--Validator
    @field_validator("environment", mode="before")
    @classmethod
    def normalise_environment(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError("ENVIRONMENT, must be of 'string' type.")
        value = value.strip().lower()
        if value not in {"development", "production"}:
            raise ValueError("ENVIRONMENT, must be either 'development' or 'production'. ")
        return value

    # Allowed_Origins--Validator
    @field_validator("allowed_origins", mode="before")
    @classmethod
    def normalise_allowed_origins(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError("ALLOWED_ORIGINS must be a comma-separated string")
        return ",".join(origin.strip() for origin in value.split(",") if origin.strip())

    # Database_Mode--Validator
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

    # Origins_List--Validator
    @property
    def origins_list(self) -> list[str]:
        if self.allowed_origins == "*":
            import logging
            logging.warning("Allowed Origins is set to '*', which allows all origins. This may pose security risk in production.")
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    # HTTP_Methods--Validator
    @property
    def methods_list(self) -> list[str]:
        methods = [m.strip().upper() for m in self.allowed_methods.split(",") if m.strip()]
        allowed = {"GET", "POST", "PUT", "DELETE", "OPTIONS"}
        if any(method not in allowed for method in methods):
            raise ValueError("ALLOWED_METHODS contains an unsupported HTTP method.")
        return methods

    # HTTP_Headers--Validator
    @property
    def headers_list(self) -> list[str]:
        return [h.strip() for h in self.allowed_headers.split(",") if h.strip()]

    # Qdrant_Mode--Validator
    @property
    def qdrant_mode(self) -> str:
        return "Remote_Qdrant" if self.qdrant_url else "Local_Qdrant"

    # CORS_&_HTTPS--Validator
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
