import dotenv from 'dotenv';

dotenv.config();

interface Config {
    telegramBotToken: string;
    stripeSecretKey: string;
    stripeWebhookSecret: string; // Still useful for reference or if we verify locally, though mainly for Edge Function now
    nanoBananaApiKey?: string;
    smallPackCredits: number;
    largePackCredits: number;
    smallPackPriceId?: string;
    largePackPriceId?: string;
    supabaseUrl: string;
    supabaseKey: string;
    webhookUrl?: string;
    seedreamApiKey: string;
}

const requiredEnvVars = [
    'TELEGRAM_BOT_TOKEN',
    // 'STRIPE_SECRET_KEY', // Bot might creating sessions, so keep it?
    // 'SUPABASE_URL',
    // 'SUPABASE_KEY'
];

// We relax the strict check here to allow partial config during migration
// But warn if missing
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.warn("WARNING: Supabase credentials missing. DB operations will fail.");
}

export const config: Config = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    nanoBananaApiKey: process.env.NANO_BANANA_API_KEY,
    smallPackCredits: 50,
    largePackCredits: 200,
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_KEY || '',
    webhookUrl: process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined),
    seedreamApiKey: process.env.SEEDREAM_API_KEY || '',
};
