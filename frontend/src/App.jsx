import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, BatteryCharging, BedDouble, Bike, Brain, CheckCircle2,
  ChevronDown, ChevronUp, Dumbbell, Flame, Heart, Loader2, LogOut,
  MapPin, Mountain, Navigation, RefreshCw, Route, Sparkles,
  Timer, TrendingUp, User, XCircle, Zap, PersonStanding, Waves
} from 'lucide-react';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

// ─── tiny helpers ────────────────────────────────────────────────────────────

const cn = (...cls) => cls.filter(Boolean).join(' ');

const fmt = (v, fallback = '—') => (v == null ? fallback : v);

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

// ─── shared UI ───────────────────────────────────────────────────────────────

function Card({ children, className }) {
  return (
    <div className={cn('bg-gray-900/60 border border-gray-800 rounded-xl p-4', className)}>
      {children}
    </div>
  );
}

function StatCard({ icon, label, value, unit, tone = 'default' }) {
  const tones = {
    default: 'text-white',
    good: 'text-emerald-400',
    warn: 'text-amber-400',
    bad: 'text-rose-400',
  };
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className={cn('text-2xl font-bold', tones[tone])}>{fmt(value)}</div>
      {unit && <div className="text-xs text-gray-500 mt-0.5">{unit}</div>}
    </Card>
  );
}

function Spinner({ size = 5 }) {
  return <Loader2 className={cn(`w-${size} h-${size}`, 'animate-spin text-sky-400')} />;
}

function ErrorBox({ message }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-rose-700/50 bg-rose-900/20 text-rose-300">
      <XCircle className="w-5 h-5 mt-0.5 shrink-0" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {icon}
      <h2 className="text-lg font-semibold text-white">{title}</h2>
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 bg-gray-900/70 border border-gray-800 rounded-xl p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            active === t.id
              ? 'bg-sky-600 text-white shadow'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function Input({ label, type = 'text', value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sky-500"
      />
    </div>
  );
}

function PrimaryButton({ onClick, loading, disabled, children, className }) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={cn(
        'flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all',
        loading || disabled
          ? 'bg-sky-800/50 text-sky-400 cursor-not-allowed'
          : 'bg-sky-600 hover:bg-sky-500 text-white',
        className
      )}
    >
      {loading ? <Spinner size={4} /> : null}
      {children}
    </button>
  );
}

// ─── page components (forward-declared, defined below) ───────────────────────

// LoginScreen, DashboardTab, WorkoutTab, RoutesTab — defined in parts 2 & 3

// ─── root App ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard', label: 'Dashboard',        icon: <Activity className="w-4 h-4" /> },
  { id: 'workout',   label: 'Generate Workout',  icon: <Zap className="w-4 h-4" /> },
  { id: 'routes',    label: 'Route Suggestions', icon: <Route className="w-4 h-4" /> },
];

export default function App() {
  const [connected, setConnected]   = useState(false);
  const [userName, setUserName]     = useState('');
  const [activeTab, setActiveTab]   = useState('dashboard');

  function handleLogin(name) {
    setUserName(name);
    setConnected(true);
  }

  function handleLogout() {
    apiFetch('/api/garmin/disconnect', { method: 'POST' }).catch(() => {});
    setConnected(false);
    setUserName('');
    setActiveTab('dashboard');
  }

  if (!connected) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-sky-600 p-2 rounded-xl">
              <Mountain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Garmin Training Coach</h1>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <User className="w-3 h-3" /> {userName}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition"
          >
            <LogOut className="w-4 h-4" /> Disconnect
          </button>
        </header>

        {/* Tabs */}
        <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {/* Content */}
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'workout'   && <WorkoutTab />}
        {activeTab === 'routes'    && <RoutesTab />}
      </div>
    </div>
  );
}

