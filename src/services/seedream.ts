
import axios from 'axios';
import FormData from 'form-data';
import { config } from '../config/env';

interface GenerateImageResponse {
    success: boolean;
    imageUrl?: string;
    imageBuffer?: Buffer;
    error?: string;
}

export class SeedreamService {
    private baseUrl = 'https://ark.cn-beijing.volces.com/api/v3';
    private modelId = 'seedream-4-5-251128'; // Can be overridden

    private getApiKey(): string {
        if (!config.seedreamApiKey) {
            console.warn('WARNING: SEEDREAM_API_KEY is not set.');
            return '';
        }
        return config.seedreamApiKey;
    }

    async generateImageFromText(prompt: string, aspectRatio: string = "1:1"): Promise<GenerateImageResponse> {
        const apiKey = this.getApiKey();
        if (!apiKey) return { success: false, error: 'API Key missing' };

        // Convert aspect ratio to size
        const size = this.mapAspectRatioToSize(aspectRatio);

        try {
            console.log(`Generating image with Seedream (Text): "${prompt}" [${size}]`);
            const response = await axios.post(`${this.baseUrl}/images/generations`, {
                model: this.modelId,
                prompt: prompt,
                size: size,
                response_format: 'b64_json',
                n: 1
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 180000 // 180s timeout for generation
            });

            const data = response.data;
            if (data.data && data.data.length > 0) {
                const item = data.data[0];
                if (item.b64_json) {
                    return { success: true, imageBuffer: Buffer.from(item.b64_json, 'base64') };
                } else if (item.url) {
                    return { success: true, imageUrl: item.url };
                } else if (item.image_url) {
                    // Some APIs use image_url
                    return { success: true, imageUrl: item.image_url };
                }
            } else if (data.images && data.images.length > 0) {
                // Format: { images: ["url1", "url2"] }
                return { success: true, imageUrl: data.images[0] };
            } else if (data.output && data.output.url) {
                // Format: { output: { url: "..." } }
                return { success: true, imageUrl: data.output.url };
            }

            console.error("No image data found. Full Response:", JSON.stringify(data, null, 2));
            return { success: false, error: 'No image data. Full Response: ' + JSON.stringify(data) };

        } catch (error: any) {
            console.error('Seedream Text-to-Image Error:', error.message);
            if (error.response) console.error(JSON.stringify(error.response.data, null, 2));
            return { success: false, error: error.response?.data?.error?.message || error.message };
        }
    }

    async generateImageFromImage(imageBuffers: Buffer[], prompt: string, aspectRatio: string = "1:1"): Promise<GenerateImageResponse> {
        const apiKey = this.getApiKey();
        if (!apiKey) return { success: false, error: 'API Key missing' };

        // For Image-to-Image, we typically use the /images/edits endpoint if following OpenAI
        // But we only support 1 image usually for edits.
        if (imageBuffers.length === 0) {
            return this.generateImageFromText(prompt, aspectRatio);
        }

        const size = this.mapAspectRatioToSize(aspectRatio);
        const mainImage = imageBuffers[0];

        try {
            console.log(`Generating image with Seedream (Img2Img): "${prompt}" [${size}]`);

            const formData = new FormData();
            formData.append('model', this.modelId);
            formData.append('prompt', prompt);
            formData.append('image', mainImage, { filename: 'image.png', contentType: 'image/png' });
            formData.append('size', size);
            formData.append('response_format', 'b64_json');
            formData.append('n', 1);
            // Some APIs support strength or guidance_scale here

            const response = await axios.post(`${this.baseUrl}/images/edits`, formData, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    ...formData.getHeaders()
                },
                timeout: 90000
            });

            const data = response.data;
            if (data.data && data.data.length > 0) {
                const item = data.data[0];
                if (item.b64_json) {
                    return { success: true, imageBuffer: Buffer.from(item.b64_json, 'base64') };
                } else if (item.url) {
                    return { success: true, imageUrl: item.url };
                } else if (item.image_url) {
                    return { success: true, imageUrl: item.image_url };
                }
            } else if (data.images && data.images.length > 0) {
                return { success: true, imageUrl: data.images[0] };
            } else if (data.output && data.output.url) {
                return { success: true, imageUrl: data.output.url };
            }

            console.error("No image data found (Img2Img). Full Response:", JSON.stringify(data, null, 2));
            return { success: false, error: 'No image data. Full Response: ' + JSON.stringify(data) };

        } catch (error: any) {
            console.error('Seedream Img-to-Img Error:', error.message);
            // Fallback: If /images/edits fails (404 or method not allowed), maybe try generations with specific param?
            // But for now return error.
            if (error.response) console.error(JSON.stringify(error.response.data, null, 2));
            return { success: false, error: error.response?.data?.error?.message || error.message };
        }
    }

    private mapAspectRatioToSize(ratio: string): string {
        // Seedream 4.5 likely supports flexible resolutions, but we stick to standard square/portrait/landscape buckets
        switch (ratio) {
            case '16:9': return '1280x720'; // Standard landscape
            case '9:16': return '720x1280'; // Standard portrait
            case '1:1':
            default: return '1024x1024';
        }
    }
}
