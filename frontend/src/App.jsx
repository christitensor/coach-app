import React, { useEffect, useRef, useState } from 'react';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'https://coach-app-njh2.onrender.com'
).replace(/\/+$/, ''); // strip trailing slashes

function StatusBanner({ status }) {
  if (!status) return null;
  return (
    <div style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, marginBottom: 12 }}>
      <strong>Status:</strong> {status}
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState('Initializing…');
  const [health, setHealth] = useState(null);
  const [plan, setPlan] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState(null);

  const pollTimerRef = useRef(null);
  const abortRef = useRef(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (!API_BASE_URL) {
          throw Object.assign(new Error('VITE_API_BASE_URL is not set'), { name: 'ConfigError' });
        }

        // 1) Load latest health data (parse json ONCE)
        setStatus('Fetching health data…');
        const healthRes = await fetch(`${API_BASE_URL}/api/health-data`);
        const healthPayload = await safeJson(healthRes);
        if (!healthRes.ok) throw enrichError(new Error('Failed to fetch health data'), healthPayload);
        setHealth(healthPayload);

        // 2) Start background plan generation job
        setStatus('Starting plan generation…');
        const startRes = await fetch(`${API_BASE_URL}/api/start-plan-generation`, { method: 'POST' });
        const startPayload = await safeJson(startRes);
        if (!startRes.ok) throw enrichError(new Error('Failed to start generation'), startPayload);
        const { jobId: jid } = startPayload;
        setJobId(jid);
        setStatus('AI Coach is building your plan…');

        // 3) Begin polling for status
        await pollUntilDone(jid);
      } catch (e) {
        console.error('[INIT ERROR]', e);
        setError(toDisplayableError(e));
        setStatus('Failed');
      }
    })();
  }, []);

  async function pollUntilDone(jid) {
    // Defensive: clear any existing polling
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const maxMs = 1000 * 120; // cap at 2 minutes
    const intervalMs = 3000;
    const startTs = Date.now();

    const tick = async () => {
      if (Date.now() - startTs > maxMs) {
        const e = new Error('Polling timed out after 120s');
        setError(toDisplayableError(e));
        setStatus('Failed');
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/plan-status/${jid}`, {
          method: 'GET',
          signal: abortRef.current.signal,
          headers: { 'Accept': 'application/json' }
        });
        const body = await safeJson(res);

        // If it's not OK and not 202 (accepted), that's an error (e.g., 404/500)
        if (!res.ok && res.status !== 202) {
          throw enrichError(new Error('Status check failed'), body);
        }

        // Trust only the body.status enum
        const s = body?.status;
        if (s === 'completed') {
          setPlan(body?.result?.plan ?? body?.result ?? null);
          setStatus('Completed');
          return; // stop polling
        } else if (s === 'failed') {
          const errInfo = body?.error || { message: 'Unknown failure' };
          throw enrichError(new Error(errInfo.message || 'Generation failed'), errInfo);
        } else if (s === 'running' || s === 'pending') {
          setStatus(s === 'running' ? 'Generating…' : 'Queued…');
          pollTimerRef.current = setTimeout(tick, intervalMs);
        } else {
          // Unknown status => fail fast to avoid infinite spinner
          throw enrichError(new Error(`Unexpected status "${s}"`), body);
        }
      } catch (e) {
        console.error('[POLL ERROR]', e);
        setError(toDisplayableError(e));
        setStatus('Failed');
      }
    };

    tick(); // kick it off
  }

  return (
    <div style={{ maxWidth: 760, margin: '40px auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>The Uphill Athlete AI Coach</h1>
      <div style={{fontSize:12,opacity:0.7,marginBottom:8}}>API: {API_BASE_URL || '(unset)'}</div>
      <StatusBanner status={status} />

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #ffcccc', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          <strong>Error:</strong> {error.message}
          {error.details && (
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 12, overflow: 'auto' }}>
{error.details}
            </pre>
          )}
        </div>
      )}

      {plan ? (
        <PlanView plan={plan} health={health} jobId={jobId} />
      ) : (
        <p>AI Coach is building your plan… (this can take up to ~30 seconds)</p>
      )}
    </div>
  );
}

function PlanView({ plan, health, jobId }) {
  return (
    <div>
      <h2>Weekly Plan</h2>
      <pre style={{ whiteSpace: 'pre-wrap' }}>
{typeof plan === 'string' ? plan : JSON.stringify(plan, null, 2)}
      </pre>
      <div style={{ marginTop: 16, fontSize: 12, color: '#666' }}>
        <div>Job: {jobId}</div>
        <div>Readiness: {health?.readiness ?? health?.latestData?.readiness ?? '—'}</div>
      </div>
    </div>
  );
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return { status: res.status, text: await res.text().catch(() => '') };
  }
}

function enrichError(err, details) {
  err.details = details;
  return err;
}

function toDisplayableError(e) {
  const details = e?.details
    ? (typeof e.details === 'string' ? e.details : JSON.stringify(e.details, null, 2))
    : (e?.stack || '');
  return { message: e?.message || 'Unknown error', details };
}
