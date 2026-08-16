// _shared/supabase.ts — single indirection point for the supabase-js client.
// The `npm:` specifier is resolved by the Supabase Edge Runtime (Deno) and
// aliased to the fake client by the Node smoke harness (build.cjs).

import { createClient } from 'npm:@supabase/supabase-js'
import type { SupabaseClient } from 'npm:@supabase/supabase-js'

export { createClient }
export type { SupabaseClient }
