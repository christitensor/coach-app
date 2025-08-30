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

// --- INITIALIZATION ---
let db;
try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error("FIREBASE_SERVICE_ACCOUNT env var not set.");
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
    db = getFirestore();
} catch (error) {
    console.error("CRITICAL: Firebase initialization failed.", error);
    process.exit(1);
}

const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3001;

// --- DYNAMIC PLAN GENERATION ---
async function generateDynamicPlan() {
    console.log('[PLAN_GEN] Starting dynamic plan generation...');

    // 1. Gather Context
    console.log('[PLAN_GEN] Fetching health data from Firestore...');
    const healthDocs = await db.collection('users').doc(USER_ID).collection('health_data').orderBy('date', 'desc').limit(3).get();
    if (healthDocs.empty) {
        console.error('[PLAN_GEN] ERROR: No health data found in Firestore.');
        throw new Error("No health data available. Please sync health metrics first.");
    }
    const latestHealth = healthDocs.docs[0].data();
    console.log('[PLAN_GEN] Successfully fetched health data.');

    // 2. Construct Prompt
    const historicalWodExamples = `...`; // Unchanged
    const season = (new Date().getMonth() >= 3 && new Date().getMonth() <= 9) ? 'Cycling' : 'Ski/Base Building';
    const sleepScore = latestHealth?.sleep?.dailySleepDTO?.sleepScores?.overall?.value || 70;
    const hrvStatus = latestHealth?.hrv?.hrvSummary?.status || 'UNBALANCED';
    const readinessScore = Math.round((sleepScore * 0.6) + (hrvStatus === 'BALANCED' ? 40 : 10));
    const healthSummary = `- Readiness: ${readinessScore}/100, Sleep: ${sleepScore}/100, HRV: ${hrvStatus}`;
    console.log(`[PLAN_GEN] Health summary constructed: ${healthSummary}`);

    const systemPrompt = `You are an elite AI coach for an athlete named Chris...`; // Unchanged
    const userPrompt = `Generate the 7-day training plan for Chris...`; // Unchanged

    // 3. Call Gemini API
    if (!GEMINI_API_KEY) {
        console.error('[PLAN_GEN] ERROR: GEMINI_API_KEY is not set.');
        throw new Error("Server is missing API Key.");
    }
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    const payload = { contents: [{ parts: [{ text: userPrompt.replace('{{healthSummary}}', healthSummary) }] }], systemInstruction: { parts: [{ text: systemPrompt }] } };
    
    console.log('[PLAN_GEN] Sending request to Gemini API...');
    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[PLAN_GEN] ERROR: Gemini API failed with status ${response.status}. Body: ${errorBody}`);
        throw new Error(`Gemini API request failed.`);
    }
    
    const data = await response.json();
    console.log('[PLAN_GEN] Successfully received response from Gemini API.');

    if (!data.candidates || data.candidates.length === 0) {
        console.error('[PLAN_GEN] ERROR: Gemini API returned no candidates. Response:', JSON.stringify(data));
        throw new Error("Gemini API returned no candidates.");
    }

    const planText = data.candidates[0].content.parts[0].text;

    // 4. Parse Response
    console.log('[PLAN_GEN] Attempting to parse Gemini response...');
    try {
        const plan = JSON.parse(planText.replace(/```json/g, '').replace(/```/g, '').trim());
        console.log('[PLAN_GEN] Successfully parsed JSON. Plan generation complete.');
        return plan;
    } catch (parseError) {
        console.error('[PLAN_GEN] ERROR: Failed to parse JSON from Gemini response.');
        console.error('--- RAW GEMINI TEXT START ---');
        console.error(planText);
        console.error('--- RAW GEMINI TEXT END ---');
        throw new Error("AI returned an invalid plan format.");
    }
}

// --- API ENDPOINTS ---
app.get('/api/generate-plan', async (req, res) => {
    try {
        const plan = await generateDynamicPlan();
        res.json({ weeklyPlan: plan });
    } catch (error) {
        console.error("[API_ERROR] /api/generate-plan:", error);
        res.status(500).json({ error: 'Failed to generate a dynamic plan.', details: error.message });
    }
});
// Other endpoints (sync, etc.) remain unchanged...
app.get('/api/sync-health', async (req, res) => { /* ... */ });
app.get('/api/sync-workouts', async (req, res) => { /* ... */ });
app.get('/api/sync-routes', async (req, res) => { /* ... */ });
app.get('/api/health-data', async (req, res) => { /* ... */ });

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


