const express = require('express');
const cors = require('cors');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const fetch = require('cross-fetch');
const { google } = require('googleapis');

// --- CONFIGURATION ---
const HEALTH_METRICS_FOLDER_ID = process.env.HEALTH_METRICS_FOLDER_ID;
const FIT_FILES_FOLDER_ID = process.env.FIT_FILES_FOLDER_ID;
const GPX_ROUTES_FOLDER_ID = process.env.GPX_ROUTES_FOLDER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const USER_ID = 'chris-main';
const FRONTEND_URL = process.env.FRONTEND_URL;

// --- INITIALIZATION ---
let db;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
    db = getFirestore();
    console.log('[OK] Firebase Admin initialized successfully.');
} catch (error) {
    console.error("CRITICAL: Firebase initialization failed. Check FIREBASE_SERVICE_ACCOUNT.", error);
}

const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });
const app = express();
const corsOptions = { origin: FRONTEND_URL || 'http://localhost:5173' };
app.use(cors(corsOptions));
app.use(express.json());
const PORT = process.env.PORT || 3001;

// --- DYNAMIC PLAN GENERATION ---
async function generateDynamicPlan() {
    console.log('[DIAGNOSTIC] Starting generateDynamicPlan function.');
    
    console.log('[DIAGNOSTIC] Step 1: Fetching health data from Firestore...');
    const healthDocs = await db.collection('users').doc(USER_ID).collection('health_data').orderBy('date', 'desc').limit(3).get();
    if (healthDocs.empty) {
        throw new Error("No health data found in Firestore. Please manually trigger the /api/sync-health endpoint in your browser.");
    }
    const latestHealth = healthDocs.docs[0].data();
    console.log(`[DIAGNOSTIC] OK: Got health data for date: ${latestHealth.date}`);

    console.log('[DIAGNOSTIC] Step 2: Constructing AI prompt...');
    const historicalWodExamples = `...`; // Unchanged
    const season = 'Cycling';
    const sleepScore = latestHealth?.sleep?.dailySleepDTO?.sleepScores?.overall?.value || 70;
    const hrvStatus = latestHealth?.hrv?.hrvSummary?.status || 'UNBALANCED';
    const readinessScore = Math.round((sleepScore * 0.6) + (hrvStatus === 'BALANCED' ? 40 : 10));
    const healthSummary = `- Readiness: ${readinessScore}/100, Sleep: ${sleepScore}/100, HRV: ${hrvStatus}`;
    const systemPrompt = `You are an elite AI coach...`;
    const userPrompt = `Generate the 7-day training plan for Chris...`; // This will be the full prompt
    console.log('[DIAGNOSTIC] OK: Prompt constructed.');

    console.log('[DIAGNOSTIC] Step 3: Sending request to Gemini API...');
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    const payload = { contents: [{ parts: [{ text: userPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] } };
    
    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[DIAGNOSTIC] FATAL: Gemini API request failed with status ${response.status}.`);
        console.error(`[DIAGNOSTIC] Gemini Error Body: ${errorBody}`);
        throw new Error(`The AI service rejected the request. Status: ${response.status}. The backend log has the full error body from Google.`);
    }
    const data = await response.json();
    console.log('[DIAGNOSTIC] OK: Received successful response from Gemini API.');
    
    const planText = data.candidates[0].content.parts[0].text;
    
    console.log('[DIAGNOSTIC] Step 4: Parsing AI response...');
    try {
        const plan = JSON.parse(planText.replace(/```json/g, '').replace(/```/g, '').trim());
        console.log('[DIAGNOSTIC] OK: Successfully parsed JSON. Plan generation complete.');
        return plan;
    } catch (parseError) {
        console.error('[DIAGNOSTIC] FATAL: Failed to parse JSON from Gemini response.');
        console.error('--- RAW AI TEXT START ---');
        console.error(planText);
        console.error('--- RAW AI TEXT END ---');
        throw new Error("The AI returned a plan in an invalid format. The raw text from the AI has been printed in the backend logs.");
    }
}

// --- API ENDPOINTS ---
app.get('/api/generate-plan', async (req, res) => {
    try {
        const plan = await generateDynamicPlan();
        res.json({ weeklyPlan: plan });
    } catch (error) {
        console.error("[DIAGNOSTIC] A critical error occurred in the /api/generate-plan endpoint:", error);
        res.status(500).json({ 
            error: 'The server failed while generating the plan.', 
            // **NEW: Send a detailed error object**
            details: {
                message: error.message,
                name: error.name,
                stack: error.stack // The most important part for debugging
            } 
        });
    }
});

// Other endpoints are unchanged
// ...
app.listen(PORT, () => console.log(`[OK] Server running on port ${PORT}`));


