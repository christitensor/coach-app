"""
Garmin Training Coach - Python FastAPI Backend
Connects to Garmin Connect, fetches fitness data, and uses Claude AI
to generate personalized workouts and route suggestions.
"""

import asyncio
import base64
import json
import os
import re
import threading
from datetime import date, timedelta
from typing import List, Optional

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
from notion_client import Client as NotionClient
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Garmin Training Coach API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Notion config
# ---------------------------------------------------------------------------
NOTION_API_KEY = os.environ.get("NOTION_API_KEY", "")
WOD_DB_ID = "d3a4b547-32db-4c50-bb93-6056f468c8ef"
# The Date property has a BOM prefix character
DATE_PROP = "﻿Date"

def _notion_client() -> NotionClient:
    if not NOTION_API_KEY:
        raise HTTPException(status_code=500, detail="NOTION_API_KEY not set in .env")
    return NotionClient(auth=NOTION_API_KEY)

def _parse_wod_page(page: dict) -> dict:
    """Extract useful fields from a raw Notion page object."""
    props = page.get("properties", {})
    def text(key):
        p = props.get(key, {})
        rich = p.get("rich_text") or p.get("title") or []
        return "".join(t.get("plain_text", "") for t in rich).strip()
    def datep(key):
        p = props.get(key, {})
        d = p.get("date") or {}
        return d.get("start")
    def selectp(key):
        p = props.get(key, {})
        s = p.get("select") or {}
        return s.get("name")
    return {
        "title": text("Title"),
        "wod": text("WOD"),
        "date": datep(DATE_PROP),
        "week_day": selectp("week day"),
        "ct_score": text("CT Score"),
        "benchmark": selectp("Benchmark?"),
        "compare_to": text("Compare to"),
    }

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


def _load_garth_tokens():
    """Load pre-saved Garmin tokens from GARTH_TOKENS env var (base64 JSON of token files)."""
    global _garmin
    token_b64 = os.environ.get("GARTH_TOKENS", "")
    if not token_b64:
        return
    try:
        files = json.loads(base64.b64decode(token_b64).decode())
        os.makedirs(GARTH_HOME, exist_ok=True)
        for fname, content in files.items():
            with open(os.path.join(GARTH_HOME, fname), "w") as f:
                f.write(content)
        client = Garmin()
        client.login(GARTH_HOME)
        with _garmin_lock:
            _garmin = client
        print("[INFO] Loaded Garmin tokens from GARTH_TOKENS env var")
    except Exception as exc:
        print(f"[WARN] Could not load GARTH_TOKENS: {exc}")


_load_garth_tokens()


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
        "auto_connected": _garmin is not None and bool(os.environ.get("GARTH_TOKENS")),
    }


# ---------------------------------------------------------------------------
# Routes – Garmin auth
# ---------------------------------------------------------------------------
@app.post("/api/garmin/connect")
async def connect_garmin(req: ConnectRequest):
    global _garmin, _mfa_required

    login_exc: list = []

    def do_login():
        global _garmin
        try:
            client = Garmin(req.email, req.password, prompt_mfa=_mfa_callback)
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
            login_exc.append(exc)

    try:
        login_thread = threading.Thread(target=do_login, daemon=True)
        login_thread.start()
        # Use asyncio.to_thread so we don't block the event loop
        await asyncio.to_thread(login_thread.join, 30)

        if login_exc:
            exc = login_exc[0]
            if isinstance(exc, GarminConnectAuthenticationError):
                raise HTTPException(status_code=401, detail=f"Authentication failed: {exc}")
            raise HTTPException(status_code=500, detail=str(exc))

        if _mfa_required:
            return {"success": False, "mfa_required": True, "message": "MFA code required"}

        if login_thread.is_alive():
            return {"success": False, "mfa_required": True, "message": "Waiting for MFA code"}

        if _garmin is None:
            raise HTTPException(status_code=401, detail="Authentication failed. Check your credentials.")

        name = safe_call(_garmin.get_full_name) or req.email.split("@")[0]
        return {"success": True, "name": name}

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
# Routes – Performance Management Chart (TrainingPeaks-style)
# ---------------------------------------------------------------------------

