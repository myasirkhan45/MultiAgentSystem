from agents import (
    build_reader_agent,
    build_search_agent,
    critic_chain,
    writer_chain
)

from tavily import TavilyClient
from dotenv import load_dotenv

import os
import time


load_dotenv()


# ==========================================
# TAVILY CLIENT
# ==========================================

tavily = TavilyClient(
    api_key=os.getenv("TAVILY_API_KEY")
)

# Small pause between agent calls so we don't slam Groq's per-minute
# rate limit with back-to-back requests. Cheap insurance against 429s.
STAGE_DELAY_SECONDS = 2


# ==========================================
# MAIN RESEARCH WORKFLOW
# ==========================================

def run_search_agent(topic: str) -> dict:

    state = {}

    print("\n" + "=" * 60)
    print("        MULTI-AGENT RESEARCH SYSTEM")
    print("=" * 60)

    print(f"\n[INFO] Research Topic: {topic}")
    print("[INFO] Starting research workflow...\n")


    # ==========================================
    # STEP 1 — SEARCH AGENT
    # ==========================================

    print("-" * 60)
    print("[STEP 1] SEARCH AGENT STARTED")
    print("-" * 60)

    search_agent = build_search_agent()

    print("[INFO] Searching the web...\n")

    try:
        search_result = search_agent.invoke({
            "messages": [
                {
                    "role": "user",
                    "content": (
                        f"Research this topic: {topic}\n\n"
                        "Use the web_search tool now.\n"
                        "Return only the most important findings "
                        "and source URLs.\n"
                        "Keep the response concise."
                    )
                }
            ]
        })
        state["search_results"] = search_result["messages"][-1].content[:1600]
        print("\n[OK] Search agent completed.")

    except Exception as e:
        print(f"\n[ERROR] Search agent failed: {e}")
        state["search_results"] = "Search step failed — continuing with limited data."

    print("\n[SEARCH RESULTS]")
    print("-" * 60)
    print(state["search_results"])
    print("-" * 60)

    time.sleep(STAGE_DELAY_SECONDS)


    # ==========================================
    # STEP 1.5 — STRUCTURED SOURCES
    # ==========================================

    print("\n[INFO] Collecting structured sources...")

    try:
        tavily_results = tavily.search(
            query=topic,
            max_results=5
        )

        state["sources"] = [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("content", "")[:200]
            }
            for r in tavily_results.get("results", [])
        ]

    except Exception as e:
        print(f"[ERROR] Tavily source lookup failed: {e}")
        state["sources"] = []

    print("\n[SOURCES FOUND]")

    for source in state["sources"]:
        print(f"- {source['title']}")
        print(f"  {source['url']}")

    time.sleep(STAGE_DELAY_SECONDS)


    # ==========================================
    # STEP 2 — READER AGENT
    # ==========================================

    print("\n" + "-" * 60)
    print("[STEP 2] READER AGENT STARTED")
    print("-" * 60)

    reader_agent = build_reader_agent()

    source_text = "\n\n".join(
        [
            f"Title: {source['title']}\n"
            f"URL: {source['url']}\n"
            f"Snippet: {source['snippet']}"
            for source in state["sources"]
        ]
    ) if state["sources"] else "No structured sources were found."

    print("[INFO] Sending sources to reader...")
    print("[INFO] Reader will inspect 2 relevant sources.\n")

    try:
        reader_result = reader_agent.invoke({
            "messages": [
                {
                    "role": "user",
                    "content": (
                        f"Research topic:\n{topic}\n\n"

                        f"Available sources:\n\n"
                        f"{source_text}\n\n"

                        "Select the 2 most relevant sources.\n"
                        "Use scrap_url on both.\n"
                        "Extract only important factual information.\n"
                        "Focus on facts, statistics, dates and examples.\n"
                        "Keep your final response concise."
                    )
                }
            ]
        })
        state["scraped_content"] = reader_result["messages"][-1].content[:4500]
        print("\n[OK] Reader agent completed.")

    except Exception as e:
        print(f"\n[ERROR] Reader agent failed: {e}")
        state["scraped_content"] = "Reader step failed — continuing with search findings only."

    print("\n[READER FINDINGS]")
    print("-" * 60)
    print(state["scraped_content"])
    print("-" * 60)

    time.sleep(STAGE_DELAY_SECONDS)


    # ==========================================
    # STEP 3 — WRITER
    # ==========================================

    print("\n" + "-" * 60)
    print("[STEP 3] WRITER CHAIN STARTED")
    print("-" * 60)

    compact_sources = "\n".join(
        [
            f"{source['title']} - {source['url']}"
            for source in state["sources"]
        ]
    ) if state["sources"] else "No sources available."

    research_combined = (
        f"SEARCH FINDINGS:\n"
        f"{state['search_results']}\n\n"

        f"READER FINDINGS:\n"
        f"{state['scraped_content']}\n\n"

        f"SOURCES:\n"
        f"{compact_sources}"
    )

    print("[INFO] Generating research report...\n")

    try:
        writer_response = writer_chain.invoke({
            "topic": topic,
            "research": research_combined
        })
        state["report"] = writer_response.content

        # Detect truncation: if Groq cut the response off because it hit
        # max_tokens, response_metadata will say finish_reason == "length".
        finish_reason = getattr(writer_response, "response_metadata", {}).get("finish_reason")
        if finish_reason == "length":
            print("[WARNING] Report was truncated — it hit the max_tokens limit. "
                  "Consider raising writer_llm's max_tokens further.")

        print("\n[OK] Writer completed.")

    except Exception as e:
        print(f"\n[ERROR] Writer chain failed: {e}")
        state["report"] = "Report generation failed due to an API error. Please try again."

    print("\n[FINAL REPORT]")
    print("-" * 60)
    print(state["report"])
    print("-" * 60)

    time.sleep(STAGE_DELAY_SECONDS)


    # ==========================================
    # STEP 4 — CRITIC
    # ==========================================

    print("\n" + "-" * 60)
    print("[STEP 4] CRITIC CHAIN STARTED")
    print("-" * 60)

    print("[INFO] Reviewing report...\n")

    try:
        critic_response = critic_chain.invoke({
            "report": state["report"]
        })
        state["feedback"] = critic_response.content
        print("\n[OK] Critic completed.")

    except Exception as e:
        print(f"\n[ERROR] Critic chain failed: {e}")
        state["feedback"] = "Critic review failed due to an API error."

    print("\n[CRITIC FEEDBACK]")
    print("-" * 60)
    print(state["feedback"])
    print("-" * 60)


    # ==========================================
    # COMPLETE
    # ==========================================

    print("\n" + "=" * 60)
    print("        RESEARCH WORKFLOW COMPLETED")
    print("=" * 60)

    return {
        "topic": topic,
        **state
    }


# ==========================================
# TEST
# ==========================================

if __name__ == "__main__":

    print("\n" + "=" * 60)
    print("        AI RESEARCH ASSISTANT")
    print("=" * 60)

    topic = input("\nEnter a research topic: ")

    run_search_agent(topic)

    print("\n[INFO] Application finished.")