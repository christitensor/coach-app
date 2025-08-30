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

// --- HELPER FUNCTIONS ---
const getLatestSyncedFile = async (collectionName) => {
    const snapshot = await db.collection('users').doc(USER_ID).collection(collectionName).orderBy('processedAt', 'desc').limit(1).get();
    return snapshot.empty ? null : snapshot.docs[0].data();
};

const syncDriveFolder = async (folderId, collectionName, processor) => {
    if (!folderId) return { synced: 0, message: `Folder ID for ${collectionName} is not set.` };
    const latestSynced = await getLatestSyncedFile(collectionName);
    const lastSyncTime = latestSynced ? new Date(latestSynced.processedAt.toMillis()) : new Date(0);

    const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, createdTime)',
        orderBy: 'createdTime desc',
        pageSize: 20,
    });

    if (!res.data.files || res.data.files.length === 0) return { synced: 0, message: 'No files found in Drive folder.' };

    const recentFiles = res.data.files.filter(file => new Date(file.createdTime) > lastSyncTime);
    if (recentFiles.length === 0) return { synced: 0, message: 'No new files found.' };

    for (const file of recentFiles.reverse()) {
        try {
            await processor(file);
        } catch (error) {
            console.error(`Failed to process file ${file.name}:`, error.message);
        }
    }
    return { synced: recentFiles.length, message: `Successfully synced ${recentFiles.length} new file(s).` };
};

// --- FILE PROCESSORS ---
const processHealthFile = async (file) => {
    const fileContentRes = await drive.files.get({ fileId: file.id, alt: 'media' });
    const data = fileContentRes.data;
    const docId = data?.metrics?.date;
    if (docId) {
        await db.collection('users').doc(USER_ID).collection('health_data').doc(docId).set({
            ...data.metrics,
            fileName: file.name,
            processedAt: Timestamp.now(),
        });
    }
};
// Other processors (FIT, GPX) remain the same...
const processFitFile = async (file) => { /* ... unchanged ... */ };
const processGpxFile = async (file) => { /* ... unchanged ... */ };


// --- DYNAMIC PLAN GENERATION ---
async function generateDynamicPlan() {
    console.log('Generating dynamic weekly plan...');

    const healthDocs = await db.collection('users').doc(USER_ID).collection('health_data').orderBy('date', 'desc').limit(3).get();
    if (healthDocs.empty) throw new Error("No health data available. Sync health metrics first.");
    
    const latestHealth = healthDocs.docs[0].data();
    
    const historicalWodExamples = `...`; // Unchanged

    const season = (new Date().getMonth() >= 3 && new Date().getMonth() <= 9) ? 'Cycling' : 'Ski/Base Building';
    
    // **ROBUST DATA ACCESS** using optional chaining (?.)
    const sleepScore = latestHealth?.sleep?.dailySleepDTO?.sleepScores?.overall?.value || 70; // Default to 70 if not found
    const hrvStatus = latestHealth?.hrv?.hrvSummary?.status || 'UNBALANCED'; // Default to UNBALANCED

    const readinessScore = Math.round((sleepScore * 0.6) + (hrvStatus === 'BALANCED' ? 40 : 10));
    const healthSummary = `- Readiness: ${readinessScore}/100, Sleep: ${sleepScore}/100, HRV: ${hrvStatus}`;

    const systemPrompt = `...`; // Unchanged
    const userPrompt = `...`; // Unchanged, but will now receive valid data

    // Call Gemini API (unchanged)
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    // ... rest of the function is the same ...
    const payload = { contents: [{ parts: [{ text: userPrompt.replace('{{healthSummary}}', healthSummary) }] }], systemInstruction: { parts: [{ text: systemPrompt }] } };
    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Gemini API failed with status: ${response.status}`);
    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) throw new Error("Gemini API returned no candidates.");
    const planText = data.candidates[0].content.parts[0].text;
    return JSON.parse(planText.replace(/```json/g, '').replace(/```/g, '').trim());
}

// --- API ENDPOINTS ---
// Sync endpoints remain the same
app.get('/api/sync-health', async (req, res) => res.json(await syncDriveFolder(HEALTH_METRICS_FOLDER_ID, 'health_data', processHealthFile)));
app.get('/api/sync-workouts', async (req, res) => res.json(await syncDriveFolder(FIT_FILES_FOLDER_ID, 'workouts', processFitFile)));
app.get('/api/sync-routes', async (req, res) => res.json(await syncDriveFolder(GPX_ROUTES_FOLDER_ID, 'routes', processGpxFile)));


app.get('/api/health-data', async (req, res) => {
    try {
        const healthDocs = await db.collection('users').doc(USER_ID).collection('health_data').orderBy('date', 'desc').limit(1).get();
        if (healthDocs.empty) return res.status(404).json({ error: 'No health data found in database.' });
        
        const latestData = healthDocs.docs[0].data();
        
        // **ROBUST DATA ACCESS**
        const sleepScore = latestData?.sleep?.dailySleepDTO?.sleepScores?.overall?.value || 70;
        const hrvStatus = latestData?.hrv?.hrvSummary?.status || 'UNBALANCED';

        const readinessScore = Math.round((sleepScore * 0.6) + (hrvStatus === 'BALANCED' ? 40 : 10));
        const status = readinessScore > 75 ? 'High' : readinessScore > 50 ? 'Moderate' : 'Low';
        
        res.json({ latestData, readiness: { score: readinessScore, status } });
    } catch (error) {
        console.error("Error in /api/health-data:", error);
        res.status(500).json({ error: "Failed to process health data." });
    }
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

// Base endpoint to check if server is running
app.get('/', (req, res) => {
    res.json({ status: 'ok' });
});


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


