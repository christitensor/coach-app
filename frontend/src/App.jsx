import React, { useState, useEffect } from 'react';
import { Bike, Dumbbell, Snowflake, Mountain, Heart, Brain, ChevronUp, ChevronDown, Sparkles, Loader2 } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const ICONS = { 'Ride': <Bike className="w-5 h-5 text-sky-400" />, 'Gym': <Dumbbell className="w-5 h-5 text-amber-400" />, 'Recovery': <Heart className="w-5 h-5 text-emerald-400" />, 'Ski': <Snowflake className="w-5 h-5 text-cyan-400" />, 'Free Day': <Mountain className="w-5 h-5 text-lime-400" /> };

// --- Reusable Components ---
const AccordionSection = ({ title, children, icon, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border-b border-gray-700">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center py-3 text-left">
                <div className="flex items-center gap-3"><span className="text-sky-400">{icon}</span><h3 className="font-semibold text-white">{title}</h3></div>
                {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400"/> : <ChevronDown className="w-5 h-5 text-gray-400"/>}
            </button>
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-screen py-4" : "max-h-0"}`}>{children}</div>
        </div>
    );
};

const HealthVitals = ({ data, readiness }) => {
    if (!data || !readiness) return <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="bg-gray-800/70 p-4 rounded-lg animate-pulse h-28"/>)}</div>;
    const { sleep, hrv, resting_hr } = data;
    const hrvStatusColors = { BALANCED: "text-emerald-400 border-emerald-400", UNBALANCED: "text-amber-400 border-amber-400", LOW: "text-red-400 border-red-400" };
    const readinessColors = { High: "text-emerald-400 border-emerald-400", Moderate: "text-sky-400 border-sky-400", Low: "text-amber-400 border-amber-400" };

    const VitalCard = ({ icon, label, value, subValue, colorClass }) => (
        <div className={`bg-gray-800/70 p-4 rounded-lg border-l-4 ${colorClass}`}>
            <div className="flex justify-between items-center"><p className="text-sm font-semibold text-gray-300">{label}</p><span className={colorClass.split(" ")[0]}>{icon}</span></div>
            <div className="flex items-baseline gap-1 mt-2"><p className="text-3xl font-bold text-white">{value}</p>{subValue && <p className="text-sm text-gray-400">{subValue}</p>}</div>
        </div>
    );

    return (
        <div className="mb-8">
            <h2 className="text-xl font-bold mb-4 text-white">Daily Readiness</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <VitalCard icon={<Sparkles/>} label="Readiness Score" value={readiness.score} subValue={`/ 100 (${readiness.status})`} colorClass={readinessColors[readiness.status]} />
                <VitalCard icon={<Heart/>} label="Sleep Score" value={sleep.dailySleepDTO.sleepScores.overall.value} subValue="/ 100" colorClass="text-purple-400 border-purple-400" />
                <VitalCard icon={<Heart/>} label="HRV Status" value={hrv.hrvSummary.status} colorClass={hrvStatusColors[hrv.hrvSummary.status] || 'text-gray-400 border-gray-400'} />
                <VitalCard icon={<Heart/>} label="Resting HR" value={resting_hr?.allMetrics?.metricsMap?.WELLNESS_RESTING_HEART_RATE?.[0]?.value || 'N/A'} subValue="bpm" colorClass="text-red-400 border-red-400" />
            </div>
        </div>
    );
};

const DayCard = ({ day, data, isToday, onSelect, isSelected }) => (
    <button onClick={onSelect} className={`relative bg-gray-800 rounded-lg p-4 border-2 text-left transition-all duration-200 hover:border-sky-500 ${isSelected ? "border-sky-500" : "border-gray-700"} ${isToday ? "ring-2 ring-offset-2 ring-offset-gray-900 ring-sky-400" : ""}`}>
        <p className="font-bold text-white text-lg mb-2">{day}</p>
        <div className="flex items-center gap-2 mb-2">{ICONS[data.type] || <Dumbbell/>}<p className="text-sm text-gray-300 font-semibold">{data.title}</p></div>
        <p className="text-xs text-gray-400 line-clamp-2">{data.workout.name}</p>
    </button>
);

