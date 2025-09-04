'use strict';

/**
 * Deployment-ready Express backend for Uphill Athlete AI Coach
 * - Robust CORS (accepts exact FRONTEND_URL, ignoring trailing slashes)
 * - Firestore via service account JSON (FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT)
 * - Safe fallback to stubbed health data when Firestore is not configured
 * - Asynchronous plan generation with in-memory job store
 */

const express = require('express');
const cors = require('cors');
const fetch = require('cross-fetch');
const { randomUUID } = require('crypto');

// ====== ENV ======
const PORT = process.env.PORT || 8080;
const USER_ID = process.env.USER_ID || 'chris-main';
const FRONTEND_URL_RAW = process.env.FRONTEND_URL || ''; // e.g. https://your-app.vercel.app (NO trailing slash)
const FRONTEND_URL = FRONTEND_URL_RAW.replace(/\/+$/, ''); // normalize (strip trailing slashes)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';   // optional; stub used if empty
const FIREBASE_SA_JSON =
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
  process.env.FIREBASE_SERVICE_ACCOUNT || '';              // support both names

// ====== APP (create BEFORE use) ======
const app = express();

// CORS: allow exact FRONTEND_URL if provided; otherwise allow all (dev/testing)
app.use(
  cors({
    origin: (origin, cb) => {
      if (!FRONTEND_URL) return cb(null, true);        // open during testing
      if (!origin) return cb(null, false);             // block non-browser/no-origin
      const norm = origin.replace(/\/+$/, '');
      return cb(null, norm === FRONTEND_URL);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));

// Simple request log (helps on Render)
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.path} from ${req.headers.origin || 'no-origin'}`);
  next();
});

// ====== Firestore (optional) ======
let db = null;
(() => {
  if (!FIREBASE_SA_JSON) {
    console.log('[INFO] No Firestore credentials provided; running in stub mode');
    return;
  }
  try {
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');
    if (!global._adminInitialized) {
      initializeApp({ credential: cert(JSON.parse(FIREBASE_SA_JSON)) });
      global._adminInitialized = true;
    }
    db = getFirestore();
    console.log('[OK] Firestore initialized');
  } catch (e) {
    db = null;
    console.warn('[WARN] Firestore init failed; falling back to stub mode:', e?.message);
  }
})();

// ====== In-memory job store ======
/**
 * status: 'pending' | 'running' | 'completed' | 'failed'
 */
const jobStore = new Map();
const VALID_STATUS = new Set(['pending', 'running', 'completed', 'failed']);
const JOB_TTL_MS = 30 * 60 * 1000; // 30 min

function createJob() {
  const id = randomUUID();
  const now = new Date();
  const entry = {
    id,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    result: null,
    error: null,
    ttlMs: JOB_TTL_MS,
  };
  jobStore.set(id, entry);
  return entry;
}

function setJobStatus(id, status, payload = {}) {
  const j = jobStore.get(id);
  if (!j) return;
  j.status = status;
  j.updatedAt = new Date();
  if (status === 'completed') {
    j.result = { plan: payload.plan ?? null };
    j.error = null;
  } else if (status === 'failed') {
    j.error = {
      message: payload.message || 'Unknown error',
      name: payload.name || 'Error',
      stack: payload.stack || undefined,
    };
  }
  jobStore.set(id, j);
}

function getJob(id) {
  return jobStore.get(id) || null;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, j] of jobStore.entries()) {
    if (now - j.createdAt.getTime() > j.ttlMs) jobStore.delete(id);
  }
}, 60_000).unref();

// ====== Helpers ======
async function readLatestHealth() {
  // Always return a 200 payload; never throw to the route
  const stub = {
    latestData: { sleepScore: 80, hrv: 75, readiness: 0.72, timestamp: new Date().toISOString() },
    readiness: 0.72,
    __stub: !db,
  };
  if (!db) return stub;

  try {
    const snap = await db
      .collection('users')
      .doc(USER_ID)
      .collection('health')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (snap.empty) return { latestData: null, readiness: null };
    const doc = snap.docs[0].data();
    return { latestData: doc, readiness: doc.readiness ?? null };
  } catch (e) {
    console.warn('[WARN] readLatestHealth failed; using stub:', e?.message);
    return stub;
  }
}

async function writePlan(plan, jobId) {
  if (!db) return null;
  try {
    const { Timestamp } = require('firebase-admin/firestore');
    const ref = db.collection('users').doc(USER_ID).collection('plans').doc(jobId);
    await ref.set({ jobId, plan, createdAt: Timestamp.now() });
    return { id: ref.id };
  } catch (e) {
    console.warn('[WARN] writePlan failed:', e?.message);
    return null;
  }
}

async function callGeminiForPlan({ health }) {
  // Dev/stub path if no key provided
  if (!GEMINI_API_KEY) {
    return {
      week: [
        { day: 'Mon', focus: 'Recovery spin + mobility', details: '45min Z1; hip/ankle care' },
        { day: 'Tue', focus: 'Group ride HIIT + CrossFit accessory', details: '3x8min @ 105% FTP' },
        { day: 'Wed', focus: 'Gym or MTB fun lap', details: 'Strength: hinge/pull; Z2 60–90' },
        { day: 'Thu', focus: 'Threshold focus', details: '2x20min @ 95% FTP' },
        { day: 'Fri', focus: 'Partner e-MTB social', details: 'Keep Z1/low Z2; mobility' },
        { day: 'Sat', focus: 'Long endurance', details: '3–4h Z2; fueling practice' },
        { day: 'Sun', focus: 'CrossFit + mobility', details: 'Chipper; posterior chain reset' },
      ],
      meta: { source: 'stub', readiness: health?.readiness ?? null },
    };
  }

  const prompt = `Generate a 7-day integrated training plan considering readiness=${health?.readiness}. Include CrossFit and mobility a la Supple Leopard.`;

  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' +
      GEMINI_API_KEY,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6 },
      }),
    }
  );

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

// ====== Routes ======

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), jobs: jobStore.size });
});

// Latest health (never throws; returns stub if needed)
app.get('/api/health-data', async (req, res) => {
  try {
    const data = await readLatestHealth();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: true,
      message: 'Failed to load health data',
      details: { message: error.message, name: error.name, stack: error.stack },
    });
  }
});

// Start plan generation (accept GET or POST to make iPad testing easy)
app.all('/api/start-plan-generation', async (req, res) => {
  const job = createJob();
  res.json({ jobId: job.id, status: job.status });

  (async () => {
    try {
      setJobStatus(job.id, 'running');
      const health = await readLatestHealth();
      const plan = await callGeminiForPlan({ health });
      await writePlan(plan, job.id);
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

// Poll status
app.get('/api/plan-status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);
  if (!job) return res.status(404).json({ error: true, message: 'Job not found' });

  if (!VALID_STATUS.has(job.status)) {
    setJobStatus(job.id, 'failed', { message: `Invalid status: ${job.status}` });
  }

  const body = {
    jobId: job.id,
    status: job.status,
    updatedAt: job.updatedAt.toISOString(),
    result: job.status === 'completed' ? job.result : null,
    error: job.status === 'failed' ? job.error : null,
  };

  // 200 for terminal states; 202 for in-progress
  if (job.status === 'completed' || job.status === 'failed') return res.status(200).json(body);
  return res.status(202).json(body);
});

// 404
app.use((req, res) => res.status(404).json({ error: true, message: 'Not found' }));

// Listen
app.listen(PORT, () => {
  console.log(`[OK] Server listening on :${PORT}`);
});
