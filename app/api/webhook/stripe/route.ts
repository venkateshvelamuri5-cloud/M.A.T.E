import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../src/supabase-client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'mock-key', {
  apiVersion: '2024-04-10' as any,
});

/**
 * POST endpoint for Stripe Webhook
 * Processes subscription invoice payments and toggles premium plans in Supabase
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    // 1. Signature Verification
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      // Offline/simulation mode check if keys aren't set
      console.log('Skipping Stripe signature check (development webhook mode)');
      event = JSON.parse(body) as Stripe.Event;
    }

    console.log(`Stripe webhook event received: ${event.type}`);

    // 2. Event Routing
    switch (event.type) {
      case 'invoice.payment_succeeded':
      case 'customer.subscription.created': {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;
        
        // Retrieve email associated with the stripe customer or metadata payload
        const email = subscription.customer_email || subscription.metadata?.email;

        if (email) {
          console.log(`Upgrading limits for subscriber: ${email}`);

          // Fetch user profile from Supabase
          const { data: profile, error: queryErr } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();

          if (queryErr) {
            console.error('Failed to locate profile for payment webhook:', queryErr.message);
          }

          if (profile) {
            // Update profile plan to premium
            await supabase
              .from('profiles')
              .update({
                subscription_plan: 'premium',
                stripe_customer_id: customerId,
                stripe_subscription_id: subscription.id
              })
              .eq('id', profile.id);

            // Set new high interactions capacity
            await supabase
              .from('usage_limits')
              .update({
                max_interactions: 5000
              })
              .eq('user_id', profile.id);

            console.log(`Successfully upgraded user workspace to Premium Command Plan.`);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        const email = subscription.customer_email || subscription.metadata?.email;

        if (email) {
          console.log(`Downgrading limits for user (canceled subscription): ${email}`);
          
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();

          if (profile) {
            // Revert back to community version
            await supabase
              .from('profiles')
              .update({
                subscription_plan: 'free',
                stripe_subscription_id: null
              })
              .eq('id', profile.id);

            // Revert limits back to 10
            await supabase
              .from('usage_limits')
              .update({
                max_interactions: 10
              })
              .eq('user_id', profile.id);
            
            console.log(`Subscription deleted. User reverted to community pilot tier.`);
          }
        }
        break;
      }
    }

    return NextResponse.json({ received: true });

  } catch (err) {
    console.error('Stripe webhook processing error:', err);
    return NextResponse.json({ error: 'Webhook Error', details: (err as Error).message }, { status: 400 });
  }
}
