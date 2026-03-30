"""
Garmin Training Coach - Python FastAPI Backend
Connects to Garmin Connect, fetches fitness data, and uses Claude AI
to generate personalized workouts and route suggestions.
"""

import json
import os
import re
import threading
from datetime import date, timedelta
from typing import Optional

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Garmin Training Coach API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------
_garmin: Optional[Garmin] = None
_garmin_lock = threading.Lock()
GARTH_HOME = os.path.expanduser(os.environ.get("GARTH_HOME", "~/.garth_coach"))

# MFA flow: frontend posts code which unblocks the login thread
_mfa_event: Optional[threading.Event] = None
_mfa_code: Optional[str] = None
_mfa_required = False

_anthropic = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


# ---------------------------------------------------------------------------
# Request/response models
# ---------------------------------------------------------------------------
class ConnectRequest(BaseModel):
    email: str
    password: str


class MFARequest(BaseModel):
    code: str


class WorkoutRequest(BaseModel):
    workout_type: str = "run"          # run | cycle | strength | swim | hike
    duration_minutes: int = 45
    fitness_goal: str = "endurance"    # endurance | speed | strength | recovery | weight_loss
    intensity: str = "moderate"        # easy | moderate | hard | intervals


class RouteRequest(BaseModel):
    location: str
    workout_type: str = "run"
    duration_minutes: int = 45
    distance_km: Optional[float] = None
    terrain_preference: str = "any"    # road | trail | mixed | any


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def safe_call(func, *args, **kwargs):
    """Call a Garmin API method safely; return None on any error."""
    try:
        return func(*args, **kwargs)
    except Exception as exc:
        print(f"[WARN] {getattr(func, '__name__', str(func))} failed: {exc}")
        return None


def _mfa_callback() -> str:
    """Called by garth/garminconnect when MFA code is needed."""
    global _mfa_event, _mfa_code, _mfa_required
    _mfa_required = True
    _mfa_event = threading.Event()
    print("[AUTH] MFA required – waiting for code from frontend…")
    _mfa_event.wait(timeout=300)  # wait up to 5 minutes
    code = _mfa_code or ""
    _mfa_code = None
    _mfa_event = None
    _mfa_required = False
    return code


def extract_json(text: str) -> Optional[dict]:
    """Extract the first JSON object from a Claude response."""
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def build_fitness_context(fitness: dict) -> str:
    """Convert raw Garmin fitness dict into a readable context string for Claude."""
    parts = []

    stats = fitness.get("stats") or {}
    if stats:
        steps = stats.get("totalSteps", "N/A")
        active_kcal = stats.get("activeKilocalories", "N/A")
        rhr = stats.get("restingHeartRate", "N/A")
        parts.append(f"Steps today: {steps} | Active calories: {active_kcal} kcal | RHR: {rhr} bpm")

    readiness = fitness.get("training_readiness") or {}
    if readiness:
        score = readiness.get("score") or readiness.get("trainingReadinessScore", "N/A")
        parts.append(f"Training readiness score: {score}/100")

    sleep = fitness.get("sleep") or {}
    sleep_dto = sleep.get("dailySleepDTO") or {}
    sleep_scores = sleep_dto.get("sleepScores") or {}
    overall_sleep = sleep_scores.get("overall") or {}
    sleep_val = overall_sleep.get("value", "N/A")
    if sleep_val != "N/A":
        parts.append(f"Sleep score: {sleep_val}/100")

    hrv = fitness.get("hrv") or {}
    hrv_summary = hrv.get("hrvSummary") or {}
    hrv_val = hrv_summary.get("lastNight", "N/A")
    if hrv_val != "N/A":
        parts.append(f"HRV: {hrv_val} ms")

    max_m = fitness.get("max_metrics") or {}
    vo2 = max_m.get("vo2MaxPreciseValue") or max_m.get("generic", {}).get("vo2MaxPreciseValue")
    if vo2:
        parts.append(f"VO2 Max: {vo2:.1f} ml/kg/min")

    return "\n".join(parts) if parts else ""


# ---------------------------------------------------------------------------
# Routes – system
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "garmin_connected": _garmin is not None,
        "mfa_pending": _mfa_required,
    }


