import Stripe from 'stripe';
import { config } from '../config/env';
import { userModel } from '../db/users';

let stripe: Stripe | null = null;

function getStripe(): Stripe | null {
    if (stripe) return stripe;

    // access config freshly
    if (config.stripeSecretKey) {
        stripe = new Stripe(config.stripeSecretKey, {
            apiVersion: '2024-12-18.acacia' as any,
        });
        return stripe;
    }
    return null;
}

export const PACKS = {
    SMALL: {
        id: 'small',
        name: 'Pack 1: 50 Credits',
        credits: config.smallPackCredits,
        priceId: config.smallPackPriceId || 'price_small_placeholder' // We'll user helper to create ad-hoc price if needed or assume manually created
    },
    LARGE: {
        id: 'large',
        name: 'Pack 2: 200 Credits',
        credits: config.largePackCredits,
        priceId: config.largePackPriceId || 'price_large_placeholder'
    }
};

export const paymentService = {
    /**
     * Creates a Stripe Checkout Session for a one-time payment.
     * We pass the telegram_id in metadata to fulfill the order later.
     */
    createCheckoutSession: async (telegramId: string, packId: 'small' | 'large') => {
        const pack = PACKS[packId.toUpperCase() as keyof typeof PACKS];
        if (!pack) throw new Error('Invalid pack selected');

        // Note: In a real app with Price IDs from env, use `price: pack.priceId`
        // consistently. For this demo, we can also use ad-hoc line items if no price ID is set.

        const line_items = [];
        if (pack.priceId.includes('placeholder')) {
            // Fallback to ad-hoc price data if no real price ID is configured
            line_items.push({
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: pack.name,
                    },
                    unit_amount: packId === 'small' ? 500 : 1500, // $5.00 or $15.00 example
                },
                quantity: 1,
            });
        } else {
            line_items.push({
                price: pack.priceId,
                quantity: 1,
            });
        }

        const stripeInstance = getStripe();
        if (!stripeInstance) {
            console.error("Stripe Key missing in config:", config.stripeSecretKey ? "No" : "Yes");
            throw new Error('Stripe is not configured (missing API Key).');
        }

        const session = await stripeInstance.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: line_items,
            mode: 'payment',
            metadata: {
                telegram_id: telegramId,
                credits: pack.credits.toString()
            },
            success_url: 'https://t.me/avatarelitebot?start=payment_success',
            cancel_url: 'https://t.me/avatarelitebot?start=payment_cancel',
        });

        return session.url;
    },

    /**
     * Handles webhook events from Stripe.
     * Verifies the signature and processes checkout.session.completed
     */
    handleWebhook: async (body: any, signature: string) => {
        const stripeInstance = getStripe();
        if (!stripeInstance) {
            throw new Error('Stripe is not configured.');
        }

        let event: Stripe.Event;

        try {
            event = stripeInstance.webhooks.constructEvent(body, signature, config.stripeWebhookSecret);
        } catch (err: any) {
            console.error(`Webhook signature verification failed: ${err.message}`);
            throw new Error(`Webhook Error: ${err.message}`);
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;
            const telegramId = session.metadata?.telegram_id;
            const credits = parseInt(session.metadata?.credits || '0', 10);

            if (telegramId && credits > 0) {
                console.log(`Payment successful for user ${telegramId}. Adding ${credits} credits.`);
                userModel.addCredits(telegramId, credits);
                // Optionally send a notification to the user via the bot if we had the bot instance accessible here
                // For now, next time they check /credits it will be there.
            } else {
                console.error('Missing metadata in checkout session', session.id);
            }
        }

        return { received: true };
    }
};
