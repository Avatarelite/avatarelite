import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.NANO_BANANA_API_KEY;
const URL = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

async function listModels() {
    try {
        const response = await axios.get(URL);
        const models = response.data.models;
        console.log('Available Models:');
        models.forEach((model: any) => {
            console.log(`- ${model.name} (Supported methods: ${model.supportedGenerationMethods})`);
        });
    } catch (error: any) {
        console.error('Error listing models:', error.response?.data || error.message);
    }
}

listModels();
