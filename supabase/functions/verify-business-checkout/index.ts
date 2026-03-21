import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !stripeSecretKey) {
      return json({ error: 'Missing Supabase or Stripe configuration.' }, 500);
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization header.' }, 401);
    }

    const { sessionId } = await request.json();
    if (!sessionId) {
      return json({ error: 'Missing checkout session id.' }, 400);
    }

    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userSupabase.auth.getUser();

    if (userError || !user) {
      return json({ error: 'You must be signed in to verify checkout.' }, 401);
    }

    const stripeUrl = new URL(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`);
    stripeUrl.searchParams.set('expand[]', 'subscription');

    const stripeResponse = await fetch(stripeUrl.toString(), {
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
      },
    });

    const stripeSession = await stripeResponse.json();

    if (!stripeResponse.ok) {
      return json({ error: stripeSession?.error?.message ?? 'Could not verify checkout session.' }, 400);
    }

    if (stripeSession.client_reference_id !== user.id) {
      return json({ error: 'Checkout session does not belong to this user.' }, 403);
    }

    const subscription = typeof stripeSession.subscription === 'object' ? stripeSession.subscription : null;
    const subscriptionStatus = subscription?.status === 'active' ? 'active' : 'inactive';

    if (subscriptionStatus !== 'active') {
      return json({ error: 'Subscription is not active yet.' }, 400);
    }

    await adminSupabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email,
        display_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? 'LiveDrop User',
        avatar_url: user.user_metadata?.avatar_url ?? null,
        role: 'business',
        subscription_status: 'active',
        subscription_plan: subscription?.metadata?.plan_id ?? stripeSession.metadata?.plan_id ?? 'business_monthly',
        stripe_customer_id: stripeSession.customer ?? null,
        stripe_subscription_id: subscription?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    return json({
      success: true,
      role: 'business',
      subscriptionStatus: 'active',
      subscriptionPlan: subscription?.metadata?.plan_id ?? stripeSession.metadata?.plan_id ?? 'business_monthly',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify checkout session.';
    return json({ error: message }, 500);
  }
});