// ─── LoginScreen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode]   = useState('');
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/garmin/connect', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (data.mfa_required) { setMfaNeeded(true); return; }
      if (data.success) onLogin(data.name || email.split('@')[0]);
      else setError(data.message || 'Login failed');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/garmin/mfa', {
        method: 'POST',
        body: JSON.stringify({ code: mfaCode }),
      });
      if (data.success) onLogin(data.name || email.split('@')[0]);
      else setError(data.message || 'MFA failed');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center bg-sky-600 p-3 rounded-2xl mb-4">
            <Mountain className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Garmin Training Coach</h1>
          <p className="text-sm text-gray-400 mt-1">Connect your Garmin account to get started</p>
        </div>

        <Card>
          {!mfaNeeded ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Garmin Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
              <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
              {error && <ErrorBox message={error} />}
              <PrimaryButton loading={loading} className="w-full">
                Connect to Garmin
              </PrimaryButton>
            </form>
          ) : (
            <form onSubmit={handleMfa} className="space-y-4">
              <p className="text-sm text-sky-300">Two-factor authentication required.</p>
              <Input label="MFA Code" value={mfaCode} onChange={setMfaCode} placeholder="123456" />
              {error && <ErrorBox message={error} />}
              <PrimaryButton loading={loading} className="w-full">
                Verify
              </PrimaryButton>
            </form>
          )}
        </Card>

        <p className="text-xs text-gray-500 text-center">
          Credentials are sent directly to Garmin and never stored.
        </p>
      </div>
    </div>
  );
}

// ─── DashboardTab ─────────────────────────────────────────────────────────────

function activityIcon(type) {
  if (!type) return <Dumbbell className="w-4 h-4 text-gray-400" />;
  const t = type.toLowerCase();
  if (t.includes('run'))   return <PersonStanding className="w-4 h-4 text-amber-400" />;
  if (t.includes('cycl') || t.includes('bike') || t.includes('ride'))
                           return <Bike className="w-4 h-4 text-sky-400" />;
  if (t.includes('swim'))  return <Waves className="w-4 h-4 text-blue-400" />;
  if (t.includes('hike') || t.includes('walk'))
                           return <Mountain className="w-4 h-4 text-emerald-400" />;
  return <Dumbbell className="w-4 h-4 text-gray-400" />;
}

