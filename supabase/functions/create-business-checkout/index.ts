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

const stripeRequest = async (path: string, init: RequestInit) => {
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

  if (!stripeSecretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }

  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(init.headers ?? {}),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? 'Stripe request failed');
  }

  return data;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripePriceId = Deno.env.get('STRIPE_BUSINESS_PRICE_ID');
    const appUrl = Deno.env.get('APP_URL') ?? request.headers.get('origin') ?? 'http://localhost:3000';

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !stripePriceId) {
      return json({ error: 'Missing Supabase or Stripe configuration.' }, 500);
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization header.' }, 401);
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
      return json({ error: 'You must be signed in to subscribe.' }, 401);
    }

    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('subscription_status, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.subscription_status === 'active') {
      return json({ alreadyActive: true });
    }

    let customerId = profile?.stripe_customer_id ?? null;

    if (!customerId) {
      const customerParams = new URLSearchParams();
      customerParams.set('email', user.email ?? '');
      customerParams.set('name', user.user_metadata?.full_name ?? user.user_metadata?.name ?? 'LiveDrop Business');
      customerParams.set('metadata[supabase_user_id]', user.id);

      const customer = await stripeRequest('customers', {
        method: 'POST',
        body: customerParams.toString(),
      });

      customerId = customer.id as string;
    }

    await adminSupabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email,
        display_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? 'LiveDrop User',
        avatar_url: user.user_metadata?.avatar_url ?? null,
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    const sessionParams = new URLSearchParams();
    sessionParams.set('mode', 'subscription');
    sessionParams.set('success_url', `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    sessionParams.set('cancel_url', `${appUrl}/?checkout=cancel`);
    sessionParams.set('line_items[0][price]', stripePriceId);
    sessionParams.set('line_items[0][quantity]', '1');
    sessionParams.set('customer', customerId);
    sessionParams.set('client_reference_id', user.id);
    sessionParams.set('allow_promotion_codes', 'true');
    sessionParams.set('metadata[supabase_user_id]', user.id);
    sessionParams.set('metadata[plan_id]', 'business_monthly');
    sessionParams.set('subscription_data[metadata][supabase_user_id]', user.id);
    sessionParams.set('subscription_data[metadata][plan_id]', 'business_monthly');

    const checkoutSession = await stripeRequest('checkout/sessions', {
      method: 'POST',
      body: sessionParams.toString(),
    });

    return json({
      url: checkoutSession.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create checkout session.';
    return json({ error: message }, 500);
  }
});
