import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-04-10' as any,
});

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // 1. Create a checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'M.A.T.E Command Plan (Premium)',
              description: 'Upgrades storage limits to 5GB and unlocks 5000 monthly validation interactions.',
            },
            unit_amount: 2900, // $29.00
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.nextUrl.origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.nextUrl.origin}/dashboard`,
      metadata: {
        email: email,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Error creating Stripe Checkout Session:', error);
    return NextResponse.json({ error: 'Failed to create session', details: (error as Error).message }, { status: 500 });
  }
}
