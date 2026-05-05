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

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()  # type: ignore[call-arg]
