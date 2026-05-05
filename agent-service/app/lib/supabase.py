from supabase import create_client, Client
from app.lib.settings import settings

# Service role — intentional RLS bypass; all writes must include workspace_id
def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
