import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
// Other imports are unchanged

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function UphillCoachApp() {
    const [status, setStatus] = useState('Initializing...');
    const [errorObject, setErrorObject] = useState(null); // Will hold the rich error object
    // ... other states are unchanged ...

    useEffect(() => {
        async function initializeApp() {
            try {
                if (!API_BASE_URL) {
                    throw { name: "Config Error", message: "VITE_API_BASE_URL is not set in Vercel." };
                }

                // Stage 1: Health Data (unchanged)
                setStatus('Fetching health data...');
                const healthRes = await fetch(`${API_BASE_URL}/api/health-data`);
                if (!healthRes.ok) { throw await healthRes.json(); }
                const { latestData, readiness } = await healthRes.json();
                // ... set states ...

                // Stage 2: Generate Plan
                setStatus('AI Coach is generating your plan...');
                const planRes = await fetch(`${API_BASE_URL}/api/generate-plan`);
                if (!planRes.ok) {
                    // **NEW: Expect a detailed error object**
                    throw await planRes.json();
                }
                const { weeklyPlan } = await planRes.json();
                setWeeklyPlan(weeklyPlan);
                
                setStatus(''); // Success!

            } catch (error) {
                console.error("DIAGNOSTIC_ERROR_OBJECT:", error);
                setStatus(`Error: The application failed to load.`);
                setErrorObject(error); // Store the entire error object
            }
        }
        
        initializeApp();
    }, []);

    // **NEW: The definitive diagnostic screen**
    if (status) {
        return (
            <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-4 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-sky-400 mb-4" />
                <p className="text-lg font-semibold">{status}</p>
                
                {errorObject && (
                    <div className="mt-6 p-4 bg-red-900/50 border border-red-700 rounded-lg max-w-2xl text-left">
                        <p className="font-bold text-lg text-red-300">DIAGNOSTIC REPORT</p>
                        <div className="mt-3">
                            <p className="font-semibold text-red-400">Error Message:</p>
                            <pre className="text-sm text-red-300/90 font-mono mt-1 p-2 bg-black/20 rounded whitespace-pre-wrap break-words">
                                {errorObject.details ? errorObject.details.message : (errorObject.error || "No specific message.")}
                            </pre>
                        </div>
                        <div className="mt-3">
                            <p className="font-semibold text-red-400">Stack Trace (Location of Error):</p>
                            <pre className="text-xs text-red-300/70 font-mono mt-1 p-2 bg-black/20 rounded whitespace-pre-wrap break-words">
                                {errorObject.details ? errorObject.details.stack : "No stack trace available."}
                            </pre>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ... The rest of your app's JSX is unchanged ...
    return ( <div> {/* Main App */} </div> );
}