def _estimate_tss(activity: dict) -> float:
    """
    Estimate TSS (Training Stress Score) for an activity.
    Uses activityTrainingLoad when available; falls back to
    duration × (avg_hr / threshold_hr)² × 100.
    """
    # Garmin's own training load is the best proxy
    tl = activity.get("activityTrainingLoad")
    if tl and tl > 0:
        return float(tl)
    # HR-based estimate (rough)
    duration_h = (activity.get("duration") or 0) / 3600
    avg_hr = activity.get("averageHR") or 0
    threshold_hr = 160  # assumed; could be parameterised later
    if avg_hr > 0 and duration_h > 0:
        ratio = min(avg_hr / threshold_hr, 1.15)
        return round(duration_h * ratio * ratio * 100, 1)
    return 0.0


@app.get("/api/garmin/pmc")
async def get_pmc(days: int = 90):
    """
    Return daily TSS, CTL (42-day EMA), ATL (7-day EMA), and TSB for the
    last `days` days — the core Performance Management Chart data.
    """
    if not _garmin:
        raise HTTPException(status_code=401, detail="Not connected to Garmin")

    # Fetch enough activities to cover the window (200 is generous)
    activities = safe_call(_garmin.get_activities, 0, 200) or []

    today = date.today()
    window_start = today - timedelta(days=days)

    # Build date → total TSS map
    daily_tss: dict[str, float] = {}
    act_by_date: dict[str, list] = {}

    for act in activities:
        date_str = (act.get("startTimeLocal") or "")[:10]
        if not date_str:
            continue
        try:
            act_date = date.fromisoformat(date_str)
        except ValueError:
            continue
        if act_date < window_start:
            continue
        tss = _estimate_tss(act)
        daily_tss[date_str] = daily_tss.get(date_str, 0.0) + tss
        act_by_date.setdefault(date_str, []).append({
            "name": act.get("activityName", "Activity"),
            "type": act.get("activityType", {}).get("typeKey", ""),
            "distance_km": round((act.get("distance") or 0) / 1000, 2),
            "duration_min": round((act.get("duration") or 0) / 60),
            "avg_hr": act.get("averageHR"),
            "tss": round(_estimate_tss(act), 1),
        })

    # Walk day-by-day to compute CTL/ATL/TSB with exponential moving averages.
    # Seed with 0; a more accurate implementation would walk back further, but
    # 90 days of data is enough for meaningful trends.
    ctl = 0.0
    atl = 0.0
    pmc = []

    current = window_start
    while current <= today:
        ds = current.isoformat()
        tss = daily_tss.get(ds, 0.0)
        ctl = ctl * (1 - 1 / 42) + tss * (1 / 42)
        atl = atl * (1 - 1 / 7)  + tss * (1 / 7)
        tsb = ctl - atl
        pmc.append({
            "date": ds,
            "tss": round(tss, 1),
            "ctl": round(ctl, 1),
            "atl": round(atl, 1),
            "tsb": round(tsb, 1),
            "activities": act_by_date.get(ds, []),
        })
        current += timedelta(days=1)

    last = pmc[-1] if pmc else {}
    ctl_now = last.get("ctl", 0)
    atl_now = last.get("atl", 0)
    tsb_now = last.get("tsb", 0)

    form = (
        "peak"    if tsb_now >  15 else
        "fresh"   if tsb_now >   5 else
        "neutral" if tsb_now >  -5 else
        "tired"   if tsb_now > -25 else
        "very tired"
    )

    return {
        "pmc": pmc,
        "current": {
            "ctl": round(ctl_now, 1),
            "atl": round(atl_now, 1),
            "tsb": round(tsb_now, 1),
            "form": form,
        },
    }


