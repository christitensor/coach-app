    const express = require('express');
    const cors = require('cors');
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');
    const fetch = require('cross-fetch');
    const fs = require('fs');
    const path = require('path');

    // --- FIREBASE SETUP ---
    // This will be securely loaded from an environment variable on our hosting service
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    initializeApp({ credential: cert(serviceAccount) });
    const db = getFirestore();

    // --- EXPRESS APP SETUP ---
    const app = express();
    app.use(cors());
    app.use(express.json());

    const PORT = process.env.PORT || 3001;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    // --- API ENDPOINTS ---
    app.get('/api/health-data', async (req, res) => {
        try {
            const userId = 'default-user';
            const healthDocs = await db.collection('users').doc(userId).collection('health_data').orderBy('date', 'desc').limit(4).get();
            if (healthDocs.empty) return res.status(404).json({ message: 'No health data found.' });
            const trends = healthDocs.docs.map(doc => doc.data());
            const latestData = trends[0];
            const sleepContribution = latestData.sleepScore * 0.5;
            const hrvContribution = (latestData.hrvStatus === 'BALANCED' ? 25 : (latestData.hrvStatus === 'UNBALANCED' ? 10 : 0));
            const rhrContribution = (latestData.restingHeartRate < 45 ? 25 : 10);
            const readinessScore = Math.round(sleepContribution + hrvContribution + rhrContribution);
            const readiness = { score: readinessScore, status: readinessScore > 75 ? 'Optimal' : readinessScore > 50 ? 'Good' : 'Low' };
            res.json({ latestData, trends: trends.reverse(), readiness });
        } catch (error) {
            console.error('Error fetching health data:', error);
            res.status(500).json({ error: 'Failed to fetch health data' });
        }
    });

    app.post('/api/generate-content', async (req, res) => {
        if (!GEMINI_API_KEY) return res.status(500).json({ error: 'API key is not configured on the server.' });
        const { payload } = req.body;
        if (!payload) return res.status(400).json({ error: 'Missing payload for Gemini API.' });
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
        try {
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Gemini API request failed: ${response.status} ${errorBody}`);
            }
            const data = await response.json();
            res.json(data);
        } catch (error) {
            console.error('Error proxying to Gemini API:', error);
            res.status(500).json({ error: 'Failed to generate content' });
        }
    });

    // --- ONE-TIME DATA SEEDING ENDPOINT ---
    app.get('/api/seed-database', async (req, res) => {
        console.log('Attempting to seed database...');
        try {
            const userId = 'default-user';
            // NOTE: In a real app, you would upload these files or have them in cloud storage.
            // For this iPad setup, we'll embed the content directly.
            const healthFilesContent = {
                '2025-08-26_AM.json': {"metrics":{"date":"2025-08-26","sleep":{"dailySleepDTO":{"sleepScores":{"overall":{"value":75}}}},"hrv":{"hrvSummary":{"status":"BALANCED"}},"resting_hr":{"allMetrics":{"metricsMap":{"WELLNESS_RESTING_HEART_RATE":[{"value":41}]}}},"body_battery":[{},{"charged":51,"drained":67}]}},
                '2025-08-27_AM.json': {"metrics":{"date":"2025-08-27","sleep":{"dailySleepDTO":{"sleepScores":{"overall":{"value":88}}}},"hrv":{"hrvSummary":{"status":"BALANCED"}},"resting_hr":{"allMetrics":{"metricsMap":{"WELLNESS_RESTING_HEART_RATE":[{"value":39}]}}},"body_battery":[{},{"charged":60,"drained":55}]}},
                '2025-08-28_PM.json': {"metrics":{"date":"2025-08-28","sleep":{"dailySleepDTO":{"sleepScores":{"overall":{"value":93}}}},"hrv":{"hrvSummary":{"status":"UNBALANCED"}},"resting_hr":{"allMetrics":{"metricsMap":{"WELLNESS_RESTING_HEART_RATE":[{"value":37}]}}},"body_battery":[{},{"charged":40,"drained":63}]}}
            };

            let count = 0;
            for (const [fileName, fileContent] of Object.entries(healthFilesContent)) {
                const data = fileContent.metrics;
                const processedData = {
                    date: data.date,
                    sleepScore: data.sleep.dailySleepDTO.sleepScores.overall.value,
                    hrvStatus: data.hrv.hrvSummary.status,
                    restingHeartRate: data.resting_hr.allMetrics.metricsMap.WELLNESS_RESTING_HEART_RATE[0].value,
                    bodyBatteryCharged: data.body_battery[1]?.charged || 0,
                    bodyBatteryDrained: data.body_battery[1]?.drained || 0,
                };
                await db.collection('users').doc(userId).collection('health_data').doc(processedData.date).set(processedData);
                console.log(`Seeded health data for ${processedData.date}`);
                count++;
            }
            res.status(200).send(`Successfully seeded ${count} health data documents. You should now REMOVE the /api/seed-database endpoint from your index.js file for security.`);
        } catch (error) {
            console.error('Error during database seeding:', error);
            res.status(500).json({ error: 'Failed to seed database.' });
        }
    });

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    

