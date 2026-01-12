
import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';

dotenv.config();

async function fixWebhook() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.error("No token found");
        return;
    }

    const bot = new TelegramBot(token, { polling: false });

    console.log("Checking Webhook info...");
    const info = await bot.getWebHookInfo();
    console.log("Current Webhook:", info);

    console.log("Deleting Webhook to force Polling...");
    await bot.deleteWebHook();
    console.log("Webhook deleted.");

    console.log("Now verifying...");
    const newInfo = await bot.getWebHookInfo();
    console.log("New Webhook Info:", newInfo);
}

fixWebhook();
