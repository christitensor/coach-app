import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Bike, Dumbbell, Heart, Brain, Sparkles, Loader2, Info, BedDouble, BatteryCharging, Activity,
  Calendar, ChevronDown, ChevronUp, MapPin, CheckCircle2, XCircle, Timer
} from 'lucide-react';

// -------- API base (robust) --------
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'https://coach-app-njh2.onrender.com'
).replace(/\/+$/, '');

// -------- Small UI bits --------
const Pill = ({ tone='info', children }) => {
  const toneMap = {
    info:  'bg-sky-900/40 text-sky-300 border border-sky-700/50',
    good:  'bg-emerald-900/30 text-emerald-300 border border-emerald-700/50',
    warn:  'bg-amber-900/30 text-amber-300 border border-amber-700/40',
    bad:   'bg-rose-900/30 text-rose-300 border border-rose-700/50',
    dim:   'bg-gray-800 text-gray-300 border border-gray-700'
  };
  return <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${toneMap[tone]}`}>{children}</span>;
};

const Section = ({ title, icon, children, defaultOpen=true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-800/80 rounded-xl bg-gray-900/40 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-gray-200">
          {icon}{title && <h3 className="font-semibold">{title}</h3>}
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>
      <div className={`${open ? 'block' : 'hidden'} px-4 pb-4`}>
        {children}
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, sub }) => (
  <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-4">
    <div className="flex items-center justify-between">
      <span className="text-gray-400 text-sm">{label}</span>
      {icon}
    </div>
    <div className="mt-2 flex items-baseline gap-2">
      <span className="text-2xl font-bold text-white">{value ?? '—'}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  </div>
);

// -------- Data helpers --------
const iconFor = (type) => {
  if (!type) return <Dumbbell className="w-5 h-5 text-gray-400" />;
  const t = String(type).toLowerCase();
  if (t.includes('ride') || t.includes('bike') || t.includes('cycle')) return <Bike className="w-5 h-5 text-sky-400" />;
  if (t.includes('recovery') || t.includes('rest')) return <Heart className="w-5 h-5 text-emerald-400" />;
  return <Dumbbell className="w-5 h-5 text-amber-400" />;
};

function normalizeWeek(plan) {
  // Supports: { week: [ {day, focus, details} ] } OR raw string
  if (plan && Array.isArray(plan.week)) {
    // Ensure 7 items with readable fields
    return plan.week.map((d, idx) => ({
      key: d.day || ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][idx],
      title: d.focus || 'Session',
      details: d.details || '',
      type: d.type || (d.focus?.toLowerCase().includes('ride') ? 'Ride' : (d.focus?.toLowerCase().includes('mobility') ? 'Recovery' : 'Gym'))
    }));
  }
  return null; // indicates text plan
}

// -------- Main App --------
export default function App() {
  const [status, setStatus] = useState('Initializing…');
  const [jobId, setJobId] = useState(null);
  const [health, setHealth] = useState(null);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const pollTimerRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // 0) Show API for debugging
        console.log('[API]', API_BASE_URL);

        // 1) Health
        setStatus('Fetching health…');
        const hr = await fetch(`${API_BASE_URL}/api/health-data`, { headers: { Accept: 'application/json' }});
        const h = await safeJson(hr);
        if (!hr.ok) throw enrich(new Error('Failed to load health data'), h);
        setHealth(h);

        // 2) Start job
        setStatus('Starting plan…');
        const sr = await fetch(`${API_BASE_URL}/api/start-plan-generation`, { method: 'POST', headers: { Accept: 'application/json' }});
        const s = await safeJson(sr);
        if (!sr.ok) throw enrich(new Error('Failed to start plan'), s);
        setJobId(s.jobId);
        setStatus('Generating…');
        pollUntilDone(s.jobId);
      } catch (e) {
        console.error(e);
        setError(toDisplay(e));
        setStatus('Failed');
      }
    })();
  }, []);

  function pollUntilDone(jid) {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const tick = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/plan-status/${jid}`, { headers: { Accept: 'application/json' }, signal: abortRef.current.signal });
        const body = await safeJson(r);
        if (!r.ok && r.status !== 202) throw enrich(new Error('Status check failed'), body);

        if (body.status === 'completed') {
          const p = body?.result?.plan ?? body?.result ?? null;
          setPlan(p);
          setStatus('Completed');
          return;
        }
        if (body.status === 'failed') throw enrich(new Error(body?.error?.message || 'Generation failed'), body?.error);
        setStatus(body.status === 'running' ? 'Generating…' : 'Queued…');
        pollTimerRef.current = setTimeout(tick, 2500);
      } catch (e) {
        console.error(e);
        setError(toDisplay(e));
        setStatus('Failed');
      }
    };
    tick();
  }

  const week = useMemo(() => normalizeWeek(plan), [plan]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-sky-600 p-2 rounded-lg"><Bike className="w-6 h-6 text-white" /></div>
            <div>
              <h1 className="text-2xl font-bold text-white">The Uphill Athlete AI Coach</h1>
              <p className="text-xs text-gray-400">API: <span className="font-mono">{API_BASE_URL}</span></p>
            </div>
          </div>
          <StatusPill status={status} />
        </header>

        {/* Health snapshot */}
        <Section title="Daily Snapshot" icon={<Heart className="w-5 h-5 text-emerald-400" />} defaultOpen={true}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Readiness" value={health?.readiness ?? '—'} sub={health?.__stub ? 'stub' : ''} icon={<Sparkles className="w-5 h-5 text-emerald-400" />} />
            <StatCard label="Sleep Score" value={health?.latestData?.sleepScore ?? '—'} sub="/100" icon={<BedDouble className="w-5 h-5 text-purple-400" />} />
            <StatCard label="HRV" value={health?.latestData?.hrv ?? '—'} icon={<Activity className="w-5 h-5 text-sky-400" />} />
            <StatCard label="Body Battery" value={health?.latestData?.bodyBattery ?? '—'} icon={<BatteryCharging className="w-5 h-5 text-lime-400" />} />
          </div>
        </Section>

        {/* Error block */}
        {error && (
          <div className="mt-4 p-4 rounded-xl border border-rose-700/50 bg-rose-900/20">
            <div className="flex items-center gap-2 text-rose-300 font-semibold mb-2">
              <XCircle className="w-5 h-5" /> Error
            </div>
            <pre className="text-xs whitespace-pre-wrap text-rose-200/90">{error.details || error.message}</pre>
          </div>
        )}

        {/* Plan */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Week grid */}
          <div className="lg:col-span-2 space-y-4">
            <Section title="This Week" icon={<Calendar className="w-5 h-5 text-sky-400" />} defaultOpen={true}>
              {!plan && <div className="flex items-center gap-3 text-gray-300"><Loader2 className="w-5 h-5 animate-spin text-sky-400" /> Building your plan…</div>}

              {week && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {week.map((d, i) => (
                    <div key={i} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 hover:border-sky-700/40 transition">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-sky-300 font-semibold">{d.key}</div>
                        {iconFor(d.type)}
                      </div>
                      <div className="text-white font-semibold">{d.title}</div>
                      {d.details && <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">{d.details}</p>}
                    </div>
                  ))}
                </div>
              )}

              {!week && plan && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                  <p className="text-sm text-gray-400 mb-2">AI free-form plan</p>
                  <pre className="whitespace-pre-wrap text-gray-100 text-sm">{typeof plan === 'string' ? plan : JSON.stringify(plan, null, 2)}</pre>
                </div>
              )}
            </Section>
          </div>

          {/* Right: Coach notes */}
          <div className="space-y-4">
            <Section title="Coach Notes" icon={<Brain className="w-5 h-5 text-amber-400" />} defaultOpen={true}>
              <ul className="list-disc list-inside text-sm text-gray-300 space-y-2">
                <li>Use Tuesday for intensity; anchor endurance on Sat/Sun.</li>
                <li>Mobility every day (10–15 min). Hit hips, T-spine, ankles.</li>
                <li>Fuel long rides: 60–90 g carbs/hr + electrolytes.</li>
                <li>Sleep 7.5–8.5h; keep RHR trend ≤ baseline +5 bpm.</li>
              </ul>
            </Section>

            <Section title="Today’s Focus" icon={<Timer className="w-5 h-5 text-lime-400" />} defaultOpen={true}>
              <div className="text-sm text-gray-300">
                <p>Follow the plan’s intent; err on the side of quality over volume. If readiness feels low, cap intensity and extend mobility.</p>
              </div>
            </Section>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-10 text-xs text-gray-500">
          <div>Job: <span className="font-mono">{jobId || '—'}</span></div>
        </footer>
      </div>
    </div>
  );
}

// -------- UI helpers --------
function StatusPill({ status }) {
  if (!status) return null;
  const lower = String(status).toLowerCase();
  let tone = 'info'; let Icon = Loader2; let label = status;
  if (lower.startsWith('gen') || lower.startsWith('queue') || lower === 'pending' || lower === 'running') {
    tone = 'info'; Icon = Loader2; label = status.replace('Generating…','Generating');
  } else if (lower.startsWith('comp')) {
    tone = 'good'; Icon = CheckCircle2; label = 'Completed';
  } else if (lower.startsWith('fail')) {
    tone = 'bad'; Icon = XCircle; label = 'Failed';
  }
  return <Pill tone={tone}><Icon className={`w-4 h-4 ${Icon===Loader2 ? 'animate-spin' : ''}`} /> <span className="font-medium">{label}</span></Pill>;
}

async function safeJson(res) {
  try { return await res.json(); }
  catch { return { status: res.status, text: await res.text().catch(()=>'') }; }
}
function enrich(err, details) { err.details = details; return err; }
function toDisplay(e) {
  return { message: e?.message || 'Unknown error', details: typeof e?.details === 'string' ? e.details : JSON.stringify(e?.details ?? {}, null, 2) };
}
