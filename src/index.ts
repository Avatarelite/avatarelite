import dotenv from 'dotenv';
import express from 'express';
import { startBot } from './bot';
import { paymentService } from './payments/stripe';

// Load environment variables (Trigger Rebuild)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Health Check
app.get('/health', (req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Stripe Webhook
// Use raw body for signature verification
app.post('/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
        return res.status(400).send('Missing Stripe signature');
    }

    try {
        await paymentService.handleWebhook(req.body, signature as string);
        res.json({ received: true });
    } catch (error: any) {
        console.error('Webhook Error:', error.message);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

// JSON Middleware for other routes (Telegram Bot)
app.use(express.json());

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Start the bot
try {
    startBot(app);
} catch (error) {
    console.error('Failed to start bot:', error);
}