const DetailView = ({ dayData }) => (
    <div className="bg-gray-800 rounded-xl p-6 border-2 border-gray-700 sticky top-8">
        <h2 className="text-2xl font-bold text-white mb-4">{dayData.title}</h2>
        <AccordionSection title="Workout Details" icon={<Dumbbell/>} defaultOpen={true}>
            <p className="font-semibold text-lg text-white">{dayData.workout.name}</p>
            <p className="text-sm whitespace-pre-wrap text-gray-300 mt-2">{dayData.workout.description}</p>
        </AccordionSection>
        <AccordionSection title="Mobility Routine" icon={<Brain/>} defaultOpen={true}>
            <p className="font-semibold text-lg text-white">{dayData.mobility.name}</p>
            <p className="text-sm whitespace-pre-wrap text-gray-300 mt-2">{dayData.mobility.description}</p>
        </AccordionSection>
    </div>
);


export default function UphillCoachApp() {
    const [status, setStatus] = useState('Initializing Coach...');
    const [weeklyPlan, setWeeklyPlan] = useState(null);
    const [healthData, setHealthData] = useState(null);
    const [readiness, setReadiness] = useState(null);
    const [selectedDay, setSelectedDay] = useState(null);
    const dayOfWeek = new Date().toLocaleString('en-US', { weekday: 'long' });

    useEffect(() => {
        async function getDynamicPlan() {
            try {
                setStatus('Connecting to your health data...');
                const healthRes = await fetch(`${API_BASE_URL}/api/health-data`);
                if (!healthRes.ok) throw new Error('Could not fetch health data.');
                const { latestData, readiness } = await healthRes.json();
                setHealthData(latestData);
                setReadiness(readiness);

                setStatus('AI Coach is generating your adaptive plan...');
                const planRes = await fetch(`${API_BASE_URL}/api/generate-plan`);
                if (!planRes.ok) throw new Error('Could not generate training plan.');
                const { weeklyPlan } = await planRes.json();
                
                setWeeklyPlan(weeklyPlan);
                setSelectedDay(dayOfWeek);
                setStatus('');
            } catch (error) {
                console.error("Initialization Error:", error);
                setStatus(`Error: ${error.message}. Please check the backend and refresh.`);
            }
        }
        getDynamicPlan();
    }, [dayOfWeek]);

    if (status) {
        return (
            <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-4 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-sky-400" />
                <p className="mt-4 text-lg font-semibold">{status}</p>
                <p className="text-sm text-gray-400 max-w-sm mt-2">This may take a moment as the AI analyzes your latest data to build a perfectly tailored plan.</p>
            </div>
        );
    }

    return (
        <div className="bg-gray-900 text-gray-200 min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold text-white">Uphill Athlete AI Coach</h1>
                    <p className="text-gray-400">Your dynamic plan for {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.</p>
                </header>
                <HealthVitals data={healthData} readiness={readiness} />
                <main className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    <div className="lg:col-span-3">
                        <h2 className="text-xl font-bold mb-4 text-white">This Week's Plan</h2>
                        {weeklyPlan && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {Object.entries(weeklyPlan).map(([day, data]) => (
                                <DayCard key={day} day={day} data={data} isToday={day === dayOfWeek} isSelected={day === selectedDay} onSelect={() => setSelectedDay(day)} />
                            ))}
                        </div>}
                    </div>
                    <div className="lg:col-span-2">
                        {selectedDay && weeklyPlan && weeklyPlan[selectedDay] && <DetailView dayData={weeklyPlan[selectedDay]} />}
                    </div>
                </main>
            </div>
        </div>
    );
}