# ---------------------------------------------------------------------------
# Routes – Notion WOD
# ---------------------------------------------------------------------------

@app.get("/api/notion/today-wod")
async def get_today_wod():
    """Return today's programmed WOD from Notion (if it exists)."""
    notion = _notion_client()
    today = date.today().isoformat()
    try:
        resp = notion.databases.query(
            database_id=WOD_DB_ID,
            filter={"property": DATE_PROP, "date": {"equals": today}},
            page_size=1,
        )
        pages = resp.get("results", [])
        if not pages:
            return {"wod": None, "date": today}
        return {"wod": _parse_wod_page(pages[0]), "date": today}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/notion/recent-wods")
async def get_recent_wods(days: int = 28):
    """Return WODs from the last N days for movement history context."""
    notion = _notion_client()
    since = (date.today() - timedelta(days=days)).isoformat()
    try:
        resp = notion.databases.query(
            database_id=WOD_DB_ID,
            filter={"property": DATE_PROP, "date": {"after": since}},
            sorts=[{"property": DATE_PROP, "direction": "descending"}],
            page_size=30,
        )
        wods = [_parse_wod_page(p) for p in resp.get("results", [])]
        # Filter out placeholder entries
        wods = [w for w in wods if w["wod"] and w["wod"].lower() != "missing"]
        return {"wods": wods}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Routes – Smart workout generation (CrossFit + Ride aware)
# ---------------------------------------------------------------------------

class SmartWorkoutRequest(BaseModel):
    day_type: str = "crossfit"          # crossfit | ride | rest
    duration_minutes: int = 60
    intensity: str = "moderate"         # easy | moderate | hard
    use_notion_wod: bool = True         # for crossfit: pull today's Notion WOD


