# Trained waste prediction service

This FastAPI service loads `model/final_model_deploy.joblib`, the supplied
ExtraTrees classifier. It predicts whole-day waste for **M1**, in 3–9 crates
(30 kg per crate). The website distributes daily predictions across meals using
historical proportions. M2–M4 continue using the historical baseline.

## Run locally

Use Python 3.12:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# Set MODEL_API_KEY in .env to the same secret used by the website.
.venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000
```

## Deploy on Vercel

Create a separate Vercel project from this repository with **Root Directory**
`model_service`, framework **FastAPI**, and production environment variable
`MODEL_API_KEY`. Python 3.12 is selected by `.python-version`.

The website project needs:

- `MODEL_SERVICE_URL`: model project's HTTPS production URL (no path)
- `MODEL_API_KEY`: the same shared secret as the Python service
- `MODEL_MESS_CODE`: `M1`
- `MODEL_TIMEOUT_MS`: `20000` (allows for a Python cold start)

Redeploy the website after updating variables. No Supabase migration is needed.
The model service does not receive database credentials. Never commit `.env`.

## Endpoints and validation

- `GET /health`: small public health check.
- `POST /predict/batch`: `{"items":[{"date":"2025-08-01"}]}`; requires
  `X-API-Key`; accepts 1–31 days.
- `POST /predict`: one day, same authentication.

The authenticated website endpoint `/api/predict/model-status` probes the model.
`/api/predict/forecast` returns `model.status`, `modelDays` and each day's
`source`; the dashboard explicitly shows ML activity or baseline fallback.
The website keeps working if the model service is unavailable.

## Tests

From the repository root, install `httpx` into the model environment and run:

```sh
python -m unittest discover -s model_service/tests -v
```

These tests load the actual trained model, verify predicted units and probability
mass, and check missing/wrong API keys and invalid requests.
