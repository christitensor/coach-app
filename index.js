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
const USER_ID = 'chris-main'; // A stable user ID

// --- INITIALIZATION ---
let db;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
    db = getFirestore();
} catch (error) {
    console.error("Firebase initialization failed. Make sure FIREBASE_SERVICE_ACCOUNT is set correctly.", error);
    process.exit(1);
}

const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
const PORT = process.env.PORT || 3001;

// --- HELPER: GET LATEST SYNCED FILE ---
const getLatestSyncedFile = async (collectionName) => {
    const snapshot = await db.collection('users').doc(USER_ID).collection(collectionName).orderBy('processedAt', 'desc').limit(1).get();
    return snapshot.empty ? null : snapshot.docs[0].data();
};

// --- SYNC LOGIC ---
const syncDriveFolder = async (folderId, collectionName, processor) => {
    if (!folderId) return { synced: 0, message: `Folder ID for ${collectionName} is not set.` };
    const latestSynced = await getLatestSyncedFile(collectionName);
    const lastSyncTime = latestSynced ? new Date(latestSynced.processedAt.toMillis()) : new Date(0);

    const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, createdTime, webViewLink)',
        orderBy: 'createdTime desc',
        pageSize: 20,
    });

    const recentFiles = res.data.files.filter(file => new Date(file.createdTime) > lastSyncTime);
    if (recentFiles.length === 0) return { synced: 0, message: 'No new files found.' };

    for (const file of recentFiles.reverse()) { // Process oldest first
        await processor(file);
    }
    return { synced: recentFiles.length, message: `Successfully synced ${recentFiles.length} new file(s).` };
};

// --- FILE PROCESSORS ---
const processHealthFile = async (file) => {
    const fileContent = await drive.files.get({ fileId: file.id, alt: 'media' });
    const data = fileContent.data; // This is already a JS object from axios
    const docId = data.metrics.date; // e.g., '2025-08-30'
    await db.collection('users').doc(USER_ID).collection('health_data').doc(docId).set({
        ...data.metrics,
        fileName: file.name,
        processedAt: Timestamp.now(),
    });
};

const processFitFile = async (file) => {
    // In a real app, you'd parse the .fit binary file here.
    // For now, we'll just log its metadata.
    await db.collection('users').doc(USER_ID).collection('workouts').add({
        fileName: file.name,
        date: new Date(file.createdTime),
        type: 'FIT',
        processedAt: Timestamp.now(),
    });
};

const processGpxFile = async (file) => {
    // In a real app, you'd parse the GPX XML here.
    // For now, we'll just log its metadata.
    await db.collection('users').doc(USER_ID).collection('routes').add({
        fileName: file.name,
        date: new Date(file.createdTime),
        processedAt: Timestamp.now(),
    });
};


// --- DYNAMIC PLAN GENERATION ---
async function generateDynamicPlan() {
    console.log('Generating dynamic weekly plan with historical context and mobility...');

    // 1. Gather Context
    const healthDocs = await db.collection('users').doc(USER_ID).collection('health_data').orderBy('date', 'desc').limit(3).get();
    if (healthDocs.empty) throw new Error("No health data available. Please sync health metrics first.");
    const healthTrends = healthDocs.docs.map(doc => doc.data());
    const latestHealth = healthTrends[0];
    
    const historicalWodExamples = `
      - "Title: 23.3", WOD: "6-min cap: 5 wall walks, 50 DUs, 15 snatches (95 lb)..."
      - "Title: Adroit", WOD: "For Time: 1,000m Row, 50 Wall Balls, 25 C2B Pull-ups"
      - "Title: Team Murph", WOD: "For Time (team of 2): 1 Mile Run, 100 Pull-ups, 200 Push-ups, 300 Squats, 1 Mile Run"
    `;

    const season = (new Date().getMonth() >= 3 && new Date().getMonth() <= 9) ? 'Cycling' : 'Ski/Base Building';
    const readinessScore = Math.round((latestHealth.sleep.dailySleepDTO.sleepScores.overall.value * 0.6) + (latestHealth.hrv.hrvSummary.status === 'BALANCED' ? 40 : 10));
    const healthSummary = `- Readiness: ${readinessScore}/100, Sleep: ${latestHealth.sleep.dailySleepDTO.sleepScores.overall.value}/100, HRV: ${latestHealth.hrv.hrvSummary.status}`;

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

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    const payload = { contents: [{ parts: [{ text: userPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] } };
    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Gemini API failed with status: ${response.status}`);
    const data = await response.json();
    const planText = data.candidates[0].content.parts[0].text;
    return JSON.parse(planText.replace(/```json/g, '').replace(/```/g, '').trim());
}

// --- API ENDPOINTS ---
app.get('/api/sync-health', async (req, res) => res.json(await syncDriveFolder(HEALTH_METRICS_FOLDER_ID, 'health_data', processHealthFile)));
app.get('/api/sync-workouts', async (req, res) => res.json(await syncDriveFolder(FIT_FILES_FOLDER_ID, 'workouts', processFitFile)));
app.get('/api/sync-routes', async (req, res) => res.json(await syncDriveFolder(GPX_ROUTES_FOLDER_ID, 'routes', processGpxFile)));

app.get('/api/health-data', async (req, res) => {
    const healthDocs = await db.collection('users').doc(USER_ID).collection('health_data').orderBy('date', 'desc').limit(1).get();
    if (healthDocs.empty) return res.status(404).json({ error: 'No health data found.' });
    const latestData = healthDocs.docs[0].data();
    const readinessScore = Math.round((latestData.sleep.dailySleepDTO.sleepScores.overall.value * 0.6) + (latestData.hrv.hrvSummary.status === 'BALANCED' ? 40 : 10));
    const status = readinessScore > 75 ? 'High' : readinessScore > 50 ? 'Moderate' : 'Low';
    res.json({ latestData, readiness: { score: readinessScore, status } });
});

app.get('/api/generate-plan', async (req, res) => {
    try {
        const plan = await generateDynamicPlan();
        res.json({ weeklyPlan: plan });
    } catch (error) {
        console.error("Failed to generate plan:", error);
        res.status(500).json({ error: 'Failed to generate a dynamic plan.', details: error.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