function secToHMS(s) {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function readinessTone(score) {
  if (score == null) return 'default';
  if (score >= 70) return 'good';
  if (score >= 40) return 'warn';
  return 'bad';
}

function DashboardTab() {
  const [fitness, setFitness]         = useState(null);
  const [activities, setActivities]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [showAllActs, setShowAllActs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [fit, acts] = await Promise.all([
        apiFetch('/api/garmin/fitness'),
        apiFetch('/api/garmin/activities?limit=10'),
      ]);
      setFitness(fit);
      setActivities(acts.activities || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={8} /></div>;
  if (error)   return <ErrorBox message={error} />;
  if (!fitness) return null;

  // ── extract values ──
  const stats       = fitness.stats        || {};
  const hrv         = fitness.hrv          || {};
  const sleep       = fitness.sleep        || {};
  const readiness   = fitness.training_readiness || {};
  const trainStatus = fitness.training_status    || {};
  const maxM        = fitness.max_metrics  || {};
  const body        = fitness.body_composition   || {};
  const stress      = fitness.stress       || {};

  const sleepScore = sleep?.dailySleepDTO?.sleepScores?.overall?.value;
  const hrvVal     = hrv?.hrvSummary?.lastNight;
  const rdScore    = readiness?.score ?? readiness?.trainingReadinessScore;
  const battery    = stats?.bodyBatteryChargeAmount ?? stats?.bodyBattery;
  const vo2        = maxM?.vo2MaxPreciseValue ?? maxM?.generic?.vo2MaxPreciseValue;
  const weight     = body?.weight ? `${(body.weight / 1000).toFixed(1)} kg` : null;
  const stressAvg  = stress?.avgStressLevel;

  const tsLabel    = trainStatus?.trainingStatusFeedback?.trainingStatusFeedbackPhrase
                  ?? trainStatus?.trainingStatus ?? null;

  const visibleActs = showAllActs ? activities : activities.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* refresh */}
      <div className="flex justify-end">
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Key metrics */}
      <section>
        <SectionHeader icon={<Heart className="w-5 h-5 text-rose-400" />} title="Today's Health" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Training Readiness" value={rdScore} unit="/100"
            icon={<Sparkles className="w-4 h-4 text-emerald-400" />}
            tone={readinessTone(rdScore)} />
          <StatCard label="Sleep Score" value={sleepScore} unit="/100"
            icon={<BedDouble className="w-4 h-4 text-purple-400" />} />
          <StatCard label="HRV Last Night" value={hrvVal} unit="ms"
            icon={<Activity className="w-4 h-4 text-sky-400" />} />
          <StatCard label="Body Battery" value={battery}
            icon={<BatteryCharging className="w-4 h-4 text-lime-400" />} />
          <StatCard label="Steps" value={stats.totalSteps?.toLocaleString()}
            icon={<TrendingUp className="w-4 h-4 text-amber-400" />} />
          <StatCard label="Active Calories" value={stats.activeKilocalories} unit="kcal"
            icon={<Flame className="w-4 h-4 text-orange-400" />} />
          <StatCard label="Resting HR" value={stats.restingHeartRate} unit="bpm"
            icon={<Heart className="w-4 h-4 text-rose-400" />} />
          {vo2 && <StatCard label="VO₂ Max" value={Number(vo2).toFixed(1)} unit="ml/kg/min"
            icon={<Zap className="w-4 h-4 text-yellow-400" />} />}
          {weight && <StatCard label="Weight" value={weight}
            icon={<User className="w-4 h-4 text-gray-400" />} />}
          {stressAvg != null && <StatCard label="Avg Stress" value={stressAvg} unit="/100"
            icon={<Brain className="w-4 h-4 text-pink-400" />} />}
        </div>
      </section>

      {/* Training status */}
      {tsLabel && (
        <Card className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Training Status</p>
            <p className="text-sm text-white font-medium capitalize">{tsLabel.replace(/_/g, ' ').toLowerCase()}</p>
          </div>
        </Card>
      )}

      {/* Recent activities */}
      <section>
        <SectionHeader icon={<Timer className="w-5 h-5 text-sky-400" />} title="Recent Activities" />
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500">No activities found.</p>
        ) : (
          <div className="space-y-2">
            {visibleActs.map((a, i) => (
              <Card key={a.activityId || i} className="flex items-center gap-3">
                <div className="shrink-0">{activityIcon(a.activityType?.typeKey)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{a.activityName || 'Activity'}</p>
                  <p className="text-xs text-gray-400">{a.startTimeLocal?.slice(0, 10) || '—'}</p>
                </div>
                <div className="text-right text-xs text-gray-300 shrink-0 space-y-0.5">
                  <div>{a.distance ? `${(a.distance / 1000).toFixed(2)} km` : ''}</div>
                  <div>{secToHMS(a.duration)}</div>
                  {a.averageHR && <div>{a.averageHR} bpm</div>}
                </div>
              </Card>
            ))}
            {activities.length > 5 && (
              <button
                onClick={() => setShowAllActs(!showAllActs)}
                className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition"
              >
                {showAllActs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showAllActs ? 'Show less' : `Show all ${activities.length}`}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Weekly Schedule ─────────────────────────────────────────────────────────

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DAY_TYPES = {
  crossfit: { label: 'CrossFit', color: 'bg-rose-600 text-white border-rose-500', dot: '🏋️' },
  ride:     { label: 'Ride',     color: 'bg-sky-600 text-white border-sky-500',   dot: '🚴' },
  rest:     { label: 'Rest',     color: 'bg-gray-700 text-gray-300 border-gray-600', dot: '😴' },
};
const DEFAULT_SCHEDULE = {
  Monday: 'crossfit', Tuesday: 'ride', Wednesday: 'crossfit',
  Thursday: 'crossfit', Friday: 'ride', Saturday: 'crossfit', Sunday: 'rest',
};

function loadSchedule() {
  try { return JSON.parse(localStorage.getItem('weekSchedule')) || DEFAULT_SCHEDULE; }
  catch { return DEFAULT_SCHEDULE; }
}
function saveSchedule(s) {
  try { localStorage.setItem('weekSchedule', JSON.stringify(s)); } catch {}
}

function todayDayName() {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
}

function WeekSchedule({ schedule, onChange }) {
  const today = todayDayName();
  function cycle(day) {
    const types = ['crossfit', 'ride', 'rest'];
    const next = types[(types.indexOf(schedule[day]) + 1) % types.length];
    const updated = { ...schedule, [day]: next };
    onChange(updated);
    saveSchedule(updated);
  }
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Weekly Schedule <span className="normal-case text-gray-500">(tap to cycle)</span></p>
      <div className="grid grid-cols-7 gap-1">
        {DAYS.map((day) => {
          const type = schedule[day] || 'rest';
          const cfg = DAY_TYPES[type];
          const isToday = day === today;
          return (
            <button
              key={day}
              onClick={() => cycle(day)}
              className={cn(
                'flex flex-col items-center py-2 px-1 rounded-lg border text-xs font-medium transition-all',
                cfg.color,
                isToday && 'ring-2 ring-white/40'
              )}
            >
              <span className="text-base">{cfg.dot}</span>
              <span className="mt-1 truncate w-full text-center" style={{fontSize:'0.65rem'}}>{day.slice(0,3)}</span>
              {isToday && <span className="text-[0.55rem] opacity-70">today</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── WorkoutTab ───────────────────────────────────────────────────────────────

const INTENSITIES = [
  { value: 'easy',      label: 'Easy' },
  { value: 'moderate',  label: 'Moderate' },
  { value: 'hard',      label: 'Hard' },
];

function HRZoneBadge({ zone }) {
  if (!zone) return null;
  const z = String(zone).toLowerCase();
  const color = z.includes('1') ? 'text-blue-300 bg-blue-900/30 border-blue-700/40'
    : z.includes('2') ? 'text-emerald-300 bg-emerald-900/30 border-emerald-700/40'
    : z.includes('3') ? 'text-yellow-300 bg-yellow-900/30 border-yellow-700/40'
    : z.includes('4') ? 'text-orange-300 bg-orange-900/30 border-orange-700/40'
    : 'text-rose-300 bg-rose-900/30 border-rose-700/40';
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full border', color)}>{zone}</span>
  );
}

function WorkoutBlock({ block, index }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <div className="border border-gray-700/60 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/50 hover:bg-gray-800 transition text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 font-mono w-5">{index + 1}.</span>
          <span className="text-sm font-medium text-white">{block.name}</span>
          {block.target_hr_zone && <HRZoneBadge zone={block.target_hr_zone} />}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {block.duration_min && (
            <span className="text-xs text-gray-400">{block.duration_min} min</span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="px-4 py-3 bg-gray-900/40 text-sm text-gray-300 space-y-1">
          <p>{block.instructions}</p>
          {block.reps && <p className="text-xs text-gray-400">Reps: {block.reps}</p>}
          {block.rest_min && <p className="text-xs text-gray-400">Rest: {block.rest_min} min</p>}
        </div>
      )}
    </div>
  );
}

// ─── WOD Display ─────────────────────────────────────────────────────────────

function ScalingTier({ label, color, data }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div className="border border-gray-700/60 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-800/50 hover:bg-gray-800 transition text-left">
        <span className={cn('text-xs font-bold uppercase tracking-wide', color)}>{label}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 py-3 space-y-1.5 bg-gray-900/40">
          {data.description && <p className="text-sm text-gray-200">{data.description}</p>}
          {data.weights && <p className="text-xs text-gray-400">Weights: {data.weights}</p>}
          {data.modifications?.map((m, i) => (
            <p key={i} className="text-xs text-gray-300 flex gap-2"><span className="text-amber-400">→</span>{m}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function WodDisplay({ workout }) {
  if (!workout) return null;
  if (workout.raw) return <Card><pre className="text-sm text-gray-200 whitespace-pre-wrap">{workout.raw}</pre></Card>;

  const isCrossfit = !!(workout.workout || workout.rx || workout.scaled);
  const metrics = workout.target_metrics || {};

  if (isCrossfit) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="text-lg font-bold text-white">{workout.title}</h3>
            {workout.format && <span className="text-xs px-2 py-0.5 rounded-full bg-rose-900/40 border border-rose-700/40 text-rose-300">{workout.format}</span>}
            {workout.source === 'notion' && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/40 border border-purple-700/40 text-purple-300">From Notion</span>}
            {workout.time_cap_min && <span className="text-xs text-gray-400">{workout.time_cap_min} min cap</span>}
          </div>
          <pre className="text-sm text-gray-100 whitespace-pre-wrap font-sans leading-relaxed bg-gray-800/50 rounded-lg p-3">{workout.workout}</pre>
          {workout.estimated_time && <p className="text-xs text-gray-400 mt-2">Est. time: {workout.estimated_time}</p>}
        </Card>

        {workout.warmup && (
          <Card>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Warm-up</p>
            <p className="text-sm text-gray-200">{workout.warmup}</p>
          </Card>
        )}

        <div className="space-y-1.5">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Scaling</p>
          <ScalingTier label="RX" color="text-rose-400" data={workout.rx} />
          <ScalingTier label="Scaled" color="text-amber-400" data={workout.scaled} />
          <ScalingTier label="Beginner" color="text-emerald-400" data={workout.beginner} />
        </div>

        {(workout.strategy || workout.readiness_note) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {workout.strategy && (
              <Card>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Strategy</p>
                <p className="text-sm text-gray-200">{workout.strategy}</p>
              </Card>
            )}
            {workout.readiness_note && (
              <Card>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Today's Readiness</p>
                <p className="text-sm text-gray-200">{workout.readiness_note}</p>
              </Card>
            )}
          </div>
        )}
      </div>
    );
  }

  // Ride / structured workout
  return (
    <div className="space-y-4">
      <Card className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-white">{workout.title}</h3>
          <div className="flex flex-wrap gap-2 mt-1">
            {workout.total_duration_min && <span className="text-xs text-gray-400">{workout.total_duration_min} min</span>}
            {metrics.rpe && <span className="text-xs text-gray-400">RPE {metrics.rpe}</span>}
          </div>
        </div>
        <div className="text-right text-xs space-y-1">
          {metrics.hr_zone && <HRZoneBadge zone={metrics.hr_zone} />}
          {metrics.cadence_rpm && <div className="text-gray-400">{metrics.cadence_rpm} rpm</div>}
          {metrics.power_watts && <div className="text-gray-400">{metrics.power_watts} W</div>}
        </div>
      </Card>

      {workout.warmup?.description && (
        <Card>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Warm-up · {workout.warmup.duration_min} min</p>
          <p className="text-sm text-gray-200">{workout.warmup.description}</p>
        </Card>
      )}

      {workout.main_set?.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Main Set</p>
          <div className="space-y-1.5">
            {workout.main_set.map((b, i) => <WorkoutBlock key={i} block={b} index={i} />)}
          </div>
        </div>
      )}

      {workout.cooldown?.description && (
        <Card>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Cool-down · {workout.cooldown.duration_min} min</p>
          <p className="text-sm text-gray-200">{workout.cooldown.description}</p>
        </Card>
      )}

      {(workout.strategy || workout.readiness_note) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {workout.strategy && <Card><p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Strategy</p><p className="text-sm text-gray-200">{workout.strategy}</p></Card>}
          {workout.readiness_note && <Card><p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Readiness Note</p><p className="text-sm text-gray-200">{workout.readiness_note}</p></Card>}
        </div>
      )}
    </div>
  );
}

function WorkoutBlock({ block, index }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <div className="border border-gray-700/60 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/50 hover:bg-gray-800 transition text-left">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 font-mono w-5">{index + 1}.</span>
          <span className="text-sm font-medium text-white">{block.name}</span>
          {block.target_hr_zone && <HRZoneBadge zone={block.target_hr_zone} />}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {block.duration_min && <span className="text-xs text-gray-400">{block.duration_min} min</span>}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="px-4 py-3 bg-gray-900/40 text-sm text-gray-300 space-y-1">
          <p>{block.instructions}</p>
          {block.target_watts && <p className="text-xs text-gray-400">Target: {block.target_watts} W</p>}
        </div>
      )}
    </div>
  );
}

function WorkoutTab() {
  const [schedule, setSchedule] = useState(loadSchedule);
  const today = todayDayName();
  const todayType = schedule[today] || 'crossfit';

  const [intensity, setIntensity]   = useState('moderate');
  const [duration, setDuration]     = useState(todayType === 'ride' ? 60 : 60);
  const [workout, setWorkout]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const typeConfig = DAY_TYPES[todayType];

  async function generate() {
    setLoading(true); setError(''); setWorkout(null);
    try {
      const data = await apiFetch('/api/workout/generate-smart', {
        method: 'POST',
        body: JSON.stringify({
          day_type: todayType,
          duration_minutes: Number(duration),
          intensity,
          use_notion_wod: true,
        }),
      });
      setWorkout(data.workout);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const dayLabel = todayType === 'crossfit' ? 'CrossFit WOD' : todayType === 'ride' ? 'Ride Workout' : 'Rest Day';

  return (
    <div className="space-y-6">
      <SectionHeader icon={<Zap className="w-5 h-5 text-yellow-400" />} title="Today's Workout" />

      {/* Schedule picker */}
      <Card>
        <WeekSchedule schedule={schedule} onChange={setSchedule} />
      </Card>

      {/* Today's context */}
      <Card className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{typeConfig.dot}</span>
          <div>
            <p className="text-white font-semibold">{today} — {dayLabel}</p>
            <p className="text-xs text-gray-400">
              {todayType === 'crossfit' && 'Will pull today\'s WOD from your Notion table and scale to your Garmin readiness'}
              {todayType === 'ride'     && 'Garmin fitness data will shape today\'s cycling session'}
              {todayType === 'rest'     && 'Recovery notes and mobility suggestions'}
            </p>
          </div>
        </div>
      </Card>

      {/* Options */}
      {todayType !== 'rest' && (
        <Card>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Select label="Intensity" value={intensity} onChange={setIntensity} options={INTENSITIES} />
            <div>
              <label className="block text-xs text-gray-400 mb-1">Duration (min)</label>
              <input type="number" min={10} max={180} step={5} value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500" />
            </div>
          </div>
          <PrimaryButton onClick={generate} loading={loading}>
            <Sparkles className="w-4 h-4" />
            {todayType === 'crossfit' ? 'Get Today\'s WOD' : 'Generate Ride'}
          </PrimaryButton>
        </Card>
      )}

      {todayType === 'rest' && (
        <PrimaryButton onClick={generate} loading={loading} className="w-full">
          <Sparkles className="w-4 h-4" /> Get Recovery Suggestions
        </PrimaryButton>
      )}

      {error && <ErrorBox message={error} />}
      {loading && (
        <div className="flex items-center gap-3 text-gray-300 py-6">
          <Spinner />
          {todayType === 'crossfit' ? 'Pulling WOD from Notion + scaling to your readiness…' : 'Generating your ride…'}
        </div>
      )}
      {workout && !loading && <WodDisplay workout={workout} />}
    </div>
  );
}

// ─── RoutesTab ────────────────────────────────────────────────────────────────

const TERRAINS = [
  { value: 'any',   label: 'Any' },
  { value: 'road',  label: 'Road' },
  { value: 'trail', label: 'Trail' },
  { value: 'mixed', label: 'Mixed' },
];

const DIFFICULTY_COLOR = {
  easy:     'text-emerald-300 border-emerald-700/50 bg-emerald-900/20',
  moderate: 'text-yellow-300  border-yellow-700/50  bg-yellow-900/20',
  hard:     'text-rose-300    border-rose-700/50    bg-rose-900/20',
};

function RouteCard({ route }) {
  const [open, setOpen] = useState(false);
  const diffColor = DIFFICULTY_COLOR[route.difficulty?.toLowerCase()] || DIFFICULTY_COLOR.moderate;
  const mapsUrl = route.google_maps_search
    ? `https://www.google.com/maps/search/${encodeURIComponent(route.google_maps_search)}`
    : null;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-base font-bold text-white">{route.name}</h3>
            <span className={cn('text-xs px-2 py-0.5 rounded-full border capitalize', diffColor)}>
              {route.difficulty}
            </span>
          </div>
          <p className="text-sm text-gray-300">{route.description}</p>
        </div>
        <Navigation className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-400 mb-3">
        <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{route.distance_km} km</span>
        <span className="flex items-center gap-1"><Mountain className="w-3.5 h-3.5" />+{route.elevation_gain_m}m</span>
        <span className="flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{route.estimated_duration_min} min</span>
        {route.surface && <span className="capitalize">{route.surface}</span>}
      </div>

      <p className="text-xs text-emerald-300 mb-3">{route.why_good}</p>

      {/* Start point */}
      <p className="text-xs text-gray-400 mb-3">
        <span className="text-gray-500">Start:</span> {route.start_point}
      </p>

      {/* Expandable details */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition mb-2"
      >
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {open ? 'Less detail' : 'More detail'}
      </button>

      {open && (
        <div className="space-y-3 pt-1 border-t border-gray-800">
          {route.navigation_summary?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Navigation</p>
              <ol className="space-y-0.5">
                {route.navigation_summary.map((step, i) => (
                  <li key={i} className="text-xs text-gray-200 flex gap-2">
                    <span className="text-sky-500 font-mono shrink-0">{i + 1}.</span>{step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {route.landmarks?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Landmarks</p>
              <div className="flex flex-wrap gap-1.5">
                {route.landmarks.map((l, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300">{l}</span>
                ))}
              </div>
            </div>
          )}

          {(route.pros?.length > 0 || route.cons?.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {route.pros?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Pros</p>
                  {route.pros.map((p, i) => <p key={i} className="text-xs text-emerald-300">+ {p}</p>)}
                </div>
              )}
              {route.cons?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Cons</p>
                  {route.cons.map((c, i) => <p key={i} className="text-xs text-rose-300">- {c}</p>)}
                </div>
              )}
            </div>
          )}

          {route.parking && (
            <p className="text-xs text-gray-400"><span className="text-gray-500">Parking:</span> {route.parking}</p>
          )}
          {route.best_time && (
            <p className="text-xs text-gray-400"><span className="text-gray-500">Best time:</span> {route.best_time}</p>
          )}
          {route.surface_breakdown && (
            <p className="text-xs text-gray-400"><span className="text-gray-500">Surface:</span> {route.surface_breakdown}</p>
          )}
          {route.strava_segment && (
            <p className="text-xs text-gray-400"><span className="text-gray-500">Strava segment:</span> {route.strava_segment}</p>
          )}
        </div>
      )}

      {/* Actions */}
      {mapsUrl && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition"
          >
            <MapPin className="w-3.5 h-3.5" /> Open in Google Maps
          </a>
        </div>
      )}
    </Card>
  );
}

function RoutesTab() {
  const [form, setForm] = useState({
    location: '', workout_type: 'run',
    duration_minutes: 45, terrain_preference: 'any',
  });
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function findRoutes() {
    if (!form.location.trim()) { setError('Please enter a location.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const data = await apiFetch('/api/garmin/suggest-route', {
        method: 'POST',
        body: JSON.stringify({ ...form, duration_minutes: Number(form.duration_minutes) }),
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader icon={<Route className="w-5 h-5 text-emerald-400" />} title="Route Suggestions" />

      <Card>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="col-span-2">
            <Input label="Location" value={form.location} onChange={set('location')}
              placeholder="e.g. Central Park, New York" />
          </div>
          <Select label="Activity"  value={form.workout_type}       onChange={set('workout_type')}       options={WORKOUT_TYPES} />
          <Select label="Terrain"   value={form.terrain_preference} onChange={set('terrain_preference')} options={TERRAINS} />
          <div>
            <label className="block text-xs text-gray-400 mb-1">Duration (min)</label>
            <input
              type="number" min={10} max={300} step={5}
              value={form.duration_minutes}
              onChange={(e) => set('duration_minutes')(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>
        <PrimaryButton onClick={findRoutes} loading={loading}>
          <Navigation className="w-4 h-4" /> Find Routes
        </PrimaryButton>
      </Card>

      {error && <ErrorBox message={error} />}
      {loading && (
        <div className="flex items-center gap-3 text-gray-300 py-6">
          <Spinner /> Finding routes near {form.location}…
        </div>
      )}

      {result && !loading && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Routes near <span className="text-white font-medium">{result.location}</span>
          </p>

          {result.routes?.map((r, i) => <RouteCard key={i} route={r} />)}

          {result.local_tips?.length > 0 && (
            <Card>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Local Tips</p>
              <ul className="space-y-1">
                {result.local_tips.map((t, i) => (
                  <li key={i} className="text-sm text-gray-200 flex gap-2">
                    <span className="text-emerald-400">•</span>{t}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
