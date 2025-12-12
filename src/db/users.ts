import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env';

export interface User {
    telegram_id: string;
    credits: number;
    avatar_images?: string[]; // Array of file_ids
    avatar_enabled?: boolean;
    created_at?: string;
    updated_at?: string;
}

// Initialize Supabase Client
// We use the Service Role Key if available to bypass RLS for the bot, 
// OR the Anon key if RLS allows the bot to write. 
// Ideally for a bot backend, Service Role is safer to ensure access.
let supabase: SupabaseClient | null = null;
if (config.supabaseUrl && config.supabaseKey) {
    supabase = createClient(config.supabaseUrl, config.supabaseKey);
}

export const userModel = {
    // ... (keep existing getOrCreateUser and getUser)

    getOrCreateUser: async (telegramId: string): Promise<User> => {
        if (!supabase) return { telegram_id: telegramId, credits: 15, avatar_images: [], avatar_enabled: false };

        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', telegramId)
            .single();

        if (data) {
            // Ensure array initialization if null
            if (!data.avatar_images) data.avatar_images = [];
            return data as User;
        }

        const { data: newUser, error: createError } = await supabase
            .from('users')
            .upsert({ telegram_id: telegramId, credits: 15, avatar_images: [], avatar_enabled: false }, { onConflict: 'telegram_id' })
            .select()
            .single();

        if (createError) {
            console.error('Error creating user:', createError);
            return { telegram_id: telegramId, credits: 15, avatar_images: [], avatar_enabled: false };
        }

        return newUser as User;
    },

    getUser: async (telegramId: string): Promise<User | undefined> => {
        if (!supabase) return undefined;
        const { data } = await supabase.from('users').select('*').eq('telegram_id', telegramId).single();
        if (data && !data.avatar_images) data.avatar_images = [];
        return data as User | undefined;
    },

    addCredits: async (telegramId: string, amount: number) => {
        if (!supabase) return;
        const { data: user } = await supabase.from('users').select('credits').eq('telegram_id', telegramId).single();
        if (user) {
            await supabase.from('users')
                .update({ credits: user.credits + amount, updated_at: new Date().toISOString() })
                .eq('telegram_id', telegramId);
        }
    },

    consumeCredit: async (telegramId: string, amount: number = 1): Promise<{ success: boolean; remaining: number }> => {
        if (!supabase) {
            console.warn("⚠️ Supabase not initialized, failing open for consumeCredit");
            return { success: true, remaining: 999 };
        }

        const { data: user, error: fetchError } = await supabase.from('users').select('credits').eq('telegram_id', telegramId).single();

        if (fetchError || !user) {
            console.error(`Error fetching user ${telegramId} for credit consumption:`, fetchError);
            return { success: false, remaining: 0 };
        }

        console.log(`Checking credits for ${telegramId}: ${user.credits} (Need: ${amount})`);

        if (user.credits < amount) {
            console.log(`User ${telegramId} has insufficient credits.`);
            return { success: false, remaining: user.credits };
        }

        const newBalance = user.credits - amount;
        const { error: updateError } = await supabase.from('users')
            .update({ credits: newBalance, updated_at: new Date().toISOString() })
            .eq('telegram_id', telegramId);

        if (updateError) {
            console.error(`Error updating credits for ${telegramId}:`, updateError);
            return { success: false, remaining: user.credits }; // Assume failed update means no consumption
        }

        console.log(`Successfully consumed ${amount} credits for ${telegramId}. New balance: ${newBalance}`);
        return { success: true, remaining: newBalance };
    },

    updateAvatarImages: async (telegramId: string, images: string[]) => {
        if (!supabase) return;
        console.log(`Updating avatar images for ${telegramId}: ${images.length} images`);
        const { error } = await supabase.from('users')
            .update({ avatar_images: images, updated_at: new Date().toISOString() })
            .eq('telegram_id', telegramId);

        if (error) {
            console.error('Error updating avatar images:', error);
        } else {
            console.log('Successfully updated avatar images.');
        }
    },

    // Mutex map for avatar updates to prevent race conditions
    _locks: new Map<string, Promise<void>>(),

    appendAvatarImage: async (telegramId: string, fileId: string): Promise<number | null> => {
        if (!supabase) return null;

        // Get current lock or resolve immediately
        const currentLock = userModel._locks.get(telegramId) || Promise.resolve();

        let operationResult: number | null = null;
        let operationError: any = null;

        // Create the new lock entry
        const nextLock = currentLock.then(async () => {
            try {
                const { data: user } = await supabase!.from('users').select('avatar_images').eq('telegram_id', telegramId).single();
                if (!user) return;

                const currentImages = user.avatar_images || [];
                if (currentImages.length >= 15) {
                    throw new Error('LIMIT_REACHED');
                }

                const newImages = [...currentImages, fileId];

                const { error } = await supabase!.from('users')
                    .update({ avatar_images: newImages, updated_at: new Date().toISOString() })
                    .eq('telegram_id', telegramId);

                if (error) throw error;

                operationResult = newImages.length;
            } catch (e) {
                operationError = e; // Capture error to re-throw or handle
                throw e;
            }
        });

        // Update the lock map with a strictly void promise that handles rejection silentl
        // so the NEXT task isn't blocked by this one failing.
        const safeLock = nextLock.then(() => { }, () => { });
        userModel._locks.set(telegramId, safeLock);

        // Wait for OUR operation to finish and return result
        try {
            await nextLock;
            return operationResult;
        } catch (e: any) {
            // Re-throw if it's the specific limit error, otherwise maybe null?
            if (e.message === 'LIMIT_REACHED') throw e;
            console.error("Error in appendAvatarImage:", e);
            return null; // Return null on general DB error
        }
    },

    toggleAvatar: async (telegramId: string, enabled: boolean) => {
        if (!supabase) return;
        console.log(`Toggling avatar for ${telegramId} to ${enabled}`);
        const { error } = await supabase.from('users')
            .update({ avatar_enabled: enabled, updated_at: new Date().toISOString() })
            .eq('telegram_id', telegramId);

        if (error) {
            console.error('Error toggling avatar:', error);
        } else {
            console.log('Successfully toggled avatar.');
        }
    }
};
