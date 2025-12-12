import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

interface GenerateImageResponse {
    success: boolean;
    imageUrl?: string;
    imageBuffer?: Buffer;
    error?: string;
}

export class NanoBananaService {
    private getApiKey(): string {
        const key = process.env.NANO_BANANA_API_KEY;
        if (!key) {
            console.warn('WARNING: NANO_BANANA_API_KEY is not set in environment variables.');
            return '';
        }
        return key;
    }

    /**
     * Generates an image using the Nano Banana (Gemini 2.5 Flash Image) model.
     * Supports both Text-to-Image and Image-to-Image (Editing).
     */
    /**
     * Generates an image using the Nano Banana (Gemini 2.5 Flash Image) model.
     * Supports both Text-to-Image and Image-to-Image (Editing).
     */
    private async callGeminiImageModel(prompt: string, imageBuffers?: Buffer[], aspectRatio?: string): Promise<GenerateImageResponse> {
        const API_KEY = this.getApiKey();
        // Using the specific Nano Banana model ID found in the user's list
        const MODEL_ID = 'nano-banana-pro-preview';
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

        if (!API_KEY) {
            return { success: false, error: 'API Key is missing.' };
        }

        try {
            console.log(`Calling ${MODEL_ID} with prompt: "${prompt}"`);

            const parts: any[] = [{ text: prompt }];

            if (imageBuffers && imageBuffers.length > 0) {
                console.log(`Adding ${imageBuffers.length} images to request...`);
                for (const buffer of imageBuffers) {
                    parts.push({
                        inline_data: {
                            mime_type: "image/png", // Assuming PNG, but API is flexible
                            data: buffer.toString('base64')
                        }
                    });
                }
            }

            const payload: any = {
                contents: [{ parts: parts }]
            };

            // Append aspect ratio to prompt if it's not the default "1:1" or if we want to be sure
            // Since generationConfig parameters are failing, we rely on the prompt.
            if (aspectRatio && aspectRatio !== "1:1") {
                // Check if prompt already contains it to avoid duplication if called recursively
                if (!parts[0].text.includes(`aspect ratio ${aspectRatio}`)) {
                    parts[0].text += `, aspect ratio ${aspectRatio}`;
                }
            } else if (aspectRatio === "1:1") {
                // specific prompt for square if needed, usually default
            }

            const response = await axios.post(`${API_URL}?key=${API_KEY}`, payload, {
                headers: { 'Content-Type': 'application/json' }
            });

            // Check for safety block
            if (response.data.promptFeedback && response.data.promptFeedback.blockReason) {
                console.warn(`Blocked by safety filters: ${response.data.promptFeedback.blockReason}`);
                return { success: false, error: `Image generation blocked: ${response.data.promptFeedback.blockReason}` };
            }

            const candidates = response.data.candidates;
            if (candidates && candidates.length > 0) {
                const candidate = candidates[0];
                if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                    console.warn(`Generation stopped with reason: ${candidate.finishReason}`);
                }

                const parts = candidate.content?.parts;
                if (parts) {
                    // First, look for an image part
                    for (const part of parts) {
                        if (part.inlineData && part.inlineData.data) {
                            const buffer = Buffer.from(part.inlineData.data, 'base64');
                            return { success: true, imageBuffer: buffer };
                        }
                        // Handle snake_case variation just in case
                        if (part.inline_data && part.inline_data.data) {
                            const buffer = Buffer.from(part.inline_data.data, 'base64');
                            return { success: true, imageBuffer: buffer };
                        }
                    }

                    // If no image found, check for text error
                    if (parts[0].text) {
                        console.warn('Model returned text instead of image:', parts[0].text);
                        return { success: false, error: `Model returned text: ${parts[0].text}` };
                    }
                }
            }

            console.error('Unexpected API response format:', JSON.stringify(response.data, null, 2));
            // Return a snippet of the response for debugging
            const debugInfo = JSON.stringify(response.data).substring(0, 200);
            return { success: false, error: `Unexpected API response: ${debugInfo}...` };

        } catch (error: any) {
            console.error('Error generating image:', error.response?.data || error.message);
            const errorMsg = error.response?.data?.error?.message || error.message || 'Failed to generate image.';
            return { success: false, error: errorMsg };
        }
    }

    private async describeImage(imageBuffers: Buffer[], userInstruction: string): Promise<string> {
        const API_KEY = this.getApiKey();
        const MODEL_ID = 'gemini-3-pro-preview';
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

        if (!API_KEY) throw new Error('API Key missing');

        try {
            console.log(`Generating description for ${imageBuffers.length} images...`);
            const prompt = `Analyze these ${imageBuffers.length} images in detail. Then, incorporate this user instruction: "${userInstruction}". Return ONLY a single detailed prompt suitable for an image generator to create a new image based on these images and the instruction.`;

            const parts: any[] = [{ text: prompt }];

            imageBuffers.forEach(buffer => {
                parts.push({
                    inline_data: {
                        mime_type: "image/png",
                        data: buffer.toString('base64')
                    }
                });
            });

            const payload = {
                contents: [{ parts: parts }]
            };

            const response = await axios.post(`${API_URL}?key=${API_KEY}`, payload, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data.candidates && response.data.candidates.length > 0) {
                const text = response.data.candidates[0].content.parts[0].text;
                if (!text) throw new Error('Model returned empty description');
                return text;
            }

            if (response.data.promptFeedback && response.data.promptFeedback.blockReason) {
                throw new Error(`Description blocked: ${response.data.promptFeedback.blockReason}`);
            }

            throw new Error('No candidates returned from description model');

        } catch (error: any) {
            console.error('Error describing image:', error.message);
            const msg = error.response?.data?.error?.message || error.message || 'Unknown error describing image';
            throw new Error(`Vision Error: ${msg}`);
        }
    }

    async generateImageFromText(prompt: string, aspectRatio: string = "1:1"): Promise<GenerateImageResponse> {
        // We pass undefined for imageBuffers
        return this.callGeminiImageModel(prompt, undefined, aspectRatio);
    }

    async generateImageFromImage(imageBuffers: Buffer[], prompt: string, aspectRatio: string = "1:1"): Promise<GenerateImageResponse> {
        console.log('Image-to-Image pipeline started...');

        try {
            // High Fidelity Mode: Pass ALL images directly to the model
            // Append instruction for fidelity
            const fidelityPrompt = prompt + ", maintain high fidelity to the reference image, facial features, and details";

            console.log(`Generating with prompt: "${fidelityPrompt}" and ${imageBuffers.length} reference image(s)`);

            // Check if we have at least one image
            if (imageBuffers.length === 0) {
                return this.generateImageFromText(prompt, aspectRatio);
            }

            // Call the model directly with ALL image buffers
            return this.callGeminiImageModel(fidelityPrompt, imageBuffers, aspectRatio);

        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}

