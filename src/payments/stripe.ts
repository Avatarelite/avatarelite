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
    TIER_1: {
        id: 'tier_1',
        name: 'Pack 1: 25 Credits',
        credits: 25,
        priceId: 'price_tier_1_placeholder',
        amount: 500 // $5.00
    },
    TIER_2: {
        id: 'tier_2',
        name: 'Pack 2: 50 Credits',
        credits: 50,
        priceId: 'price_tier_2_placeholder',
        amount: 1000 // $10.00
    },
    TIER_3: {
        id: 'tier_3',
        name: 'Pack 3: 160 Credits',
        credits: 160,
        priceId: 'price_tier_3_placeholder',
        amount: 3000 // $30.00
    },
    TIER_4: {
        id: 'tier_4',
        name: 'Pack 4: 260 Credits',
        credits: 260,
        priceId: 'price_tier_4_placeholder',
        amount: 5000 // $50.00
    }
};

export const paymentService = {
    /**
     * Creates a Stripe Checkout Session for a one-time payment.
     * We pass the telegram_id in metadata to fulfill the order later.
     */
    createCheckoutSession: async (telegramId: string, packId: string) => {
        // Find pack by ID
        const packKey = Object.keys(PACKS).find(key => PACKS[key as keyof typeof PACKS].id === packId);
        const pack = packKey ? PACKS[packKey as keyof typeof PACKS] : null;

        if (!pack) throw new Error('Invalid pack selected');

        const line_items = [];
        if (pack.priceId.includes('placeholder')) {
            // Fallback to ad-hoc price data if no real price ID is configured
            line_items.push({
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: pack.name,
                    },
                    unit_amount: pack.amount,
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
