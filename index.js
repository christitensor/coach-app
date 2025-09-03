'use strict';

const express = require('express');
const cors = require('cors');
const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const fetch = require('cross-fetch');
const { randomUUID } = require('crypto');

// ====== CONFIG ======
const PORT = process.env.PORT || 8080;
const USER_ID = process.env.USER_ID || 'chris-main';
const FRONTEND_URL = process.env.FRONTEND_URL || '*'; // set to your Vercel URL in prod
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Optional Firestore init via service account JSON
let db = null;
try {
  if (!global._adminInitialized) {
    const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (svcJson) {
      const credentials = JSON.parse(svcJson);
      initializeApp({ credential: cert(credentials) });
    } else {
      // fallback to ADC if on GCP
      initializeApp({ credential: applicationDefault() });
    }
    global._adminInitialized = true;
  }
  db = getFirestore();
  console.log('[OK] Firestore initialized');
} catch (err) {
  console.warn('[WARN] Firestore not initialized; proceeding without DB:', err?.message);
}

// ====== APP ======
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: FRONTEND_URL === '*' ? true : FRONTEND_URL,
  credentials: true,
}));

// ====== IN-MEMORY JOB STORE (authoritative for job lifecycle) ======
/**
 * jobStore[jobId] = {
 *   id: string,
 *   status: 'pending' | 'running' | 'completed' | 'failed',
 *   createdAt: Date,
 *   updatedAt: Date,
 *   result: { plan?: any } | null,
 *   error: { message: string, name?: string, stack?: string } | null,
 *   ttlMs: number,
 * }
 */
const jobStore = new Map();
const DEFAULT_TTL_MS = 1000 * 60 * 30; // 30 minutes

function createJob(ttlMs = DEFAULT_TTL_MS) {
  const id = randomUUID();
  const now = new Date();
  const entry = {
    id,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    result: null,
    error: null,
    ttlMs,
  };
  jobStore.set(id, entry);
  return entry;
}

function setJobStatus(id, status, payload = {}) {
  const entry = jobStore.get(id);
  if (!entry) return;
  entry.status = status;
  entry.updatedAt = new Date();
  if (status === 'completed') {
    entry.result = { plan: payload.plan ?? null };
    entry.error = null;
  } else if (status === 'failed') {
    entry.error = {
      message: payload.message || 'Unknown error',
      name: payload.name || 'Error',
      stack: payload.stack || undefined,
    };
  }
  jobStore.set(id, entry);
}

function getJob(id) {
  return jobStore.get(id) || null;
}

function gcJobs() {
  const now = Date.now();
  for (const [id, entry] of jobStore.entries()) {
    const age = now - entry.createdAt.getTime();
    if (age > entry.ttlMs) {
      jobStore.delete(id);
    }
  }
}
setInterval(gcJobs, 60_000).unref(); // GC every minute

// ====== HELPERS ======
async function readLatestHealth() {
  if (!db) {
    // Dev fallback so you can test locally without Firestore
    return {
      latestData: { sleepScore: 80, hrv: 75, readiness: 0.72, timestamp: new Date().toISOString() },
      readiness: 0.72,
    };
  }
  // users/{USER_ID}/health ordered by timestamp desc
  const snap = await db.collection('users').doc(USER_ID).collection('health')
    .orderBy('timestamp', 'desc').limit(1).get();
  if (snap.empty) return { latestData: null, readiness: null };
  const doc = snap.docs[0].data();
  return { latestData: doc, readiness: doc.readiness ?? null };
}

async function writePlan(plan, jobId) {
  if (!db) return null;
  const ref = db.collection('users').doc(USER_ID).collection('plans').doc(jobId);
  await ref.set({
    jobId,
    plan,
    createdAt: Timestamp.now(),
  });
  return { id: ref.id };
}

async function callGeminiForPlan({ health }) {
  if (!GEMINI_API_KEY) {
    // Dev stub
    return {
      week: [
        { day: 'Mon', focus: 'Recovery spin + mobility', details: '45min Z1; hip/ankle care' },
        { day: 'Tue', focus: 'Group ride HIIT + CrossFit accessory', details: '3x8min @ 105% FTP' },
        { day: 'Wed', focus: 'Gym or MTB fun lap', details: 'Strength hinge/pull; Z2 60–90' },
        { day: 'Thu', focus: 'Threshold focus', details: '2x20min @ 95% FTP' },
        { day: 'Fri', focus: 'Partner e-MTB social', details: 'Keep Z1/low Z2; mobility' },
        { day: 'Sat', focus: 'Long endurance', details: '3–4h Z2; fueling practice' },
        { day: 'Sun', focus: 'CrossFit + mobility', details: 'Chipper; posterior chain reset' },
      ],
      meta: { source: 'stub', readiness: health?.readiness ?? null },
    };
  }

  // Minimal Gemini call; adjust model/version as desired
  const prompt = `Generate a 7-day integrated training plan considering readiness=${health?.readiness}. Include CrossFit and mobility a la Supple Leopard.`;
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_API_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6 },
    }),
  });
  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    const e = new Error(`Gemini API error ${res.status}: ${errTxt.slice(0, 400)}`);
    e.name = 'GeminiAPIError';
    throw e;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No content';
  return { week: text, meta: { source: 'gemini' } };
}

// ====== ROUTES ======
app.get('/api/health-data', async (req, res) => {
  try {
    const data = await readLatestHealth();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: true,
      message: 'Failed to load health data',
      details: { message: error.message, name: error.name, stack: error.stack }
    });
  }
});

app.post('/api/start-plan-generation', async (req, res) => {
  // Return immediately with a jobId
  const job = createJob();
  res.json({ jobId: job.id, status: job.status });

  // Background work
  (async () => {
    try {
      setJobStatus(job.id, 'running');
      const health = await readLatestHealth();
      const plan = await callGeminiForPlan({ health });
      await writePlan(plan, job.id).catch((e) => {
        console.warn('[WARN] writePlan failed:', e.message);
      });
      setJobStatus(job.id, 'completed', { plan });
    } catch (error) {
      setJobStatus(job.id, 'failed', {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
    }
  })();
});

// Single source of truth for job status; NEVER change these enum strings
const VALID_JOB_STATUS = new Set(['pending', 'running', 'completed', 'failed']);

app.get('/api/plan-status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: true, message: 'Job not found' });
  }
  if (!VALID_JOB_STATUS.has(job.status)) {
    // Defensive: normalize unknown statuses as failed
    setJobStatus(job.id, 'failed', { message: `Invalid status: ${job.status}` });
  }
  const body = {
    jobId: job.id,
    status: job.status,
    updatedAt: job.updatedAt.toISOString(),
    result: job.status === 'completed' ? job.result : null,
    error: job.status === 'failed' ? job.error : null,
  };
  // Hint with status codes, but the client should rely on body.status
  if (job.status === 'completed' || job.status === 'failed') {
    return res.status(200).json(body);
  } else {
    return res.status(202).json(body);
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), jobs: jobStore.size });
});

// Fallback
app.use((req, res) => {
  res.status(404).json({ error: true, message: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`[OK] Server listening on :${PORT}`);
});
