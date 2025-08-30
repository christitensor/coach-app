import React, { useState, useEffect } from 'react';
import { Bike, Dumbbell, Snowflake, Mountain, Heart, Brain, ChevronUp, ChevronDown, Sparkles, Loader2 } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
// ... Other components (ICONS, AccordionSection, etc.) are unchanged ...

export default function UphillCoachApp() {
    const [status, setStatus] = useState('Initializing Coach...');
    const [errorDetails, setErrorDetails] = useState(''); // New state for detailed errors
    const [weeklyPlan, setWeeklyPlan] = useState(null);
    const [healthData, setHealthData] = useState(null);
    const [readiness, setReadiness] = useState(null);
    const [selectedDay, setSelectedDay] = useState(null);
    const dayOfWeek = new Date().toLocaleString('en-US', { weekday: 'long' });

    useEffect(() => {
        async function getDynamicPlan() {
            try {
                // ... health data fetch is the same ...
                setStatus('Connecting to your health data...');
                const healthRes = await fetch(`${API_BASE_URL}/api/health-data`);
                if (!healthRes.ok) throw new Error('Could not fetch health data.');
                const { latestData, readiness } = await healthRes.json();
                setHealthData(latestData);
                setReadiness(readiness);

                setStatus('AI Coach is generating your adaptive plan...');
                const planRes = await fetch(`${API_BASE_URL}/api/generate-plan`);
                
                // **NEW: Check for error and get detailed message**
                if (!planRes.ok) {
                    const errorJson = await planRes.json();
                    throw new Error(errorJson.details || 'Could not generate training plan.');
                }

                const { weeklyPlan } = await planRes.json();
                setWeeklyPlan(weeklyPlan);
                setSelectedDay(dayOfWeek);
                setStatus('');
            } catch (error) {
                console.error("Initialization Error:", error);
                setStatus(`Error: Plan Generation Failed.`);
                setErrorDetails(error.message); // Set the detailed error message
            }
        }
        getDynamicPlan();
    }, [dayOfWeek]);

    if (status) {
        return (
            <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-4 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-sky-400" />
                <p className="mt-4 text-lg font-semibold">{status}</p>
                {/* Display the detailed error if it exists */}
                {errorDetails && (
                    <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg max-w-md">
                        <p className="font-semibold text-red-300">Backend Error Details:</p>
                        <p className="text-sm text-red-300/80 font-mono mt-2">{errorDetails}</p>
                    </div>
                )}
            </div>
        );
    }
    
    // ... rest of the component is unchanged ...
    return (
        // ...
    );
}


