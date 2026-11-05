"""
Mess waste model service.

Wraps final_model_deploy.joblib (ExtraTreesClassifier, 7 classes = 3..9 crates,
1 crate = 30 kg) in a small HTTP API. The Next.js backend on Vercel calls this
through an ngrok tunnel.

Run:  uvicorn app:app --host 127.0.0.1 --port 8000
"""
import math
import os
import secrets
from datetime import date as Date, datetime, timedelta
from pathlib import Path
from typing import List, Optional

import joblib
import numpy as np
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).parent / ".env")

API_KEY = os.getenv("MODEL_API_KEY", "")
MODEL_PATH = Path(os.getenv("MODEL_PATH", Path(__file__).parent / "model" / "final_model_deploy.joblib"))
KG_PER_CRATE = 30.0

if not API_KEY:
    raise RuntimeError(
        "MODEL_API_KEY is not set. The ngrok URL is public, so the service refuses to "
        "start without a shared secret. Put MODEL_API_KEY=... in model_service/.env"
    )

bundle = joblib.load(MODEL_PATH)
model = bundle["model"]
FEATURES: List[str] = list(bundle["features"])
CLASSES = np.array(bundle["classes"], dtype=float)  # [3..9]

# Medians from the model spec; used whenever the backend can't supply a value.
DEFAULTS = {
    "has_biryani": 0.0, "frac_through_cycle": 0.4839, "n_dishes_classified": 17.0,
    "sem_id": 1.0, "crates_rollmean7": 6.0, "has_dosa": 0.0, "temp_anomaly": 0.1,
    "doy_sin": 0.0, "days_into_regime": 42.5, "temp_mean_c": 28.2, "is_autumn_sem": 0.0,
    "n_meal_items_total": 17.0, "dow_num": 3.0, "doy_cos": 0.0,
}


def calendar_features(d: Date) -> dict:
    """Calendar features exactly as defined in MODEL_SPEC.md section 4 (IIT Madras calendar)."""
    dt = datetime(d.year, d.month, d.day)
    doy = dt.timetuple().tm_yday
    m, day = dt.month, dt.day
    if (m == 1 and day >= 16) or (2 <= m <= 4) or (m == 5 and day <= 15):
        sem_id, is_autumn, regime_start = 1, 0, datetime(dt.year, 1, 16)
    elif (m == 7 and day >= 29) or (8 <= m <= 10) or (m == 11 and day <= 22):
        sem_id, is_autumn, regime_start = 2, 1, datetime(dt.year, 7, 29)
    else:
        sem_id, is_autumn, regime_start = 0, 0, dt
    return {
        "doy_sin": math.sin(2 * math.pi * doy / 366.0),
        "doy_cos": math.cos(2 * math.pi * doy / 366.0),
        "dow_num": float(dt.weekday()),  # 0 = Monday
        "sem_id": float(sem_id),
        "is_autumn_sem": float(is_autumn),
        "days_into_regime": float(max(0, (dt - regime_start).days)),
        "frac_through_cycle": (doy % 28) / 28.0,
    }


class DayInput(BaseModel):
    date: Date  # YYYY-MM-DD
    has_biryani: bool = False          # biryani/pulao at lunch or dinner
    has_dosa: bool = False             # dosa at breakfast
    n_dishes: Optional[float] = None   # item count across breakfast + lunch + dinner
    temp_mean_c: Optional[float] = None
    temp_anomaly: Optional[float] = None       # today's mean temp minus previous-7-day mean
    crates_rollmean7: Optional[float] = None   # trailing 7-day average waste, in crates


class BatchRequest(BaseModel):
    items: List[DayInput] = Field(min_length=1, max_length=31)


def build_row(item: DayInput) -> dict:
    f = dict(DEFAULTS)
    f.update(calendar_features(item.date))
    f["has_biryani"] = 1.0 if item.has_biryani else 0.0
    f["has_dosa"] = 1.0 if item.has_dosa else 0.0
    if item.n_dishes is not None:
        f["n_dishes_classified"] = float(item.n_dishes)
        f["n_meal_items_total"] = float(item.n_dishes)
    if item.temp_mean_c is not None:
        f["temp_mean_c"] = float(item.temp_mean_c)
    if item.temp_anomaly is not None:
        f["temp_anomaly"] = float(item.temp_anomaly)
    if item.crates_rollmean7 is not None:
        f["crates_rollmean7"] = float(min(9.0, max(3.0, item.crates_rollmean7)))
    return f


def run_model(items: List[DayInput]) -> List[dict]:
    rows = [build_row(i) for i in items]
    X = np.array([[r[name] for name in FEATURES] for r in rows], dtype=float)
    proba = model.predict_proba(X)

    out = []
    for item, row, p in zip(items, rows, proba):
        full = np.zeros(len(CLASSES))
        for j, c in enumerate(model.classes_):
            full[int(c) - int(CLASSES[0])] = p[j]
        exp_crates = float(full @ CLASSES)  # expected-value decoding (spec section 5)
        std_crates = float(math.sqrt(max(0.0, full @ (CLASSES - exp_crates) ** 2)))
        kg = exp_crates * KG_PER_CRATE
        out.append({
            "date": item.date.isoformat(),
            "expected_crates": round(exp_crates, 3),
            "expected_kg": round(kg, 2),
            # ~1 std-dev band from the class distribution, kept inside the 3..9 crate range
            "range_low_kg": round(max(CLASSES[0] * KG_PER_CRATE, kg - std_crates * KG_PER_CRATE), 2),
            "range_high_kg": round(min(CLASSES[-1] * KG_PER_CRATE, kg + std_crates * KG_PER_CRATE), 2),
            "confidence": round(float(full.max()), 4),
            "class_probabilities": {str(int(c)): round(float(x), 4) for c, x in zip(CLASSES, full)},
            "features_used": {k: round(v, 4) for k, v in row.items()},
        })
    return out


def require_key(x_api_key: str = Header(default="")):
    if not secrets.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


app = FastAPI(title="Mess Waste Model Service")


@app.get("/health")
def health():
    # Intentionally unauthenticated and tiny: lets you check the tunnel in a browser.
    return {"status": "ok", "features": len(FEATURES), "classes": CLASSES.tolist()}


@app.post("/predict/batch", dependencies=[Depends(require_key)])
def predict_batch(req: BatchRequest):
    return {"predictions": run_model(req.items)}


@app.post("/predict", dependencies=[Depends(require_key)])
def predict_one(item: DayInput):
    return {"prediction": run_model([item])[0]}
