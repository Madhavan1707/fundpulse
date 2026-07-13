// FundPulse — delete-account Edge Function
//
// Deletes the calling user's data AND their auth account (which the
// browser cannot do — auth.admin requires the service role key).
//
// Deploy once (from repo root, needs Supabase CLI + `supabase login`):
//   supabase link --project-ref acwrtldncexhhlzutppv
//   supabase functions deploy delete-account
//
// No secrets to configure: SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are injected automatically by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Identify the caller from their own JWT — a user can only delete themselves.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Data rows first (alert_log also cascades from the auth user delete,
  // but explicit deletes keep this correct even if FKs change later).
  await admin.from('watchlist').delete().eq('user_id', user.id);
  await admin.from('alert_config').delete().eq('user_id', user.id);
  await admin.from('alert_log').delete().eq('user_id', user.id);
  await admin.from('profiles').delete().eq('id', user.id);

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
