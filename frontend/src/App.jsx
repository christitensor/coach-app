import React, { useState, useEffect } from 'react';
import { Bike, Dumbbell, Snowflake, Mountain, Heart, Brain, ChevronUp, ChevronDown, Sparkles, Loader2, Info } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Reusable components (AccordionSection, etc.) are assumed to be here and are unchanged.

export default function UphillCoachApp() {
    const [status, setStatus] = useState('Connecting to coach...');
    const [errorDetails, setErrorDetails] = useState('');
    const [weeklyPlan, setWeeklyPlan] = useState(null);
    const [healthData, setHealthData] = useState(null);
    const [readiness, setReadiness] = useState(null);
    const [selectedDay, setSelectedDay] = useState(null);
    const dayOfWeek = new Date().toLocaleString('en-US', { weekday: 'long' });

    useEffect(() => {
        async function initializeApp() {
            try {
                if (!API_BASE_URL) {
                    throw new Error("VITE_API_BASE_URL is not configured in Vercel.");
                }

                // Stage 1: Fetch health data
                setStatus('Fetching your latest health data...');
                const healthRes = await fetch(`${API_BASE_URL}/api/health-data`);
                if (!healthRes.ok) {
                    const err = await healthRes.json();
                    throw new Error(err.error || 'Could not fetch health data.');
                }
                const { latestData, readiness } = await healthRes.json();
                setHealthData(latestData);
                setReadiness(readiness);
                setSelectedDay(dayOfWeek);

                // Stage 2: Generate the AI plan
                setStatus('AI Coach is analyzing your data...');
                const planRes = await fetch(`${API_BASE_URL}/api/generate-plan`);
                if (!planRes.ok) {
                    const err = await planRes.json();
                    throw new Error(err.details || 'Could not generate training plan.');
                }
                const { weeklyPlan } = await planRes.json();
                setWeeklyPlan(weeklyPlan);
                
                setStatus(''); // Success!

            } catch (error) {
                console.error("Initialization Error:", error);
                setStatus(`Error: Load failed.`);
                setErrorDetails(error.message);
            }
        }
        
        initializeApp();
    }, [dayOfWeek]);

    // ... The rest of the component (loading screen, main display) is unchanged from the previous version ...
    if (status) {
        return (
             <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-4 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-sky-400" />
                <p className="mt-4 text-lg font-semibold">{status}</p>
                <p className="text-sm text-gray-400 mt-2">This may take a moment as the AI builds a perfectly tailored plan.</p>
                {errorDetails && (
                    <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg max-w-md">
                        <p className="font-semibold text-red-300">Technical Details:</p>
                        <p className="text-sm text-red-300/80 font-mono mt-2">{errorDetails}</p>
                    </div>
                )}
            </div>
        )
    }

    return (
       <div className="bg-gray-900 text-gray-200 min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            {/* Main App Display */}
       </div>
    );
}


