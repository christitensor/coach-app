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
    process.exit(1);
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
    console.log('[PLAN_GEN] Starting dynamic plan generation...');
    
    // 1. Gather Context
    console.log('[PLAN_GEN] Fetching health data from Firestore...');
    const healthDocs = await db.collection('users').doc(USER_ID).collection('health_data').orderBy('date', 'desc').limit(3).get();
    if (healthDocs.empty) {
        console.error('[PLAN_GEN] ERROR: No health data found in Firestore.');
        throw new Error("No health data available. Please trigger a sync or check Firebase.");
    }
    const latestHealth = healthDocs.docs[0].data();
    console.log(`[PLAN_GEN] OK: Got latest health data for date: ${latestHealth.date}`);

    // 2. Construct Prompt
    const historicalWodExamples = `...`; // Unchanged
    const season = (new Date().getMonth() >= 3 && new Date().getMonth() <= 9) ? 'Cycling' : 'Ski/Base Building';
    const sleepScore = latestHealth?.sleep?.dailySleepDTO?.sleepScores?.overall?.value || 70;
    const hrvStatus = latestHealth?.hrv?.hrvSummary?.status || 'UNBALANCED';
    const readinessScore = Math.round((sleepScore * 0.6) + (hrvStatus === 'BALANCED' ? 40 : 10));
    const healthSummary = `- Readiness: ${readinessScore}/100, Sleep: ${sleepScore}/100, HRV: ${hrvStatus}`;
    console.log(`[PLAN_GEN] OK: Health summary constructed: ${healthSummary}`);
    const userPrompt = `...`; // Unchanged, filled by template below

    const systemPrompt = `You are an elite AI coach...`; // Unchanged
    const fullUserPrompt = `Generate the 7-day training plan for Chris...\n**Athlete's Status:** ${healthSummary}\n... (rest of prompt)`;

    // 3. Call Gemini API
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    const payload = { contents: [{ parts: [{ text: fullUserPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] } };
    
    console.log('[PLAN_GEN] Sending request to Gemini API...');
    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[PLAN_GEN] FATAL: Gemini API failed with status ${response.status}. Body: ${errorBody}`);
        throw new Error(`The AI service returned an error. Status: ${response.status}. Check the backend logs for details.`);
    }
    const data = await response.json();
    console.log('[PLAN_GEN] OK: Received successful response from Gemini API.');

    if (!data.candidates || data.candidates.length === 0) {
        console.error('[PLAN_GEN] FATAL: Gemini API returned no plan. Response:', JSON.stringify(data));
        throw new Error("The AI service returned an empty plan. This may be a temporary issue.");
    }
    const planText = data.candidates[0].content.parts[0].text;

    // 4. Parse Response
    try {
        const plan = JSON.parse(planText.replace(/```json/g, '').replace(/```/g, '').trim());
        console.log('[PLAN_GEN] OK: Successfully parsed JSON. Plan generation complete.');
        return plan;
    } catch (parseError) {
        console.error('[PLAN_GEN] FATAL: Failed to parse JSON from Gemini response.');
        console.error('--- RAW GEMINI TEXT START ---');
        console.error(planText);
        console.error('--- RAW GEMINI TEXT END ---');
        throw new Error("The AI returned a plan in an invalid format. Check the backend logs for the raw text.");
    }
}

// --- API ENDPOINTS ---
app.get('/api/health-data', async (req, res) => {
    // ... This function is unchanged but would benefit from similar logging if it fails.
});

app.get('/api/generate-plan', async (req, res) => {
    console.log('[HIT] /api/generate-plan');
    try {
        const plan = await generateDynamicPlan();
        res.json({ weeklyPlan: plan });
    } catch (error) {
        console.error("[ERROR] in /api/generate-plan endpoint:", error);
        res.status(500).json({ error: 'The server encountered an error while generating the plan.', details: error.message });
    }
});

// ... All other sync endpoints and server start logic are unchanged ...
app.listen(PORT, () => console.log(`[OK] Server running on port ${PORT}, accepting requests from ${FRONTEND_URL}`));


