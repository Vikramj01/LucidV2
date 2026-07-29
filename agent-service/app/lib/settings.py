from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    anthropic_api_key: str
    openai_api_key: str
    firecrawl_api_key: str
    upstash_redis_url: str
    upstash_redis_token: str
    port: int = 8000
    # Backend-internal endpoint for fetching a live, refreshed OAuth token
    # for a workspace integration (Google Drive / Notion). Agent-service
    # never holds OAuth client secrets — backend owns the OAuth handshake
    # and token refresh; this is a service-to-service call, not user-facing.
    backend_internal_url: str = ""
    internal_api_key: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()  # type: ignore[call-arg]
