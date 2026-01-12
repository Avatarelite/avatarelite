
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.SEEDREAM_API_KEY;
const MODEL_ID = 'seedream-4-5-251128';

const ENDPOINTS = [
    'https://open.byteplus.com/v1/images/generations',
    'https://ark.byteplus.com/api/v3/images/generations',
    'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    'https://api.byteplus.com/v1/images/generations'
];

async function testEndpoint(url: string) {
    if (!API_KEY) {
        console.error("No API_KEY in .env");
        return;
    }

    console.log(`Testing: ${url}...`);
    try {
        const response = await axios.post(url, {
            model: MODEL_ID,
            prompt: "a cat",
            size: "1024x1024",
            response_format: "b64_json",
            n: 1
        }, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        console.log(`✅ SUCCESS: ${url}`);
        console.log(`Status: ${response.status}`);
        // console.log(JSON.stringify(response.data).substring(0, 100));
    } catch (e: any) {
        console.log(`❌ FAILED: ${url}`);
        console.log(`Error: ${e.message}`);
        if (e.response) {
            console.log(`Status: ${e.response.status}`);
            console.log(`Data: ${JSON.stringify(e.response.data)}`);
        }
    }
    console.log('-----------------------------------');
}

async function runTests() {
    for (const url of ENDPOINTS) {
        await testEndpoint(url);
    }
}

runTests();