# ---------------------------------------------------------------------------
# Routes – Garmin auth
# ---------------------------------------------------------------------------
@app.post("/api/garmin/connect")
async def connect_garmin(req: ConnectRequest):
    global _garmin, _mfa_required

    def do_login():
        global _garmin
        try:
            client = Garmin(req.email, req.password, prompt_mfa=_mfa_callback)
            # Try existing saved tokens first
            try:
                client.login(GARTH_HOME)
            except FileNotFoundError:
                client.login()
                os.makedirs(GARTH_HOME, exist_ok=True)
                client.garth.dump(GARTH_HOME)
            with _garmin_lock:
                _garmin = client
        except Exception as exc:
            print(f"[ERROR] Login failed: {exc}")
            raise

    try:
        with _garmin_lock:
            pass  # just test the lock

        # Run login in a thread so MFA callback can work asynchronously
        login_thread = threading.Thread(target=do_login, daemon=True)
        login_thread.start()
        login_thread.join(timeout=15)  # wait up to 15s for non-MFA login

        if _mfa_required:
            return {"success": False, "mfa_required": True, "message": "MFA code required"}

        if login_thread.is_alive():
            return {"success": False, "mfa_required": True, "message": "Waiting for MFA code"}

        if _garmin is None:
            raise HTTPException(status_code=401, detail="Authentication failed. Check your credentials.")

        name = safe_call(_garmin.get_full_name) or req.email.split("@")[0]
        return {"success": True, "name": name}

    except GarminConnectAuthenticationError as exc:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {exc}")
    except GarminConnectConnectionError as exc:
        raise HTTPException(status_code=503, detail=f"Garmin Connect unreachable: {exc}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/garmin/mfa")
async def submit_mfa(req: MFARequest):
    global _mfa_code, _mfa_event
    if not _mfa_required or _mfa_event is None:
        raise HTTPException(status_code=400, detail="No MFA flow in progress")
    _mfa_code = req.code.strip()
    _mfa_event.set()
    # Wait briefly for the login thread to complete
    import time
    for _ in range(20):
        time.sleep(0.5)
        if _garmin is not None:
            name = safe_call(_garmin.get_full_name) or "Athlete"
            return {"success": True, "name": name}
    raise HTTPException(status_code=408, detail="Login timed out after MFA. Try again.")


@app.post("/api/garmin/disconnect")
async def disconnect_garmin():
    global _garmin
    with _garmin_lock:
        _garmin = None
    return {"success": True}


# ---------------------------------------------------------------------------
# Routes – fitness data
# ---------------------------------------------------------------------------
@app.get("/api/garmin/fitness")
async def get_fitness():
    if not _garmin:
        raise HTTPException(status_code=401, detail="Not connected to Garmin. Please login first.")

    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    result = {
        "date": today,
        "stats": safe_call(_garmin.get_stats, today),
        "user_summary": safe_call(_garmin.get_user_summary, today),
        "hrv": safe_call(_garmin.get_hrv_data, today),
        "sleep": safe_call(_garmin.get_sleep_data, yesterday),
        "training_readiness": safe_call(_garmin.get_training_readiness, today),
        "training_status": safe_call(_garmin.get_training_status, today),
        "heart_rates": safe_call(_garmin.get_heart_rates, today),
        "max_metrics": safe_call(_garmin.get_max_metrics, today),
        "body_composition": safe_call(_garmin.get_body_composition, today),
        "stress": safe_call(_garmin.get_all_day_stress, today),
    }
    return result


@app.get("/api/garmin/activities")
async def get_activities(limit: int = 10):
    if not _garmin:
        raise HTTPException(status_code=401, detail="Not connected to Garmin")
    activities = safe_call(_garmin.get_activities, 0, limit) or []
    return {"activities": activities}


