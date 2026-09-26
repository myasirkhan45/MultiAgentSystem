from langchain.tools import tool
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup
from tavily import TavilyClient
import os

load_dotenv()

tavily = TavilyClient(
    api_key=os.getenv("TAVILY_API_KEY")
)


@tool
def web_search(query: str) -> str:
    """Search the web for recent and reliable information.
    Returns source titles, URLs and snippets.
    """

    results = tavily.search(
        query=query,
        max_results=5
    )

    output = []

    for r in results.get("results", []):
        output.append(
            f"Title: {r.get('title', '')}\n"
            f"URL: {r.get('url', '')}\n"
            f"Snippet: {r.get('content', '')[:400]}"
        )

    return "\n\n--------\n\n".join(output)


@tool
def scrap_url(url: str) -> str:
    """Scrape and return clean text content from a URL."""

    try:
        response = requests.get(
            url,
            timeout=8,
            headers={
                "User-Agent": "Mozilla/5.0"
            }
        )

        response.raise_for_status()

        soup = BeautifulSoup(
            response.text,
            "html.parser"
        )

        for tag in soup([
            "script",
            "style",
            "nav",
            "footer",
            "header"
        ]):
            tag.decompose()

        text = soup.get_text(
            separator=" ",
            strip=True
        )

        return text[:3500]

    except Exception as e:
        return f"Could not scrape URL: {str(e)}"