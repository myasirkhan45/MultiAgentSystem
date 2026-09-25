
from agents import (
    build_reader_agent,
    build_search_agent,
    critic_chain,
    writer_chain
)


def run_search_agent(topic: str) -> dict:

    # ==========================================
    # INITIALIZE STATE
    # ==========================================

    state = {}

    print("\n" + "=" * 60)
    print("        MULTI-AGENT RESEARCH SYSTEM")
    print("=" * 60)

    print(f"\n[INFO] Research Topic: {topic}")
    print("[INFO] Starting research workflow...\n")


    # ==========================================
    # STEP 1: SEARCH AGENT
    # ==========================================

    print("\n" + "-" * 60)
    print("[STEP 1] SEARCH AGENT STARTED")
    print("-" * 60)

    print("[INFO] Initializing search agent...")

    search_agent = build_search_agent()

    print("[INFO] Sending research query to search agent...")
    print("[INFO] Searching for recent and reliable information...\n")

    search_result = search_agent.invoke({
    "messages": [
        {
            "role": "user",
            "content": (
                f"Research this topic: {topic}\n\n"
                "You must use the web_search tool now. "
                "Do not answer without calling the tool."
            )
        }
    ]
})

    state["search_results"] = (
        search_result["messages"][-1].content
    )

    print("\n[OK] Search agent completed.")

    print("\n[SEARCH RESULTS]")
    print("-" * 60)
    print(state["search_results"])
    print("-" * 60)

    print("\n[STEP 1] SEARCH AGENT FINISHED\n")


    # ==========================================
    # STEP 2: READER AGENT
    # ==========================================

    print("\n" + "-" * 60)
    print("[STEP 2] READER AGENT STARTED")
    print("-" * 60)

    print("[INFO] Initializing reader agent...")
    reader_agent = build_reader_agent()

    print("[INFO] Sending search results to reader agent...")
    print("[INFO] Selecting relevant URL and scraping content...\n")

    reader_result = reader_agent.invoke({
    "messages": [
        {
            "role": "user",
            "content": (
                f"Read the following search results about: {topic}\n\n"
                f"Search Results:\n"
                f"{state['search_results'][:8000]}\n\n"
                "Select a relevant URL and use the scrap_url tool "
                "to extract deeper information."
            )
        }
    ]
})

    state["scraped_content"] = (
        reader_result["messages"][-1].content
    )

    print("\n[OK] Reader agent completed.")

    print("\n[SCRAPED CONTENT]")
    print("-" * 60)
    print(state["scraped_content"])
    print("-" * 60)

    print("\n[STEP 2] READER AGENT FINISHED\n")


    # ==========================================
    # STEP 3: WRITER CHAIN
    # ==========================================

    print("\n" + "-" * 60)
    print("[STEP 3] WRITER CHAIN STARTED")
    print("-" * 60)

    print("[INFO] Combining search results and scraped content...")

    research_combined = (
        f"Search results:\n"
        f"{state['search_results']}\n\n"
        f"Detailed results:\n"
        f"{state['scraped_content']}\n\n"
    )

    print("[INFO] Sending combined research to writer chain...")
    print("[INFO] Generating research report...\n")

    state["report"] = writer_chain.invoke({
        "topic": topic,
        "research": research_combined
    })

    print("\n[OK] Writer chain completed.")

    print("\n[FINAL REPORT]")
    print("-" * 60)
    print(state["report"])
    print("-" * 60)

    print("\n[STEP 3] WRITER CHAIN FINISHED\n")


    # ==========================================
    # STEP 4: CRITIC CHAIN
    # ==========================================

    print("\n" + "-" * 60)
    print("[STEP 4] CRITIC CHAIN STARTED")
    print("-" * 60)

    print("[INFO] Sending generated report to critic...")
    print("[INFO] Reviewing report quality...\n")

    state["feedback"] = critic_chain.invoke({
        "report": state["report"]
    })

    print("\n[OK] Critic chain completed.")

    print("\n[CRITIC FEEDBACK]")
    print("-" * 60)
    print(state["feedback"])
    print("-" * 60)

    print("\n[STEP 4] CRITIC CHAIN FINISHED\n")


    # ==========================================
    # WORKFLOW COMPLETED
    # ==========================================

    print("\n" + "=" * 60)
    print("        RESEARCH WORKFLOW COMPLETED")
    print("=" * 60)

    print("\n[OK] All steps executed successfully.")
    print("[INFO] Returning research state...\n")

    return state


# ==========================================
# PROGRAM ENTRY POINT
# ==========================================

if __name__ == "__main__":

    print("\n" + "=" * 60)
    print("        AI RESEARCH ASSISTANT")
    print("=" * 60)

    topic = input("\nEnter a research topic: ")

    print("\n[INFO] Starting application...\n")

    run_search_agent(topic)

    print("\n[INFO] Application finished.")