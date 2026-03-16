# InterAI — AI-Powered Mock Interview Platform

InterAI is a real-time AI mock interview agent powered by **Google's Gemini Live API**. It conducts natural, voice-and-video interviews tailored to a candidate's job description and resume, evaluates technical and soft skills in real-time, and generates structured performance reports.

**Category:** Live Agents

## The Problem

Preparing for interviews is stressful and inefficient. Candidates lack access to realistic, personalized mock interviews that adapt in real-time. Traditional prep tools are static — they can't see you, hear your tone, or respond to your body language.

## The Solution

InterAI creates a live AI interviewer ("Wayne") that:
- **Sees** your video feed and analyzes body language and confidence in real-time
- **Hears** your spoken answers with natural turn-taking and barge-in support
- **Speaks** back with a natural voice, asking follow-up questions adapted to your responses
- **Evaluates** you against the actual job description and your resume
- **Generates** a structured scorecard report with actionable feedback

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                            │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Media    │  │ WebSocket│  │ Voice     │  │ Audio        │  │
│  │ Capture  │  │ Client   │  │ Activity  │  │ Player       │  │
│  │ (A/V)    │  │          │  │ Detection │  │ (PCM)        │  │
│  └────┬─────┘  └────┬─────┘  └───────────┘  └──────────────┘  │
│       │              │                                          │
│       │   Audio/Video│frames + JSON control messages            │
└───────┼──────────────┼──────────────────────────────────────────┘
        │              │
        │   WebSocket  │  REST API
        │   (wss://)   │  (https://)
        ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  FastAPI Backend (Cloud Run)                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Routers                                                   │  │
│  │  /api/parse-jd ── JD + Resume parsing (parallel)         │  │
│  │  /ws/interview ── Live interview WebSocket                │  │
│  │  /api/report ──── Report generation                       │  │
│  │  /api/profile ─── Candidate profiles                      │  │
│  │  /api/history ─── Interview history                       │  │
│  │  /api/analytics ─ Performance analytics                   │  │
│  │  /api/questions ─ Question preview                        │  │
│  │  /api/share ───── Report sharing                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Services                                                  │  │
│  │                                                           │  │
│  │  GeminiLiveSession ─── Real-time audio/video streaming    │  │
│  │    ├── Bidirectional WebSocket to Gemini Live API         │  │
│  │    ├── Silence watchdog (auto turn-complete)              │  │
│  │    ├── Input/output audio transcription                   │  │
│  │    └── Summary accumulation for report                    │  │
│  │                                                           │  │
│  │  JD Service ──────── Structured job description parsing   │  │
│  │  Resume Service ──── Resume extraction & analysis         │  │
│  │  Prompt Builder ──── 3-state interviewer persona builder  │  │
│  │  Report Service ──── Gemini Chat → scored report → GCS   │  │
│  │  Confidence Service ─ Real-time confidence analysis       │  │
│  │  Skill Gap Service ── Skill gap identification            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────┐  ┌─────────────────┐  ┌────────────────────┐ │
│  │ SQLite DB   │  │ Local /reports/  │  │ LangChain +        │ │
│  │ (profiles,  │  │ (fallback)       │  │ langchain-google-  │ │
│  │  history)   │  │                  │  │ genai              │ │
│  └─────────────┘  └────────┬────────┘  └────────────────────┘ │
└────────────────────────────┼────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────────┐
              │              │                  │
              ▼              ▼                  ▼
   ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐
   │ Gemini Live  │  │ Gemini Chat │  │ Google Cloud      │
   │ API          │  │ API         │  │ Storage (GCS)     │
   │              │  │             │  │                   │
   │ Model:       │  │ Model:      │  │ Bucket:           │
   │ gemini-2.5-  │  │ gemini-3-   │  │ interai-reports   │
   │ flash-native │  │ flash-      │  │                   │
   │ -audio-      │  │ preview     │  │ Stores interview  │
   │ preview      │  │             │  │ reports as JSON   │
   │              │  │ Structured  │  │                   │
   │ Real-time    │  │ report      │  │                   │
   │ audio/video  │  │ generation  │  │                   │
   │ streaming    │  │             │  │                   │
   └──────────────┘  └─────────────┘  └──────────────────┘
```

### Data Flow

1. **Setup:** User uploads JD + resume → `POST /api/parse-jd` → parallel JD/resume extraction via Gemini → system prompt built with "Wayne" interviewer persona
2. **Interview:** WebSocket `/ws/interview` → `GeminiLiveSession` created → bidirectional audio/video streaming between browser and Gemini Live API with real-time transcription
3. **Report:** Interview ends → `POST /api/report` → Gemini Chat structures the accumulated summary into a scored report → saved to GCS (or local fallback)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python 3.12), Uvicorn, WebSockets |
| AI/LLM | Google GenAI SDK (`google-genai`), Gemini Live API, Gemini Chat API |
| Structured Output | LangChain + `langchain-google-genai` |
| Frontend | Vanilla HTML/CSS/JS (single-page app) |
| Database | SQLite with SQLAlchemy async ORM |
| Storage | Google Cloud Storage (`google-cloud-storage`) with local fallback |
| Config | Pydantic Settings + `.env` |

## Google Cloud Services Used

- **Gemini Live API** — Real-time bidirectional audio/video streaming for the interview
- **Gemini Chat API** — Structured JD/resume parsing and report generation
- **Google Cloud Storage** — Persistent storage for interview reports
- **Google Cloud Run** — Container hosting for the backend

## Prerequisites

- Python 3.12+
- A [Google Cloud account](https://cloud.google.com/free) with billing enabled
- A **Gemini API key** (from [Google AI Studio](https://aistudio.google.com/apikey))
- (Optional) A GCS bucket for report storage
- (Optional) [Google Cloud CLI (`gcloud`)](https://cloud.google.com/sdk/docs/install) for Cloud Run deployment

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/interai.git
cd interai
```

### 2. Create a virtual environment

```bash
python3.12 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

Create a `.env` file in the project root:

```env
GOOGLE_API_KEY=your-gemini-api-key

# Optional: Google Cloud Storage for reports
GCS_ENABLED=false
GCS_BUCKET_NAME=interai-reports
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Optional: Model overrides
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
GEMINI_CHAT_MODEL=gemini-3-flash-preview
```

### 5. Run the development server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

## Docker

### Build and run locally

```bash
docker build -t interai .
docker run -p 8080:8080 \
  -e GOOGLE_API_KEY=your-gemini-api-key \
  -e GCS_ENABLED=false \
  interai
```

## Deploy to Google Cloud Run

### Automated Deployment (Recommended)

A single script handles everything — enables APIs, creates the GCS bucket, builds the container, and deploys to Cloud Run:

```bash
gcloud auth login
./deploy.sh
```

You can customize the deployment via environment variables:

```bash
GCP_PROJECT_ID=my-project GCP_REGION=us-east1 ./deploy.sh
```

| Variable | Default | Description |
|----------|---------|-------------|
| `GCP_PROJECT_ID` | `geminiliveagentchallenge` | Google Cloud project ID |
| `GCP_REGION` | `us-central1` | Cloud Run region |
| `CLOUD_RUN_SERVICE` | `interai` | Cloud Run service name |
| `CLOUD_RUN_MEMORY` | `512Mi` | Memory allocation |
| `CLOUD_RUN_TIMEOUT` | `300` | Request timeout (seconds) |
| `GCS_BUCKET_NAME` | `interai-reports` | GCS bucket for reports |

### Manual Deployment

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com

# Build container
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/interai

# Deploy
gcloud run deploy interai \
  --image gcr.io/YOUR_PROJECT_ID/interai \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_API_KEY=your-gemini-api-key,GCS_ENABLED=true,GCS_BUCKET_NAME=interai-reports" \
  --memory 512Mi \
  --timeout 300

# (Optional) Create GCS bucket
gsutil mb -l us-central1 gs://interai-reports
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_API_KEY` | Yes | — | Gemini API key |
| `GCS_ENABLED` | No | `false` | Enable Google Cloud Storage for reports |
| `GCS_BUCKET_NAME` | No | `interai-reports` | GCS bucket name |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | — | Path to GCS service account JSON |
| `GEMINI_LIVE_MODEL` | No | `gemini-2.5-flash-native-audio-preview-12-2025` | Gemini Live API model |
| `GEMINI_CHAT_MODEL` | No | `gemini-3-flash-preview` | Gemini Chat API model |
| `DATABASE_URL` | No | `sqlite+aiosqlite:///./interai.db` | Database connection string |
| `RATE_LIMIT_PER_MINUTE` | No | `30` | API rate limit |
| `DEFAULT_INTERVIEW_DURATION` | No | `30` | Interview duration in minutes |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/parse-jd` | Parse job description + resume, build system prompt |
| `POST` | `/api/report` | Generate structured interview report |
| `POST` | `/api/extract-text` | Extract text from uploaded files (PDF, TXT) |
| `WS` | `/ws/interview` | Live interview WebSocket (audio/video/text) |
| `GET/POST` | `/api/profile` | Candidate profile management |
| `GET` | `/api/history` | Interview history |
| `GET` | `/api/analytics` | Performance analytics |
| `GET` | `/api/questions` | Question preview |
| `POST` | `/api/share` | Generate shareable report links |

## Project Structure

```
interai/
├── app/
│   ├── main.py                 # FastAPI app, startup checks, static serving
│   ├── config.py               # Pydantic settings from .env
│   ├── database.py             # SQLAlchemy async setup
│   ├── models/
│   │   ├── schemas.py          # Pydantic request/response models
│   │   └── db_models.py        # SQLAlchemy ORM models
│   ├── routers/
│   │   ├── interview.py        # WebSocket interview handler
│   │   ├── jd_parser.py        # JD + resume parsing
│   │   ├── report.py           # Report generation
│   │   ├── profile.py          # Candidate profiles
│   │   ├── history.py          # Interview history
│   │   ├── analytics.py        # Analytics dashboard
│   │   ├── questions.py        # Question preview
│   │   └── share.py            # Report sharing
│   └── services/
│       ├── gemini_live.py      # Gemini Live API session management
│       ├── llm.py              # Centralized LLM initialization
│       ├── jd_service.py       # Job description extraction
│       ├── resume_service.py   # Resume parsing
│       ├── prompt_builder.py   # Interviewer persona prompt builder
│       ├── report_service.py   # Report generation + GCS storage
│       ├── confidence_service.py # Real-time confidence analysis
│       ├── question_service.py # Question generation
│       └── skill_gap_service.py # Skill gap identification
├── static/
│   ├── index.html              # Single-page app entry point
│   ├── css/
│   └── js/                     # Modular frontend (21 JS files)
├── Dockerfile
├── requirements.txt
└── .env                        # Environment variables (not committed)
```

## Third-Party Libraries

- [FastAPI](https://fastapi.tiangolo.com/) — Web framework (MIT)
- [Google GenAI SDK](https://pypi.org/project/google-genai/) — Gemini API client
- [LangChain](https://python.langchain.com/) + [langchain-google-genai](https://pypi.org/project/langchain-google-genai/) — Structured LLM output
- [google-cloud-storage](https://pypi.org/project/google-cloud-storage/) — GCS client
- [SQLAlchemy](https://www.sqlalchemy.org/) — Async ORM
- [PyPDF2](https://pypi.org/project/PyPDF2/) — PDF text extraction
- [SlowAPI](https://pypi.org/project/slowapi/) — Rate limiting

## License

This project was created for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) hackathon.
