from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pipeline import run_search_agent


app = FastAPI(
    title="Multi-Agent Research System",
    description="AI-powered multi-agent research API",
    version="1.0.0"
)


# =========================
# CORS
# =========================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# Request Schema
# =========================

class ResearchRequest(BaseModel):
    topic: str


# =========================
# Home
# =========================

@app.get("/")
async def root():
    return {
        "message": "Multi-Agent Research API is running"
    }


# =========================
# Research Endpoint
# =========================

@app.post("/research")
async def research(request: ResearchRequest):

    if not request.topic.strip():
        raise HTTPException(
            status_code=400,
            detail="Research topic cannot be empty."
        )

    try:

        result = run_search_agent(request.topic)

        return result

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Research failed: {str(e)}"
        )