# ---------------------------------------------------------------------------
# Routes – AI: workout generation
# ---------------------------------------------------------------------------
@app.post("/api/garmin/generate-workout")
async def generate_workout(req: WorkoutRequest):
    # Optionally enrich with live Garmin data
    fitness_context = ""
    if _garmin:
        today = date.today().isoformat()
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        fitness = {
            "stats": safe_call(_garmin.get_stats, today),
            "training_readiness": safe_call(_garmin.get_training_readiness, today),
            "sleep": safe_call(_garmin.get_sleep_data, yesterday),
            "hrv": safe_call(_garmin.get_hrv_data, today),
            "max_metrics": safe_call(_garmin.get_max_metrics, today),
        }
        fitness_context = build_fitness_context(fitness)

    ctx_section = f"\n\nAthlete's current fitness data:\n{fitness_context}" if fitness_context else ""

    prompt = f"""You are an expert sports coach. Generate a detailed, science-backed workout plan.

Workout Type: {req.workout_type}
Duration: {req.duration_minutes} minutes
Goal: {req.fitness_goal}
Intensity: {req.intensity}{ctx_section}

Create a structured, well-paced workout. Return ONLY valid JSON matching this schema exactly:
{{
  "title": "Descriptive workout title",
  "type": "{req.workout_type}",
  "total_duration_min": {req.duration_minutes},
  "estimated_calories": 350,
  "warmup": {{
    "duration_min": 10,
    "description": "Step-by-step warmup instructions"
  }},
  "main_set": [
    {{
      "name": "Block name",
      "duration_min": 20,
      "instructions": "Detailed instructions for this block",
      "target_hr_zone": "Zone 2-3",
      "reps": null,
      "rest_min": null
    }}
  ],
  "cooldown": {{
    "duration_min": 5,
    "description": "Cooldown instructions"
  }},
  "target_metrics": {{
    "hr_zone": "Zone 2",
    "pace_per_km": "5:30-6:00",
    "power_watts": null,
    "cadence_rpm": null,
    "rpe": "5-6/10"
  }},
  "equipment": ["Running shoes", "HR monitor"],
  "tips": ["Key tip 1", "Key tip 2", "Key tip 3"],
  "adaptations": {{
    "if_feeling_good": "How to progress the session",
    "if_tired": "How to scale back the session"
  }}
}}"""

    try:
        message = _anthropic.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text
        workout = extract_json(text)
        if workout:
            return {"workout": workout, "ai_generated": True}
        # Fallback: return raw text wrapped
        return {"workout": {"title": "Generated Workout", "raw": text}, "ai_generated": True}
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=500, detail="Invalid Anthropic API key. Set ANTHROPIC_API_KEY in .env")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Routes – AI: route suggestions
# ---------------------------------------------------------------------------
@app.post("/api/garmin/suggest-route")
async def suggest_route(req: RouteRequest):
    distance_hint = (
        f"approximately {req.distance_km} km" if req.distance_km else "appropriate for the duration"
    )

    prompt = f"""You are an expert running and cycling route planner with encyclopedic knowledge of trails, parks, and roads worldwide.

Location: {req.location}
Activity Type: {req.workout_type}
Duration: {req.duration_minutes} minutes
Distance: {distance_hint}
Terrain Preference: {req.terrain_preference}

Suggest 3 specific, realistic routes near this location using your knowledge of actual trails, parks, paths, and roads. Return ONLY valid JSON:
{{
  "location": "{req.location}",
  "routes": [
    {{
      "name": "Specific named route",
      "description": "Engaging 2-sentence description",
      "distance_km": 8.5,
      "elevation_gain_m": 150,
      "surface": "trail",
      "difficulty": "moderate",
      "estimated_duration_min": {req.duration_minutes},
      "start_point": "Specific named starting location (parking lot, landmark, etc.)",
      "landmarks": ["Landmark 1", "Landmark 2", "Landmark 3"],
      "why_good": "Why this route suits the workout goal",
      "navigation_summary": [
        "Start at [specific place]",
        "Head [direction] on [trail/road name]",
        "Pass [landmark]",
        "Return via [route]"
      ],
      "google_maps_search": "Specific search query to find the start point",
      "strava_segment": "Likely Strava segment name if well-known",
      "surface_breakdown": "70% trail, 30% gravel",
      "pros": ["Well-marked trail", "Scenic views"],
      "cons": ["Busy on weekends"],
      "best_time": "Early morning or weekday",
      "parking": "Where to park or access by public transport"
    }}
  ],
  "local_tips": ["Tip about local conditions", "Weather or seasonal advice"]
}}"""

    try:
        message = _anthropic.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2500,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text
        routes = extract_json(text)
        if routes:
            return routes
        return {"location": req.location, "routes": [], "raw": text}
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=500, detail="Invalid Anthropic API key. Set ANTHROPIC_API_KEY in .env")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
