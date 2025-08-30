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
const corsOptions = { origin: FRONTEND_URL || 'http://localhost:5173' };
app.use(cors(corsOptions));
app.use(express.json());
const PORT = process.env.PORT || 3001;

// --- DYNAMIC PLAN GENERATION (No change to this function's logic) ---
async function generateDynamicPlan() {
    // This function's internal logic is the same as the last version.
    // ...
}

// --- API ENDPOINTS ---

// NEW: A fast endpoint just for health data
app.get('/api/health-data', async (req, res) => {
    try {
        const healthDocs = await db.collection('users').doc(USER_ID).collection('health_data').orderBy('date', 'desc').limit(1).get();
        if (healthDocs.empty) {
            return res.status(404).json({ error: 'No health data found in database.' });
        }
        
        const latestData = healthDocs.docs[0].data();
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

// The plan generation endpoint remains, but the frontend will call it second.
app.get('/api/generate-plan', async (req, res) => {
    try {
        const plan = await generateDynamicPlan();
        res.json({ weeklyPlan: plan });
    } catch (error) {
        console.error("Failed to generate plan:", error);
        res.status(500).json({ error: 'Failed to generate a dynamic plan.', details: error.message });
    }
});


// Sync endpoints are unchanged
// ...

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


