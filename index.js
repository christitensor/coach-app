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
const FRONTEND_URL = process.env.FRONTEND_URL; // Get the approved frontend URL

// --- INITIALIZATION ---
let db;
try {
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

// --- CORS CONFIGURATION (THE FIX) ---
// This tells the server to only accept requests from your Vercel app.
const corsOptions = {
  origin: FRONTEND_URL || 'http://localhost:5173', // Fallback for local testing
};
app.use(cors(corsOptions));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// --- ALL OTHER FUNCTIONS (generateDynamicPlan, syncDriveFolder, etc.) ---
// The rest of the file is exactly the same as the last robust version.
// For brevity, it is omitted here, but you should paste the full file content from my previous message.
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
    const historicalWodExamples = `
      - "Title: 23.3", WOD: "6-min cap: 5 wall walks, 50 DUs, 15 snatches (95 lb)..."
      - "Title: Adroit", WOD: "For Time: 1,000m Row, 50 Wall Balls, 25 C2B Pull-ups"
      - "Title: Team Murph", WOD: "For Time (team of 2): 1 Mile Run, 100 Pull-ups, 200 Push-ups, 300 Squats, 1 Mile Run"
    `;
    const season = (new Date().getMonth() >= 3 && new Date().getMonth() <= 9) ? 'Cycling' : 'Ski/Base Building';
    const sleepScore = latestHealth?.sleep?.dailySleepDTO?.sleepScores?.overall?.value || 70;
    const hrvStatus = latestHealth?.hrv?.hrvSummary?.status || 'UNBALANCED';
    const readinessScore = Math.round((sleepScore * 0.6) + (hrvStatus === 'BALANCED' ? 40 : 10));
    const healthSummary = `- Readiness: ${readinessScore}/100, Sleep: ${sleepScore}/100, HRV: ${hrvStatus}`;
    console.log(`[PLAN_GEN] Health summary constructed: ${healthSummary}`);

    const systemPrompt = `You are an elite AI coach for an athlete named Chris. Your expertise combines OG CrossFit (WCABTMD), Uphill Athlete, Keegan Swenson, and Kelly Starrett's "Becoming a Supple Leopard" mobility principles. You create holistic, adaptive training plans.`;
    const userPrompt = `
      Generate the 7-day training plan for Chris.

      **Athlete's Status:** ${healthSummary}
      **Weekly Schedule:** Mon(Gym), Tue(Hard Ride), Wed(Flex), Thu(Free Ride), Fri(Gym), Sat(Long Ride), Sun(Flex)
      **Historical WOD Style:** ${historicalWodExamples}

      **Your Task:**
      1.  Analyze readiness. If score < 60, today's workout MUST be 'Recovery'.
      2.  Generate a specific, CrossFit-style workout for each 'Gym' day, inspired by the historical examples and complementing the cycling schedule.
      3.  **For EACH day, create a dynamic, targeted mobility routine in the style of Kelly Starrett.** This routine should directly support the day's workout, focusing on tissue preparation (pre-workout) or recovery (post-workout).
      4.  Fill in the rest of the week based on the schedule and the current season (${season}).
      5.  Return ONLY a valid JSON object. For each day, it must include "title", "type", a "workout" object {name, description}, and a "mobility" object {name, description}. Do not add any other text.
    `;

    // 3. Call Gemini API
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    const payload = { contents: [{ parts: [{ text: userPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] } };
    
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
// ... rest of the functions and endpoints ...
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


