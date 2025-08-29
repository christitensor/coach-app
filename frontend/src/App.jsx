    import React, { useState, useEffect, useCallback } from 'react';
    import { Calendar, Bike, Dumbbell, Snowflake, Mountain, Heart, Brain, ChevronDown, ChevronUp, Upload, Sparkles, Loader2, Info, BedDouble, BatteryCharging, Activity, TrendingUp, TrendingDown, MapPin } from 'lucide-react';
    
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

    // Simplified libraries; most content is now AI-generated or from backend
    const WORKOUT_LIBRARY = {
      cycling: {
        endurance: [{ name: "Zone 2 Ride", description: "Sustain a Zone 2 power/heart rate for the prescribed duration. This is your foundation." }],
        threshold: [{ name: "Classic 2x20", description: "2x20 minute intervals at 91-105% of your FTP with 5 minutes of easy spinning in between. Hard but effective." }],
      },
      ski: {
        strength: [{ name: "Uphill Athlete Leg Blaster", description: "3-5 rounds: 10 Goblet Squats, 10 Walking Lunges (per leg), 10 Box Jumps, 10 Kettlebell Swings. Minimal rest." }],
        muscularEndurance: [{ name: "Box Step-Up Challenge", description: "Accumulate 500-1000 weighted box step-ups over a 60-90 minute session. Go slow and steady." }],
      },
      recovery: [{ name: "Easy Spin", description: "30-60 minutes of very light cycling (Zone 1). Focus on high cadence to flush out the legs." }],
    };
    const MOBILITY_LIBRARY = { fullBody: ["10-Minute Squat Test", "Couch Stretch (2 min/side)", "Thoracic Spine Windmills (10/side)"] };
    const ICONS = { 'Ride': <Bike className="w-5 h-5 text-sky-400" />, 'Gym': <Dumbbell className="w-5 h-5 text-amber-400" />, 'Recovery': <Heart className="w-5 h-5 text-emerald-400" />, 'Ski': <Snowflake className="w-5 h-5 text-cyan-400" />, 'Free Day': <Mountain className="w-5 h-5 text-lime-400" /> };
    const MOCKED_GPX_ROUTES = [
        { id: 1, name: "River Path Loop", distance: "25 miles", elevation: "300 ft", profile: "Mostly flat with a few gentle rollers. Good for steady-state efforts." },
        { id: 2, name: "Lookout Mountain Climb", distance: "12 miles", elevation: "1,500 ft", profile: "A sustained 5-mile climb averaging 5-6% grade. Ideal for threshold and VO2 max intervals." },
        { id: 3, name: "Three Sisters", distance: "45 miles", elevation: "3,200 ft", profile: "Three distinct climbs of varying length and steepness. A challenging, hilly route." },
    ];
    const PAST_WOD_EXAMPLES = `- "Title: Team Murph, WOD: [TEAMS OF 2] For Time: 1 Mile Run, 100 Pull-ups, 200 Push-ups, 300 Air Squats, 1 Mile Run"\n- "Title: Adroit, WOD: For Time: 1,000/800 Meter Row, 50 Wall Balls (20/14), 25 Chest to Bar Pull-ups"`;
    
    // Helper function to call our secure backend proxy
    const callBackendAPI = async (payload) => {
        const response = await fetch(`${API_BASE_URL}/api/generate-content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload })
        });
        if (!response.ok) throw new Error('Backend API call failed');
        return response.json();
    };
    
    // Components (AccordionSection, HealthVitals, HealthTrends, DayCard, RouteSuggestion, DetailView) go here...
    // These components are identical to the previous version. For brevity, they are omitted here, but you would paste them in.
    const AccordionSection=({title,children,icon,defaultOpen=!1})=>{const[t,e]=useState(defaultOpen);return React.createElement("div",{className:"border-b border-gray-700"},React.createElement("button",{onClick:()=>e(!t),className:"w-full flex justify-between items-center py-3 text-left"},React.createElement("div",{className:"flex items-center gap-3"},icon,React.createElement("h3",{className:"font-semibold text-white"},title)),t?React.createElement(ChevronUp,null):React.createElement(ChevronDown,null)),React.createElement("div",{className:`overflow-hidden transition-all duration-300 ease-in-out ${t?"max-h-screen py-4":"max-h-0"}`},children))};const HealthVitals=({data:t,readiness:e})=>{if(!t||!e)return React.createElement("div",{className:"mb-8"},React.createElement("h2",{className:"text-xl font-bold mb-4 text-white"},"Daily Readiness"),React.createElement("div",{className:"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"},[...Array(4)].map((t,e)=>React.createElement("div",{key:e,className:"bg-gray-800/70 p-4 rounded-lg animate-pulse h-24"}))));const a={BALANCED:"text-emerald-400 border-emerald-400",UNBALANCED:"text-amber-400 border-amber-400",LOW:"text-red-400 border-red-400"},l={Optimal:"text-emerald-400 border-emerald-400",Good:"text-sky-400 border-sky-400",Low:"text-amber-400 border-amber-400"},n=({icon:t,label:a,value:l,subValue:n,colorClass:s="text-sky-400 border-sky-400"})=>React.createElement("div",{className:`bg-gray-800/70 p-4 rounded-lg border-l-4 ${s}`},React.createElement("div",{className:"flex justify-between items-center"},React.createElement("p",{className:"text-sm font-semibold text-gray-300"},a),React.cloneElement(t,{className:`w-6 h-6 ${s.split(" ")[0]}`})),React.createElement("div",{className:"flex items-baseline gap-1 mt-2"},React.createElement("p",{className:"text-3xl font-bold text-white"},l),n&&React.createElement("p",{className:"text-sm text-gray-400"},n)));return React.createElement("div",{className:"mb-8"},React.createElement("h2",{className:"text-xl font-bold mb-4 text-white"},"Daily Readiness"),React.createElement("div",{className:"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"},React.createElement(n,{icon:React.createElement(Sparkles,null),label:"Readiness Score",value:e.score,subValue:`/ 100 (${e.status})`,colorClass:l[e.status]}),React.createElement(n,{icon:React.createElement(BedDouble,null),label:"Sleep Score",value:t.sleepScore,subValue:"/ 100",colorClass:"text-purple-400 border-purple-400"}),React.createElement(n,{icon:React.createElement(Activity,null),label:"HRV Status",value:t.hrvStatus,colorClass:a[t.hrvStatus]||"text-gray-400 border-gray-400"}),React.createElement(n,{icon:React.createElement(Heart,null),label:"Resting HR",value:t.restingHeartRate,subValue:"bpm",colorClass:"text-red-400 border-red-400"})))};const HealthTrends=({trends:t})=>{if(!t||t.length<2)return null;const e=({title:t,data:a,keyName:l,unit:n,Icon:s,trend:r})=>{const c=a.map(t=>t[l]),o=c.reduce((t,e)=>t+e,0)/c.length,i="up"===r?React.createElement(TrendingUp,{className:"w-5 h-5 text-emerald-400"}):React.createElement(TrendingDown,{className:"w-5 h-5 text-red-400"});return React.createElement("div",{className:"bg-gray-800/70 p-4 rounded-lg"},React.createElement("div",{className:"flex justify-between items-center"},React.createElement("p",{className:"text-sm font-semibold text-gray-300"},t),s),React.createElement("div",{className:"flex items-baseline gap-2 mt-2"},React.createElement("p",{className:"text-2xl font-bold text-white"},c[c.length-1],n),React.createElement("div",{className:"flex items-center gap-1"},i,React.createElement("p",{className:`text-sm font-semibold ${"up"===r?"text-emerald-400":"text-red-400"}`},"vs avg (",Math.round(o),n,")"))),React.createElement("div",{className:"h-10 mt-3 flex items-end gap-1"},c.map((t,e)=>React.createElement("div",{key:e,className:"w-full bg-sky-800 rounded-t-sm hover:bg-sky-600",style:{height:`${t/Math.max(...c)*100}%`}}))))},a=t[t.length-1].sleepScore>t[t.length-2].sleepScore?"up":"down",l=t[t.length-1].restingHeartRate>t[t.length-2].restingHeartRate?"up":"down",n=t.map(t=>({...t,netBattery:t.bodyBatteryCharged-t.bodyBatteryDrained})),s=n[n.length-1].netBattery>n[n.length-2].netBattery?"up":"down";return React.createElement(AccordionSection,{title:"Recent Health Trends",icon:React.createElement(TrendingUp,null),defaultOpen:!0},React.createElement("div",{className:"grid grid-cols-1 md:grid-cols-3 gap-4"},React.createElement(e,{title:"Sleep Score",data:t,keyName:"sleepScore",unit:"",Icon:React.createElement(BedDouble,{className:"w-5 h-5 text-purple-400"}),trend:a}),React.createElement(e,{title:"Resting HR",data:t,keyName:"restingHeartRate",unit:"bpm",Icon:React.createElement(Heart,{className:"w-5 h-5 text-red-400"}),trend:"up"===l?"down":"up"}),React.createElement(e,{title:"Net Body Battery",data:n,keyName:"netBattery",unit:"",Icon:React.createElement(BatteryCharging,{className:"w-5 h-5 text-lime-400"}),trend:s})))};const DayCard=({day:t,data:e,isToday:a,onSelect:l,isSelected:n})=>{const s=`relative bg-gray-800 rounded-lg p-4 border-2 transition-all duration-200 hover:border-sky-500 ${n?"border-sky-500":"border-gray-700"} ${a?"ring-2 ring-offset-2 ring-offset-gray-900 ring-sky-400":""}`;return React.createElement("button",{onClick:l,className:s},React.createElement("p",{className:"font-bold text-white text-lg mb-2"},t),React.createElement("div",{className:"flex items-center gap-2 mb-2"},ICONS[e.type]||React.createElement(Dumbbell,{className:"w-5 h-5 text-gray-400"}),React.createElement("p",{className:"text-sm text-gray-300 font-semibold"},e.title)),React.createElement("p",{className:"text-xs text-gray-400 line-clamp-2"},e.workout.name))};const RouteSuggestion=({suggestion:t})=>{if(!t)return React.createElement("div",{className:"text-gray-300 space-y-2"},React.createElement("div",{className:"flex items-center gap-2"},React.createElement(Loader2,{className:"w-4 h-4 animate-spin text-sky-400"}),React.createElement("h4",{className:"font-semibold text-white text-lg"},"Finding the best route...")));if(!t.route)return React.createElement("div",{className:"text-gray-300 space-y-2"},React.createElement("h4",{className:"font-semibold text-white text-lg"},"Route Suggestion"),React.createElement("p",null,t.justification));const{route:e,justification:a}=t;return React.createElement("div",{className:"text-gray-300 space-y-2"},React.createElement("h4",{className:"font-semibold text-white text-lg"},e.name),React.createElement("p",{className:"text-sm"},React.createElement("span",{className:"font-semibold"},"Distance:")," ",e.distance," | ",React.createElement("span",{className:"font-semibold"},"Elevation:")," ",e.elevation),React.createElement("div",{className:"flex items-start gap-2 p-3 bg-gray-900/50 rounded-lg mt-2"},React.createElement(Info,{className:"w-5 h-5 text-sky-400 flex-shrink-0 mt-1"}),React.createElement("p",{className:"text-sm"},React.createElement("span",{className:"font-bold text-sky-400"},"Why this route?")," ",a)))};const DetailView=({day:t,data:e,onLog:a,onGetFeedback:l,aiFeedback:n,isLoading:s,healthData:r,healthTrends:c,routeSuggestion:o})=>{const[i,d]=useState("");if(!e)return null;const u=t=>{t.preventDefault(),i.trim()&&(a(e.workout,i),l(e.workout,i,r,c))};return React.createElement("div",{className:"bg-gray-800 rounded-xl p-6 border-2 border-gray-700 mt-6 lg:mt-0 lg:col-span-2"},React.createElement("div",{className:"flex items-center gap-3 mb-4"},ICONS[e.type]||React.createElement(Dumbbell,{className:"w-5 h-5 text-gray-400"}),React.createElement("div",null,React.createElement("p",{className:"text-sm text-sky-400 font-semibold"},t),React.createElement("h2",{className:"text-xl font-bold text-white"},e.title))),React.createElement("div",{className:"space-y-6"},React.createElement(AccordionSection,{title:"Workout Details",icon:React.createElement(Dumbbell,null),defaultOpen:!0},React.createElement("div",{className:"text-gray-300 space-y-2"},React.createElement("h4",{className:"font-semibold text-white"},e.workout.name),React.createElement("p",{className:"text-sm whitespace-pre-wrap"},e.workout.description),e.notes&&React.createElement("div",{className:"flex items-start gap-2 pt-2"},React.createElement(Info,{className:"w-5 h-5 text-sky-400 flex-shrink-0 mt-1"}),React.createElement("p",{className:"text-sm"},React.createElement("span",{className:"font-bold text-sky-400"},"Coach's Note:")," ",e.notes)))),"Ride"===e.type&&React.createElement(AccordionSection,{title:"Suggested Route",icon:React.createElement(MapPin,null),defaultOpen:!0},React.createElement(RouteSuggestion,{suggestion:o})),React.createElement(AccordionSection,{title:"Mobility Routine",icon:React.createElement(Brain,null)},React.createElement("ul",{className:"space-y-3"},MOBILITY_LIBRARY.fullBody.map((t,e)=>React.createElement("li",{key:e,className:"flex items-center gap-2"},React.createElement("div",{className:"w-2 h-2 bg-sky-400 rounded-full"}),React.createElement("span",null,t))))),React.createElement("div",{className:"bg-gray-900/50 border border-gray-700 rounded-lg p-4"},React.createElement("h3",{className:"font-semibold text-white mb-2"},"Log Today's Workout"),React.createElement("form",{onSubmit:u},React.createElement("textarea",{value:i,onChange:t=>d(t.target.value),className:"w-full bg-gray-700 text-gray-200 rounded-md p-2 text-sm focus:ring-2 focus:ring-sky-500 border-gray-600",rows:"3",placeholder:'e.g., "Felt strong, hit all targets." or "Legs were heavy, backed off 10%."'}),React.createElement("button",{type:"submit",disabled:s,className:"w-full mt-2 bg-sky-600 text-white font-bold py-2 px-4 rounded-md hover:bg-sky-500 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center gap-2"},s?React.createElement(React.Fragment,null,React.createElement(Loader2,{className:"w-5 h-5 animate-spin"}),"Analyzing..."):React.createElement(React.Fragment,null,React.createElement(Sparkles,{className:"w-5 h-5"}),"Log & Get Feedback")))),n&&React.createElement("div",{className:"p-4 bg-gray-900/50 rounded-lg border border-gray-700"},React.createElement("h3",{className:"font-semibold text-white mb-2 flex items-center gap-2"},React.createElement(Brain,{className:"w-5 h-5 text-sky-400"}),"AI Coach Feedback"),React.createElement("p",{className:"text-gray-300 whitespace-pre-wrap"},n))))};

    export default function UphillCoachApp() {
        const [currentDate] = useState(new Date());
        const [season, setSeason] = useState('Cycling'); // Default
        const [weeklyPlan, setWeeklyPlan] = useState(null);
        const [planModificationNote, setPlanModificationNote] = useState(null);
        const [selectedDay, setSelectedDay] = useState(null);
        const [aiFeedback, setAiFeedback] = useState('');
        const [isLoading, setIsLoading] = useState(false);
        const [healthData, setHealthData] = useState(null);
        const [healthTrends, setHealthTrends] = useState([]);
        const [readiness, setReadiness] = useState(null);
        const [routeSuggestion, setRouteSuggestion] = useState(null);

        const dayOfWeek = currentDate.toLocaleString('en-US', { weekday: 'long' });

        const getAIGeneratedWod = useCallback(async (day, currentSeason, weeklySchedule) => {
            const isCycling = currentSeason === 'Cycling';
            const focus = day === 'Monday' ?
                (isCycling ? "Focus on posterior chain and upper body strength. Avoid excessive leg fatigue for tomorrow's ride." : "Focus on full-body strength.") :
                (isCycling ? "Focus on metabolic conditioning with a balanced mix of movements." : "Focus on muscular endurance and core stability.");
            
            const payload = {
                contents: [{ parts: [{ text: `Generate a CrossFit-style workout for ${day}. Season: ${currentSeason}. Schedule: ${weeklySchedule}. Focus: ${focus}. Examples:\n${PAST_WOD_EXAMPLES}\nReturn ONLY a valid JSON object with "name" and "description" keys.` }] }],
                systemInstruction: { parts: [{ text: `You are an expert CrossFit (WCABTMD) and endurance sports programmer. Return only a valid JSON object.` }] },
            };
            const data = await callBackendAPI(payload);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
        }, []);

        useEffect(() => {
            const fetchHealthData = async () => {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/health-data`);
                    if (!response.ok) throw new Error('Failed to fetch health data');
                    const { latestData, trends, readiness } = await response.json();
                    setHealthData(latestData);
                    setHealthTrends(trends);
                    setReadiness(readiness);

                    // Determine season based on fetched date if available, otherwise use current date
                    const dataDate = latestData ? new Date(latestData.date) : new Date();
                    const currentSeason = (dataDate.getMonth() >= 3 && dataDate.getMonth() <= 9) ? 'Cycling' : 'Ski';
                    setSeason(currentSeason);
                    
                    generatePlan(currentSeason, readiness);
                } catch (error) {
                    console.error("Error fetching data:", error);
                    // Generate a plan even if health data fails
                    generatePlan(season, null); 
                }
            };
            fetchHealthData();
        }, []);

        const generatePlan = useCallback(async (currentSeason, currentReadiness) => {
            const isCycling = currentSeason === 'Cycling';
            let basePlan = {
                Monday: { title: 'Generated Strength WOD', type: 'Gym', mobility: MOBILITY_LIBRARY.fullBody, notes: "AI-generated to complement your week.", workout: {name: 'Generating...', description: ''} },
                Tuesday: { title: 'Group Road Ride', type: 'Ride', mobility: MOBILITY_LIBRARY.fullBody, notes: "High intensity group session.", workout: isCycling ? WORKOUT_LIBRARY.cycling.threshold[0] : {name: 'Indoor Intervals', description: 'Simulate outdoor ride intensity.'} },
                Wednesday: { title: 'Recovery / Light Day', type: 'Recovery', mobility: MOBILITY_LIBRARY.fullBody, notes: "Focus on active recovery.", workout: WORKOUT_LIBRARY.recovery[0] },
                Thursday: { title: isCycling ? 'Structured Ride' : 'Muscular Endurance', type: isCycling ? 'Ride' : 'Gym', mobility: MOBILITY_LIBRARY.fullBody, notes: "Key session for building your engine.", workout: isCycling ? WORKOUT_LIBRARY.cycling.endurance[0] : WORKOUT_LIBRARY.ski.muscularEndurance[0] },
                Friday: { title: 'Generated Conditioning WOD', type: 'Gym', mobility: MOBILITY_LIBRARY.fullBody, notes: "AI-generated to boost work capacity.", workout: {name: 'Generating...', description: ''} },
                Saturday: { title: isCycling ? 'Long Ride' : 'Long Ski Day', type: isCycling ? 'Ride' : 'Ski', mobility: MOBILITY_LIBRARY.fullBody, notes: "Build endurance and enjoy the day.", workout: {name: 'Zone 2 Endurance', description: 'Go long and steady.'} },
                Sunday: { title: 'Flex Day', type: 'Free Day', mobility: MOBILITY_LIBRARY.fullBody, notes: "Long ride, recovery, or rest. Your call.", workout: {name: 'Athlete Choice', description: 'Listen to your body.'} },
            };

            setWeeklyPlan(basePlan); // Show loading state

            const weeklyScheduleSummary = "High-intensity ride on Tuesday, long ride on Saturday.";
            const [mondayWod, fridayWod] = await Promise.all([
                getAIGeneratedWod('Monday', currentSeason, weeklyScheduleSummary),
                getAIGeneratedWod('Friday', currentSeason, weeklyScheduleSummary)
            ]);
            basePlan.Monday.workout = mondayWod;
            basePlan.Friday.workout = fridayWod;

            let modificationNote = null;
            if (currentReadiness && currentReadiness.score < 50) {
                const today = new Date().toLocaleString('en-US', { weekday: 'long' });
                if (basePlan[today] && (basePlan[today].type === 'Ride' || basePlan[today].type === 'Gym')) {
                    modificationNote = `Your readiness score is low (${currentReadiness.score}/100). Today's intense workout has been swapped for a recovery session.`;
                    basePlan[today] = { title: 'Readiness-Based Recovery', type: 'Recovery', workout: WORKOUT_LIBRARY.recovery[0], mobility: MOBILITY_LIBRARY.fullBody, notes: "Listen to your body. Today is about active recovery." };
                }
            }
            setPlanModificationNote(modificationNote);
            setWeeklyPlan(basePlan);
            setSelectedDay(dayOfWeek);
        }, [dayOfWeek, getAIGeneratedWod]);

        useEffect(() => {
            const getRouteSuggestion = async (workout) => {
                const payload = {
                    contents: [{ parts: [{ text: `Workout: "${workout.name}" - ${workout.description}. Available Routes:\n${MOCKED_GPX_ROUTES.map(r => `- Name: "${r.name}", Profile: "${r.profile}"`).join('\n')}\nWhich single route is most suitable? Return ONLY a valid JSON object with "routeId" and "justification" keys.` }] }],
                    systemInstruction: { parts: [{ text: `You are an expert cycling coach. Recommend the single best route. Return only valid JSON.` }] },
                };
                try {
                    const data = await callBackendAPI(payload);
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    const suggestion = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
                    const chosenRoute = MOCKED_GPX_ROUTES.find(r => r.id === suggestion.routeId);
                    setRouteSuggestion({ route: chosenRoute, justification: suggestion.justification });
                } catch (error) {
                    console.error("Failed to get route suggestion:", error);
                    setRouteSuggestion({ route: null, justification: "Could not generate a route suggestion." });
                }
            };

            if (selectedDay && weeklyPlan) {
                const dayData = weeklyPlan[selectedDay];
                if (dayData && dayData.type === 'Ride' && season === 'Cycling') {
                    setRouteSuggestion(null); // Set loading state
                    getRouteSuggestion(dayData.workout);
                }
            }
        }, [selectedDay, weeklyPlan, season]);

        const handleGetFeedback = useCallback(async (workout, result, healthData, healthTrends) => {
            setIsLoading(true);
            setAiFeedback('');
            const healthSummary = healthData ? `Today's metrics: Sleep: ${healthData.sleepScore}, HRV: ${healthData.hrvStatus}, RHR: ${healthData.restingHeartRate}.` : "Health metrics unavailable.";
            const trendsSummary = healthTrends.length > 1 ? `Recent sleep trend is ${healthTrends[healthTrends.length-1].sleepScore > healthTrends[healthTrends.length-2].sleepScore ? 'improving' : 'declining'}.` : "";
            
            const payload = {
                contents: [{ parts: [{ text: `My user completed "${workout.name}" with this result: "${result}". ${healthSummary} ${trendsSummary} Provide CONCISE (4-5 sentences) data-driven feedback connecting their performance, recovery, and long-term goals.` }] }],
                systemInstruction: { parts: [{ text: `You are an elite-level health coach named "Coach AI". Your tone is encouraging and knowledgeable.` }] },
            };
            try {
                const data = await callBackendAPI(payload);
                setAiFeedback(data.candidates?.[0]?.content?.parts?.[0]?.text || "Could not get feedback.");
            } catch (error) {
                console.error("Failed to get AI feedback:", error);
                setAiFeedback("An error occurred while getting feedback.");
            } finally {
                setIsLoading(false);
            }
        }, []);
        
        if (!weeklyPlan) {
            return <div className="bg-gray-900 text-white min-h-screen flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-sky-400" /><p className="ml-4 text-xl">Contacting Coach AI...</p></div>
        }

        return (
            <div className="bg-gray-900 text-gray-200 min-h-screen font-sans p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto">
                    <header className="mb-8">
                        <div className="flex items-center gap-4">
                            <div className="bg-sky-500 p-2 rounded-lg"><Bike className="w-8 h-8 text-white" /></div>
                            <div>
                                <h1 className="text-3xl font-bold text-white">Uphill Athlete AI Coach</h1>
                                <p className="text-gray-400">{currentDate.toDateString()} | <span className="font-semibold text-sky-400">{season} Season</span></p>
                            </div>
                        </div>
                    </header>
                    {healthData && readiness && <HealthVitals data={healthData} readiness={readiness} />}
                    {planModificationNote && <div className="mb-6 p-4 bg-amber-900/50 border border-amber-600 rounded-lg flex items-start gap-3"><Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-1" /><div><h3 className="font-semibold text-amber-300">Plan Adjusted</h3><p className="text-sm text-amber-300/80">{planModificationNote}</p></div></div>}
                    <main className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        <div className="lg:col-span-3">
                            <h2 className="text-xl font-bold mb-4 text-white">This Week's Plan</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {Object.entries(weeklyPlan).map(([day, data]) => <DayCard key={day} day={day} data={data} isToday={day === dayOfWeek} isSelected={day === selectedDay} onSelect={() => setSelectedDay(day)} />)}
                            </div>
                            <div className="mt-6">
                                {healthTrends && healthTrends.length > 0 && <HealthTrends trends={healthTrends} />}
                            </div>
                        </div>
                        {selectedDay && weeklyPlan[selectedDay] && <DetailView day={selectedDay} data={weeklyPlan[selectedDay]} onLog={(w, r) => console.log("Logged:", w, r)} onGetFeedback={handleGetFeedback} aiFeedback={aiFeedback} isLoading={isLoading} healthData={healthData} healthTrends={healthTrends} routeSuggestion={routeSuggestion} />}
                    </main>
                </div>
            </div>
        );
    }
    