@app.post("/api/workout/generate-smart")
async def generate_smart_workout(req: SmartWorkoutRequest):
    """
    Generate a workout that's appropriate for the day type:
    - crossfit: pulls today's Notion WOD + recent history, scales to Garmin readiness
    - ride: uses Garmin data to generate a structured cycling session
    """
    # ── gather Garmin context ──────────────────────────────────────────────
    fitness_context = ""
    recent_activities_text = ""
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

        recent = safe_call(_garmin.get_activities, 0, 5) or []
        if recent:
            lines = []
            for a in recent:
                name = a.get("activityName", "Activity")
                atype = a.get("activityType", {}).get("typeKey", "")
                dist = f"{a.get('distance', 0)/1000:.1f}km" if a.get("distance") else ""
                dur = f"{int(a.get('duration', 0)//60)}min" if a.get("duration") else ""
                lines.append(f"- {a.get('startTimeLocal','')[:10]} {atype}: {name} {dist} {dur}".strip())
            recent_activities_text = "Recent Garmin activities:\n" + "\n".join(lines)

    # ── CROSSFIT path ──────────────────────────────────────────────────────
    if req.day_type == "crossfit":
        today_wod = None
        recent_wods_text = ""

        if req.use_notion_wod and NOTION_API_KEY:
            try:
                tw = await get_today_wod()
                today_wod = tw.get("wod")
            except Exception:
                pass
            try:
                rw = await get_recent_wods(days=28)
                wod_list = rw.get("wods", [])[:15]
                if wod_list:
                    lines = [f"- {w['date']} [{w['week_day'] or '?'}] {w['title']}: {(w['wod'] or '')[:120]}..." for w in wod_list]
                    recent_wods_text = "Recent WODs (last 4 weeks):\n" + "\n".join(lines)
            except Exception:
                pass

        if today_wod and today_wod.get("wod"):
            wod_section = f"""Today's programmed WOD from Notion:
Title: {today_wod['title']}
{today_wod['wod']}
{f"Previous score: {today_wod['ct_score']}" if today_wod.get('ct_score') else ""}
{f"Compare to: {today_wod['compare_to']}" if today_wod.get('compare_to') else ""}"""
        else:
            wod_section = "No WOD programmed in Notion for today — create a fresh CrossFit WOD."

        prompt = f"""You are an expert CrossFit coach. Program today's CrossFit workout.

{wod_section}

{recent_wods_text}

{f"Athlete fitness data:{chr(10)}{fitness_context}" if fitness_context else ""}
{recent_activities_text}

Intensity preference: {req.intensity}
Duration available: {req.duration_minutes} minutes

Your job:
1. If a WOD is programmed, present it clearly with appropriate scaling options based on the athlete's readiness.
2. If no WOD is programmed, create a well-balanced CrossFit WOD that:
   - Avoids overworking muscle groups hit in the last 4 WODs
   - Matches the athlete's current readiness (low readiness → shorter, aerobic focus; high → higher intensity)
3. Always provide 3 scaling tiers: RX (as written), Scaled, and Beginner.
4. Add a brief coach's note on pacing/strategy.

Return ONLY valid JSON:
{{
  "title": "WOD name",
  "date": "{date.today().isoformat()}",
  "source": "notion" or "generated",
  "format": "AMRAP / For Time / EMOM / etc.",
  "time_cap_min": 20,
  "workout": "Full WOD text exactly as written",
  "rx": {{"description": "RX standards", "weights": "Men: 135lb / Women: 95lb"}},
  "scaled": {{"description": "Scaled version", "weights": "Men: 95lb / Women: 65lb", "modifications": ["Sub ring rows for pull-ups"]}},
  "beginner": {{"description": "Beginner version", "modifications": ["Reduce to 3 rounds", "..."]}},
  "warmup": "5-10 min specific warmup for this WOD",
  "strategy": "Pacing and strategy notes",
  "readiness_note": "How today's fitness data affects approach",
  "estimated_time": "12-16 minutes"
}}"""

    # ── RIDE path ──────────────────────────────────────────────────────────
    elif req.day_type == "ride":
        prompt = f"""You are an expert cycling coach. Generate a structured ride workout.

Duration: {req.duration_minutes} minutes
Intensity: {req.intensity}
{f"Athlete fitness data:{chr(10)}{fitness_context}" if fitness_context else ""}
{recent_activities_text}

Generate a cycling session with clear structure. Return ONLY valid JSON:
{{
  "title": "Ride name",
  "date": "{date.today().isoformat()}",
  "source": "generated",
  "format": "Endurance / Intervals / Recovery / etc.",
  "total_duration_min": {req.duration_minutes},
  "workout": "Full ride structure",
  "warmup": {{"duration_min": 10, "description": "..."}},
  "main_set": [
    {{"name": "Block name", "duration_min": 20, "instructions": "...", "target_hr_zone": "Zone 2", "target_watts": null}}
  ],
  "cooldown": {{"duration_min": 5, "description": "..."}},
  "target_metrics": {{"hr_zone": "Zone 2", "power_watts": null, "cadence_rpm": "85-95", "rpe": "5/10"}},
  "strategy": "Key coaching notes",
  "readiness_note": "How today's data influences this session"
}}"""

    # ── REST path ──────────────────────────────────────────────────────────
    else:
        return {
            "workout": {
                "title": "Rest Day",
                "date": date.today().isoformat(),
                "source": "generated",
                "format": "Recovery",
                "workout": "Full rest or light 20-30 min walk. Focus on sleep, nutrition, and mobility.",
                "strategy": "Rest days are where adaptation happens. Prioritize 8h sleep and adequate protein.",
                "readiness_note": fitness_context or "No Garmin data available.",
            }
        }

    try:
        message = _anthropic.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text
        workout = extract_json(text)
        if workout:
            return {"workout": workout}
        return {"workout": {"title": "Generated Workout", "raw": text}}
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=500, detail="Invalid Anthropic API key.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
