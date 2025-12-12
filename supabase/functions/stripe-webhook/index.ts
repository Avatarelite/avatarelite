// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY") || "", {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
});

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

console.log("Stripe Webhook Function Initialized");

Deno.serve(async (req) => {
    console.log("Received Request");

    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
        console.error("Missing stripe-signature header");
        return new Response("No signature", { status: 400 });
    }

    const body = await req.text();
    let event;

    try {
        event = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
    } catch (err: any) {
        console.error(`⚠️  Webhook signature verification failed: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    console.log(`🔔  Event received: ${event.type}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error("Missing Supabase configuration");
        return new Response("Server Configuration Error", { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const telegramId = session.metadata?.telegram_id;
        const creditsStr = session.metadata?.credits;

        if (telegramId && creditsStr) {
            const creditsToAdd = parseInt(creditsStr, 10);
            console.log(`Processing payment for User: ${telegramId}, Credits: ${creditsToAdd}`);

            // Fetch current credits
            const { data: user, error: fetchError } = await supabase
                .from("users")
                .select("credits")
                .eq("telegram_id", telegramId)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is 'not found'
                console.error("Error fetching user:", fetchError);
            }

            let currentCredits = user ? user.credits : 0;

            // Update credits
            const { error: updateError } = await supabase
                .from("users")
                .upsert({
                    telegram_id: telegramId,
                    credits: currentCredits + creditsToAdd,
                    updated_at: new Date().toISOString()
                }, { onConflict: "telegram_id" });

            if (updateError) {
                console.error("Error updating credits:", updateError);
                return new Response("Database Update Failed", { status: 500 });
            }

            console.log(`✅ Credits updated for user ${telegramId}`);
        } else {
            console.warn("Missing metadata in checkout session.");
        }
    }

    return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
});
