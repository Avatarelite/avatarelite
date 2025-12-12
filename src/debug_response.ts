import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.NANO_BANANA_API_KEY;
const MODEL_ID = 'gemini-2.5-flash-image';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

async function testGenerate() {
    try {
        console.log(`Testing ${MODEL_ID}...`);
        const prompt = "A cute robot banana";

        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        const response = await axios.post(`${API_URL}?key=${API_KEY}`, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        console.log('Response Status:', response.status);
        console.log('Full Response Data:');
        console.log(JSON.stringify(response.data, null, 2));

    } catch (error: any) {
        console.error('Error:', error.response?.data || error.message);
    }
}

testGenerate();
