import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. Set these in Vercel project settings.'
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false },
  });

  return cached;
}

/**
 * Look up a project by its slug and return the uuid.
 * Throws with a clear error if not found.
 */
export async function resolveProjectId(
  supabase: SupabaseClient,
  slug: string
): Promise<string> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw new Error(`DB error resolving project '${slug}': ${error.message}`);
  if (!data) throw new Error(`Project not found: '${slug}'. Use list_projects to see available slugs.`);

  return data.id;
}
