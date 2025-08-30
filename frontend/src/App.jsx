import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
// Other imports are unchanged

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function UphillCoachApp() {
    const [status, setStatus] = useState('Initializing...');
    const [errorDetails, setErrorDetails] = useState('');
    // ... other states are unchanged ...

    useEffect(() => {
        async function initializeApp() {
            try {
                if (!API_BASE_URL) {
                    throw new Error("CRITICAL: The VITE_API_BASE_URL environment variable is not set in Vercel. The app does not know how to contact the backend.");
                }

                setStatus('Fetching health data...');
                const healthRes = await fetch(`${API_BASE_URL}/api/health-data`);
                if (!healthRes.ok) {
                    const err = await healthRes.json();
                    throw new Error(err.error || 'Failed to fetch health data.');
                }
                const { latestData, readiness } = await healthRes.json();
                setHealthData(latestData);
                setReadiness(readiness);

                setStatus('AI Coach is generating your plan...');
                const planRes = await fetch(`${API_BASE_URL}/api/generate-plan`);
                if (!planRes.ok) {
                    const err = await planRes.json();
                    // This is the key part: we grab the detailed error from the backend
                    throw new Error(err.details || err.error || 'The backend failed to generate a plan.');
                }
                const { weeklyPlan } = await planRes.json();
                setWeeklyPlan(weeklyPlan);
                
                setStatus(''); // Success!

            } catch (error) {
                console.error("DIAGNOSTIC_ERROR:", error);
                setStatus(`Error: The app failed to load.`);
                setErrorDetails(error.message);
            }
        }
        
        initializeApp();
    }, []); // Removed dayOfWeek dependency to prevent re-renders

    // The Loading/Error screen is now the most important diagnostic tool
    if (status) {
        return (
            <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-4 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-sky-400 mb-4" />
                <p className="text-lg font-semibold">{status}</p>
                <p className="text-sm text-gray-400 mt-2 max-w-md">If the app is stuck, this is usually due to a backend error. The detailed message below is the key to solving it.</p>
                
                {errorDetails && (
                    <div className="mt-6 p-4 bg-red-900/50 border border-red-700 rounded-lg max-w-lg text-left">
                        <p className="font-semibold text-red-300">DIAGNOSTIC MESSAGE FROM BACKEND:</p>
                        <pre className="text-sm text-red-300/90 font-mono mt-2 whitespace-pre-wrap break-words">{errorDetails}</pre>
                    </div>
                )}
            </div>
        );
    }

    // ... The rest of your app's JSX is unchanged ...
    return ( <div> {/* Main App */} </div> );
}


