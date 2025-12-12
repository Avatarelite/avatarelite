import TelegramBot from 'node-telegram-bot-api';
import { NanoBananaService } from './services/nanoBanana';
import axios from 'axios';
import { userModel } from './db/users';
import { paymentService, PACKS } from './payments/stripe';

// Create a bot that uses 'polling' to fetch new updates
let bot: TelegramBot;
const nanoBanana = new NanoBananaService();

interface ReferenceImage {
    buffer: Buffer;
    width: number;
    height: number;
}

// User State Interface
// User State Interface
interface UserState {
    aspectRatio: string;
    quality: string;
    referenceImages: ReferenceImage[];
    mode: 'normal' | 'awaiting_references' | 'avatar_upload' | 'edit_mode' | 'trending_christmas';
    editingImage?: ReferenceImage; // Store image for edit mode
}

// ...



// ... (in-memory state storage and getUserState remain same)



// In-memory state storage
const userStates = new Map<number, UserState>();

// Get or initialize user state
function getUserState(chatId: number): UserState {
    if (!userStates.has(chatId)) {
        userStates.set(chatId, {
            aspectRatio: 'auto',
            quality: '1k',
            referenceImages: [],
            mode: 'normal'
        });
    }
    return userStates.get(chatId)!;
}

export function startBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not set in environment variables.');
    }

    bot = new TelegramBot(token, { polling: true });
    console.log('Bot is starting...');

    // --- Command Handlers ---

    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const user = await userModel.getOrCreateUser(chatId.toString());

        // Check if there are query parameters (args) for deep linking, e.g. /start payment_success
        const args = msg.text?.split(' ');
        if (args && args.length > 1) {
            const param = args[1];
            if (param === 'payment_success') {
                bot.sendMessage(chatId, '✅ **Payment Successful!**\nThank you for your purchase. Your credits have been updated.', { parse_mode: 'Markdown' });
                return;
            } else if (param === 'payment_cancel') {
                bot.sendMessage(chatId, '❌ Payment was cancelled.', { parse_mode: 'Markdown' });
                return;
            }
        }

        const welcomeMessage = `
🍌 **Welcome to AVATAR ELITE BOT** 🍌

I CAN GENERATE AMAZING IMAGES FOR YOU USING THE MOST ADVANCED AI IMAGE MODEL

**💎 Credits: ${user.credits}**

**Features:**
1. **Text-to-Image**: Just type a description.
2. **Image-to-Image**: Upload photos to edit or mix styles.
3. **Advanced Settings**: Use /menu to set Aspect Ratio & Quality.

Type /help for more info or /buy to get more credits.
    `;
        bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        const helpMessage = `
**Help & Instructions**

- **Generate Image**: Type your prompt (e.g., "A futuristic city").
- **Edit Image**: Upload a photo with a caption.
- **Settings**: Use /menu to change Ratio (1:1, 16:9, Auto) or Quality.
- **Multi-Image**: Use /menu -> "Upload References" to send up to 5 images, then type your prompt.
- **Credits**: /credits to check balance, /buy to purchase more.

*Powered by Nano Banana API*
    `;
        bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/credits/, async (msg) => {
        const chatId = msg.chat.id;
        const user = await userModel.getOrCreateUser(chatId.toString());
        bot.sendMessage(chatId, `💎 You have **${user.credits}** credits remaining.\n\nType /buy to get more.`, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/buy/, (msg) => {
        const chatId = msg.chat.id;
        const opts = {
            parse_mode: 'Markdown' as const,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `💎 ${PACKS.TIER_1.credits} Credits ($${PACKS.TIER_1.amount / 100})`, callback_data: `buy_${PACKS.TIER_1.id}` },
                        { text: `💎 ${PACKS.TIER_2.credits} Credits ($${PACKS.TIER_2.amount / 100})`, callback_data: `buy_${PACKS.TIER_2.id}` }
                    ],
                    [
                        { text: `💎 ${PACKS.TIER_3.credits} Credits ($${PACKS.TIER_3.amount / 100})`, callback_data: `buy_${PACKS.TIER_3.id}` },
                        { text: `💎 ${PACKS.TIER_4.credits} Credits ($${PACKS.TIER_4.amount / 100})`, callback_data: `buy_${PACKS.TIER_4.id}` }
                    ]
                ]
            }
        };
        bot.sendMessage(chatId, '🛍️ **Buy Credits**\nSelect a pack to purchase:', opts);
    });


    bot.onText(/\/menu/, async (msg) => {
        const chatId = msg.chat.id;
        await sendMenu(chatId);
    });

    // --- Helper Functions ---

    async function sendMenu(chatId: number) {
        const state = getUserState(chatId);
        const refCount = state.referenceImages.length;
        const user = await userModel.getOrCreateUser(chatId.toString());

        const message = `
**⚙️ Settings Menu**

**Aspect Ratio:** ${state.aspectRatio}
**Quality:** ${state.quality}
**Reference Images:** ${refCount}/5
**💎 Credits:** ${user.credits}

Select an option to change:
        `;

        const opts = {
            parse_mode: 'Markdown' as const,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📐 Auto', callback_data: 'ratio_auto' },
                        { text: '📐 1:1', callback_data: 'ratio_1:1' },
                        { text: '📐 16:9', callback_data: 'ratio_16:9' },
                        { text: '📐 9:16', callback_data: 'ratio_9:16' }
                    ],
                    [
                        { text: '💎 Quality 1k', callback_data: 'quality_1k' },
                        { text: '💎 Quality 2k', callback_data: 'quality_2k' },
                        { text: '💎 Quality 4k', callback_data: 'quality_4k' }
                    ],
                    [
                        { text: refCount > 0 ? `🖼️ Add Refs (${refCount})` : '🖼️ Upload References', callback_data: 'upload_refs' },
                        { text: '🗑️ Clear Refs', callback_data: 'clear_refs' }
                    ],
                    [
                        { text: '🎄 Trending', callback_data: 'menu_trending' },
                        { text: '🎨 Edit Image', callback_data: 'menu_edit' }
                    ],
                    [
                        { text: '👤 My Avatar', callback_data: 'menu_avatar' },
                        { text: '🛍️ Buy Credits', callback_data: 'cmd_buy' }
                    ],
                    [
                        { text: '🔄 Refresh Menu', callback_data: 'refresh_menu' }
                    ]
                ]
            }
        };

        bot.sendMessage(chatId, message, opts);
    }

    // --- Callback Query Handler ---

    bot.on('callback_query', async (callbackQuery) => {
        const msg = callbackQuery.message;
        const chatId = msg?.chat.id;
        const data = callbackQuery.data;

        if (!chatId || !data) return;

        const state = getUserState(chatId);

        // Payment Callbacks
        if (data.startsWith('buy_')) {
            const packId = data.split('_').slice(1).join('_'); // Handle potential underscores in ID if any, though ours are simple
            // Check if valid pack
            const isValidPack = Object.values(PACKS).some(p => p.id === packId);

            if (isValidPack) {
                try {
                    bot.answerCallbackQuery(callbackQuery.id, { text: 'Generating payment link...' });
                    const url = await paymentService.createCheckoutSession(chatId.toString(), packId);
                    bot.sendMessage(chatId, `Please pay using this link:\n[Click here to Pay](${url})`, { parse_mode: 'Markdown' });
                } catch (e: any) {
                    bot.sendMessage(chatId, `❌ Error creating payment: ${e.message}`);
                }
            }
            return;
        }

        if (data === 'cmd_buy') {
            // Simulate /buy command
            const opts = {
                parse_mode: 'Markdown' as const,
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: `💎 ${PACKS.TIER_1.credits} ($${PACKS.TIER_1.amount / 100})`, callback_data: `buy_${PACKS.TIER_1.id}` },
                            { text: `💎 ${PACKS.TIER_2.credits} ($${PACKS.TIER_2.amount / 100})`, callback_data: `buy_${PACKS.TIER_2.id}` }
                        ],
                        [
                            { text: `💎 ${PACKS.TIER_3.credits} ($${PACKS.TIER_3.amount / 100})`, callback_data: `buy_${PACKS.TIER_3.id}` },
                            { text: `💎 ${PACKS.TIER_4.credits} ($${PACKS.TIER_4.amount / 100})`, callback_data: `buy_${PACKS.TIER_4.id}` }
                        ]
                    ]
                }
            };
            bot.sendMessage(chatId, '🛍️ **Buy Credits**\nSelect a pack to purchase:', opts);
            bot.answerCallbackQuery(callbackQuery.id);
            return;
        }


        if (data.startsWith('ratio_')) {
            state.aspectRatio = data.split('_')[1];
            bot.answerCallbackQuery(callbackQuery.id, { text: `Ratio set to ${state.aspectRatio}` });
        } else if (data.startsWith('quality_')) {
            state.quality = data.split('_')[1];
            bot.answerCallbackQuery(callbackQuery.id, { text: `Quality set to ${state.quality}` });
        } else if (data === 'upload_refs') {
            state.mode = 'awaiting_references';
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Send your images now!' });
            bot.sendMessage(chatId, '📤 **Upload Mode Active**\nPlease send up to 5 reference images. When done, type your prompt.');
            return; // Don't refresh menu yet
        } else if (data === 'clear_refs') {
            state.referenceImages = [];
            state.mode = 'normal';
            bot.answerCallbackQuery(callbackQuery.id, { text: 'References cleared' });
        } else if (data === 'refresh_menu') {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Refreshing...' });
            await sendMenu(chatId); // Refresh main menu
            return;
        }

        // Avatar Handling
        if (data === 'menu_avatar') {
            await sendAvatarMenu(chatId);
            bot.answerCallbackQuery(callbackQuery.id);
            return;
        } else if (data === 'avatar_toggle_on') {
            await userModel.toggleAvatar(chatId.toString(), true);
            await sendAvatarMenu(chatId);
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Avatar Enabled' });
            return;
        } else if (data === 'avatar_toggle_off') {
            await userModel.toggleAvatar(chatId.toString(), false);
            await sendAvatarMenu(chatId);
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Avatar Disabled' });
            return;
        } else if (data === 'avatar_upload') {
            state.mode = 'avatar_upload';
            bot.sendMessage(chatId, '👤 **Upload Avatar Images**\nSend up to 15 photos of yourself (or your character).\nWhen done, type /menu to return.', { parse_mode: 'Markdown' });
            bot.answerCallbackQuery(callbackQuery.id);
            return;
        } else if (data === 'avatar_clear') {
            await userModel.updateAvatarImages(chatId.toString(), []);
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Avatar Images Cleared' });
            await sendAvatarMenu(chatId);
            return;
        } else if (data === 'menu_back') {
            state.mode = 'normal';
            await sendMenu(chatId);
            bot.answerCallbackQuery(callbackQuery.id);
            return;
        } else if (data === 'menu_edit') {
            state.mode = 'edit_mode';
            state.editingImage = undefined;
            bot.sendMessage(chatId, '🎨 **Edit Mode**\nPlease upload an image you want to edit.', { parse_mode: 'Markdown' });
            bot.answerCallbackQuery(callbackQuery.id);
            return;
        } else if (data === 'menu_trending') {
            state.mode = 'trending_christmas';
            state.editingImage = undefined;
            bot.sendMessage(chatId, '🎄 **Trending Christmas** 🎅\nUpload a photo to give it a holiday makeover!', { parse_mode: 'Markdown' });
            bot.answerCallbackQuery(callbackQuery.id);
            return;
        }

        if (data.startsWith('edit_action_') || data.startsWith('trend_action_')) {
            if (!state.editingImage) {
                bot.sendMessage(chatId, '⚠️ No image found to edit. Please upload one first.');
                return;
            }

            let prompt = "";
            let actionName = "";

            if (data.startsWith('edit_action_')) {
                const action = data.replace('edit_action_', '');
                actionName = action;
                switch (action) {
                    case 'remove_bg':
                        prompt = "Isolate subject, white background, product photography style";
                        break;
                    case 'upscale':
                        prompt = "Upscale to 4k resolution, highly detailed, sharp focus, photorealistic";
                        break;
                    case 'beautify':
                        prompt = "Professional retouching, beauty filter, perfect lighting, enhance features";
                        break;
                    case 'skin':
                        prompt = "Hyperrealistic skin texture, visible pores, detailed complexion, 8k photography";
                        break;
                    case 'outfit':
                        prompt = "Change clothing to high fashion elegant outfit, maintaining character identity";
                        break;
                    default:
                        prompt = "Enhance image";
                }
            } else {
                const action = data.replace('trend_action_', '');
                actionName = action;
                switch (action) {
                    case 'gifts': prompt = "Surrounded by colorful christmas gifts, piles of presents, festive holiday atmosphere"; break;
                    case 'santa': prompt = "Wearing a high quality Santa Claus costume, red and white fur, santa hat, festive"; break;
                    case 'home': prompt = "In a cozy christmas living room, decorated christmas tree, fireplace, warm lighting, stockings"; break;
                    case 'dinner': prompt = "Sitting at a lavish christmas dinner table, roast turkey, candles, elegant decorations, festive meal"; break;
                    case 'family': prompt = "Surrounded by happy family members wearing christmas sweaters, group photo, celebrating holiday"; break;
                    case 'snow': prompt = "Outdoor winter wonderland, falling snow, snowy trees, cold festive weather, soft lighting"; break;
                    default: prompt = "Christmas theme";
                }
            }

            const cost = getCostForQuality(state.quality);
            const { success, remaining } = await userModel.consumeCredit(chatId.toString(), cost);

            if (!success) {
                const opts = {
                    parse_mode: 'Markdown' as const,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: `💎 ${PACKS.TIER_1.credits} ($${PACKS.TIER_1.amount / 100})`, callback_data: `buy_${PACKS.TIER_1.id}` },
                                { text: `💎 ${PACKS.TIER_2.credits} ($${PACKS.TIER_2.amount / 100})`, callback_data: `buy_${PACKS.TIER_2.id}` }
                            ],
                            [
                                { text: '🛍️ View All Packs', callback_data: 'cmd_buy' }
                            ]
                        ]
                    }
                };
                bot.sendMessage(chatId, `🚫 **Insufficient Credits**\nYou need ${cost} credits but have ${remaining}.\n\n⬇️ **Top Up Now:**`, opts);
                return;
            }

            checkAndWarnCredits(chatId, remaining);

            bot.sendMessage(chatId, `🎨 Applying effect: **${actionName.replace('_', ' ')}**... please wait.`);
            bot.answerCallbackQuery(callbackQuery.id);

            const finalRatio = resolveAspectRatio(state.aspectRatio, [state.editingImage]);
            const qualityPrompt = enhancePrompt(prompt, state.quality);

            try {
                const result = await nanoBanana.generateImageFromImage([state.editingImage.buffer], qualityPrompt, finalRatio);
                handleGenerationResult(chatId, result, state.quality);
            } catch (e: any) {
                bot.sendMessage(chatId, `❌ Error: ${e.message}`);
            }
            return;
        }

        // Refresh menu text (delete old and send new, or edit)
        if (msg && !data.startsWith('avatar_') && data !== 'menu_avatar') {
            const user = await userModel.getOrCreateUser(chatId.toString());
            const refCount = state.referenceImages.length;
            const newText = `
**⚙️ Settings Menu**

**Aspect Ratio:** ${state.aspectRatio}
**Quality:** ${state.quality}
**Reference Images:** ${refCount}/5
**💎 Credits:** ${user.credits}

Select an option to change:
            `;
            try {
                await bot.editMessageText(newText, {
                    chat_id: chatId,
                    message_id: msg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: msg.reply_markup as any
                });
            } catch (e) {
                // Message might not have changed
            }
        }
    });

    async function sendAvatarMenu(chatId: number) {
        const user = await userModel.getOrCreateUser(chatId.toString());
        const avatarCount = user.avatar_images?.length || 0;
        const isEnabled = user.avatar_enabled;

        const message = `
**👤 My Avatar Settings**

**Status:** ${isEnabled ? '✅ ENABLED' : '❌ DISABLED'}
**Images Saved:** ${avatarCount}/15

When **Enabled**, your saved avatar images will be used *in addition* to any temporary references for every generation. This helps the AI keep your character consistent!

Select an action:
        `;

        const opts = {
            parse_mode: 'Markdown' as const,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: isEnabled ? '🔴 Disable Avatar' : '🟢 Enable Avatar', callback_data: isEnabled ? 'avatar_toggle_off' : 'avatar_toggle_on' }
                    ],
                    [
                        { text: '📤 Upload New Images', callback_data: 'avatar_upload' },
                        { text: '🗑️ Clear All Images', callback_data: 'avatar_clear' }
                    ],
                    [
                        { text: '🔙 Back to Menu', callback_data: 'menu_back' }
                    ]
                ]
            }
        };

        bot.sendMessage(chatId, message, opts);
    }

    // --- Message Handler ---

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const state = getUserState(chatId);

        // Ignore commands
        if (msg.text?.startsWith('/')) return;

        // Ensure user exists in DB
        const user = await userModel.getOrCreateUser(chatId.toString());

        // Handle Photo Uploads
        if (msg.photo) {
            try {
                const photo = msg.photo[msg.photo.length - 1]; // Highest quality

                if (state.mode === 'avatar_upload') {
                    // Use a Mutex-like pattern or just helper to ensure we don't overwrite
                    // Best way: use a managed function in userModel that handles fetching and updating
                    try {
                        const newCount = await userModel.appendAvatarImage(chatId.toString(), photo.file_id);
                        if (typeof newCount === 'number') {
                            bot.sendMessage(chatId, `✅ Avatar Image Saved! (${newCount}/15)`);
                        } else {
                            bot.sendMessage(chatId, `⚠️ Could not save image. Limit reached or error.`);
                        }
                    } catch (e: any) {
                        if (e.message === 'LIMIT_REACHED') {
                            bot.sendMessage(chatId, '⚠️ Max 15 avatar images reached. Use /menu -> My Avatar -> Clear to reset.');
                        } else {
                            console.error("Avatar save error:", e);
                            bot.sendMessage(chatId, '❌ Error saving image.');
                        }
                    }
                    return;
                }

                const fileId = photo.file_id;
                const fileLink = await bot.getFileLink(fileId);
                const imageResponse = await axios.get(fileLink, { responseType: 'arraybuffer' });
                const imageBuffer = Buffer.from(imageResponse.data);

                if (state.mode === 'edit_mode' || state.mode === 'trending_christmas') {
                    state.editingImage = {
                        buffer: imageBuffer,
                        width: photo.width,
                        height: photo.height
                    };

                    if (state.mode === 'edit_mode') {
                        // Show Edit Actions Menu
                        const opts = {
                            parse_mode: 'Markdown' as const,
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '✂️ Remove BG', callback_data: 'edit_action_remove_bg' },
                                        { text: '💎 Upscale 4k', callback_data: 'edit_action_upscale' }
                                    ],
                                    [
                                        { text: '✨ Beautify', callback_data: 'edit_action_beautify' },
                                        { text: '🧖 Realistic Skin', callback_data: 'edit_action_skin' }
                                    ],
                                    [
                                        { text: '👗 Change Outfit', callback_data: 'edit_action_outfit' }
                                    ],
                                    [
                                        { text: '🔙 Back to Menu', callback_data: 'menu_back' }
                                    ]
                                ]
                            }
                        };
                        bot.sendMessage(chatId, '✅ **Image Received!**\nSelect an action to apply:', opts);
                    } else {
                        // Christmas Menu
                        const opts = {
                            parse_mode: 'Markdown' as const,
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '🎁 Add Gifts', callback_data: 'trend_action_gifts' },
                                        { text: '🎅 Santa Outfit', callback_data: 'trend_action_santa' }
                                    ],
                                    [
                                        { text: '🏠 Xmas Home', callback_data: 'trend_action_home' },
                                        { text: '🍽️ Xmas Dinner', callback_data: 'trend_action_dinner' }
                                    ],
                                    [
                                        { text: '👨‍👩‍👧 Family Xmas', callback_data: 'trend_action_family' },
                                        { text: '❄️ Snowy Outside', callback_data: 'trend_action_snow' }
                                    ],
                                    [
                                        { text: '🔙 Back to Menu', callback_data: 'menu_back' }
                                    ]
                                ]
                            }
                        };
                        bot.sendMessage(chatId, '🎄 **Ho Ho Ho!** Image Received!\nSelect a Christmas Magic effect:', opts);
                    }
                    return;
                }

                const refImage: ReferenceImage = {
                    buffer: imageBuffer,
                    width: photo.width,
                    height: photo.height
                };

                if (state.mode === 'awaiting_references') {
                    if (state.referenceImages.length >= 5) {
                        bot.sendMessage(chatId, '⚠️ Max 5 images allowed. Use /menu to clear.');
                        return;
                    }
                    state.referenceImages.push(refImage);
                    bot.sendMessage(chatId, `✅ Image added! (${state.referenceImages.length}/5) [${photo.width}x${photo.height}]\nSend more or type your prompt to generate.`);
                    return;
                } else {
                    // Check Credits before processing
                    const prompt = msg.caption;
                    if (prompt) {
                        // Consuming credit here
                        // Consuming credit here
                        const cost = getCostForQuality(state.quality);
                        const { success, remaining } = await userModel.consumeCredit(chatId.toString(), cost);

                        if (!success) {
                            const opts = {
                                parse_mode: 'Markdown' as const,
                                reply_markup: {
                                    inline_keyboard: [
                                        [
                                            { text: `💎 ${PACKS.TIER_1.credits} ($${PACKS.TIER_1.amount / 100})`, callback_data: `buy_${PACKS.TIER_1.id}` },
                                            { text: `💎 ${PACKS.TIER_2.credits} ($${PACKS.TIER_2.amount / 100})`, callback_data: `buy_${PACKS.TIER_2.id}` }
                                        ],
                                        [
                                            { text: '🛍️ View All Packs', callback_data: 'cmd_buy' }
                                        ]
                                    ]
                                }
                            };
                            bot.sendMessage(chatId, `🚫 **Insufficient Credits**\nYou need ${cost} credits to generate a ${state.quality} image.\nYou have ${remaining} credits.`, opts);
                            return;
                        }

                        checkAndWarnCredits(chatId, remaining);

                        bot.sendMessage(chatId, '🎨 Processing your image... please wait.');
                        const qualityPrompt = enhancePrompt(prompt, state.quality);

                        // Collect all references (Session + Avatar)
                        const allBuffers: Buffer[] = [refImage.buffer];

                        // Add Avatar Images if enabled
                        if (user.avatar_enabled && user.avatar_images && user.avatar_images.length > 0) {
                            bot.sendMessage(chatId, `👤 Adding ${user.avatar_images.length} avatar reference(s)...`);
                            const avatarBuffers = await downloadImages(user.avatar_images);
                            allBuffers.push(...avatarBuffers);
                        }

                        const finalRatio = resolveAspectRatio(state.aspectRatio, [refImage]); // Use uploaded image for ratio logic

                        const result = await nanoBanana.generateImageFromImage(allBuffers, qualityPrompt, finalRatio);
                        handleGenerationResult(chatId, result, state.quality);
                    } else {
                        // Photo without caption -> Assume adding to refs. NO CHARGE.
                        state.referenceImages.push(refImage);
                        bot.sendMessage(chatId, `✅ Image received [${photo.width}x${photo.height}]. Type a caption to edit it, or add more images.`);
                    }
                    return;
                }
            } catch (error) {
                console.error('Error downloading photo:', error);
                bot.sendMessage(chatId, '❌ Failed to download image.');
            }
            return;
        }

        // Handle Text Prompts
        if (msg.text) {
            // Check Credits
            const cost = getCostForQuality(state.quality);
            const { success, remaining } = await userModel.consumeCredit(chatId.toString(), cost);

            if (!success) {
                const opts = {
                    parse_mode: 'Markdown' as const,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: `💎 ${PACKS.TIER_1.credits} ($${PACKS.TIER_1.amount / 100})`, callback_data: `buy_${PACKS.TIER_1.id}` },
                                { text: `💎 ${PACKS.TIER_2.credits} ($${PACKS.TIER_2.amount / 100})`, callback_data: `buy_${PACKS.TIER_2.id}` }
                            ],
                            [
                                { text: '🛍️ View All Packs', callback_data: 'cmd_buy' }
                            ]
                        ]
                    }
                };
                bot.sendMessage(chatId, `🚫 **Insufficient Credits**\nYou need ${cost} credits to generate a ${state.quality} image.\nYou have ${remaining} credits.`, opts);
                return;
            }

            checkAndWarnCredits(chatId, remaining);

            const prompt = msg.text;
            const qualityPrompt = enhancePrompt(prompt, state.quality);

            // Collect all references
            // Standard references
            const allBuffers: Buffer[] = state.referenceImages.map(img => img.buffer);

            // Avatar references
            if (user.avatar_enabled && user.avatar_images && user.avatar_images.length > 0) {
                bot.sendMessage(chatId, `👤 Adding ${user.avatar_images.length} avatar reference(s)...`);
                const avatarBuffers = await downloadImages(user.avatar_images);
                allBuffers.push(...avatarBuffers);
            }

            // Check if we have ANY reference images (session or avatar)
            if (allBuffers.length > 0) {
                bot.sendMessage(chatId, `🎨 Generating with ${allBuffers.length} references... please wait.`);

                // For ratio, prioritize session images, then default to auto/square
                const finalRatio = resolveAspectRatio(state.aspectRatio, state.referenceImages);

                const result = await nanoBanana.generateImageFromImage(allBuffers, qualityPrompt, finalRatio);
                handleGenerationResult(chatId, result, state.quality);

                // Clear session refs but keep mode?
                state.mode = 'normal';
            } else {
                bot.sendMessage(chatId, '🎨 Generating your image... please wait.');
                const finalRatio = state.aspectRatio === 'auto' ? '1:1' : state.aspectRatio;
                const result = await nanoBanana.generateImageFromText(qualityPrompt, finalRatio);
                handleGenerationResult(chatId, result, state.quality);
            }
        }
    });

    // Helper to download multiple images from Telegram File IDs
    async function downloadImages(fileIds: string[]): Promise<Buffer[]> {
        const buffers: Buffer[] = [];
        for (const fileId of fileIds) {
            try {
                const fileLink = await bot.getFileLink(fileId);
                const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
                buffers.push(Buffer.from(response.data));
            } catch (e) {
                console.error(`Failed to download avatar image ${fileId}`, e);
            }
        }
        return buffers;
    }

    function resolveAspectRatio(setting: string, images: ReferenceImage[]): string {
        if (setting !== 'auto') {
            return setting;
        }

        if (images && images.length > 0) {
            // Use the first image's aspect ratio
            const img = images[0];
            // Format as "W:H" e.g. "1920:1080"
            // We might want to simplify this or pass it exactly
            return `${img.width}:${img.height}`;
        }

        return "1:1"; // Default fallback
    }

    function enhancePrompt(prompt: string, quality: string): string {
        let suffix = '';
        if (quality === '2k') suffix = ', 2k resolution, highly detailed';
        if (quality === '4k') suffix = ', 4k resolution, ultra detailed, photorealistic';
        return prompt + suffix;
    }

    function handleGenerationResult(chatId: number, result: any, quality: string) {
        if (result.success) {
            const sendOptions = { parse_mode: 'Markdown' };
            if (result.imageBuffer) {
                if (quality === '4k' || quality === '2k') {
                    // Send as document to preserve quality for 2k and 4k
                    bot.sendDocument(chatId, result.imageBuffer, {}, { filename: `generated_image_${quality}.png`, contentType: 'image/png' });
                } else {
                    bot.sendPhoto(chatId, result.imageBuffer);
                }
            } else if (result.imageUrl) {
                if (quality === '4k' || quality === '2k') {
                    bot.sendDocument(chatId, result.imageUrl);
                } else {
                    bot.sendPhoto(chatId, result.imageUrl);
                }
            }
        } else {
            bot.sendMessage(chatId, `❌ Error: ${result.error}`);
        }
    }

    function getCostForQuality(quality: string): number {
        switch (quality) {
            case '4k': return 10;
            case '2k': return 7;
            default: return 5; // 1k or other default
        }
    }

    function checkAndWarnCredits(chatId: number, remaining: number) {
        if (remaining < 5) {
            const opts = {
                parse_mode: 'Markdown' as const,
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: `💎 ${PACKS.TIER_1.credits} ($${PACKS.TIER_1.amount / 100})`, callback_data: `buy_${PACKS.TIER_1.id}` },
                            { text: `💎 ${PACKS.TIER_2.credits} ($${PACKS.TIER_2.amount / 100})`, callback_data: `buy_${PACKS.TIER_2.id}` }
                        ],
                        [
                            { text: '🛍️ View All Packs', callback_data: 'cmd_buy' }
                        ]
                    ]
                }
            };
            // Small delay to make sure it comes after the image generation message? 
            // Actually bot logic is async, so this might arrive before the image if we are not careful.
            // But we call this BEFORE starting generation process in code (await generate...). 
            // Wait, we call this AFTER consumeCredit, but BEFORE `nanoBanana.generate...`.
            // So the warning might appear before "Processing...".
            // That's fine, or even better.
            bot.sendMessage(chatId, `⚠️ **Running Low on Credits!**\nYou only have ${remaining} credits left.\nTop up now to avoid interruption:`, opts);
        }
    }

    console.log('Bot is running and listening for messages.');
}
