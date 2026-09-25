from langchain.tools import tool
from dotenv import load_dotenv
from tavily import TavilyClient
from bs4 import BeautifulSoup

import requests
import os


# Load environment variables
load_dotenv()


# Get API key
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

if not TAVILY_API_KEY:
    raise ValueError(
        "TAVILY_API_KEY is missing. "
        "Please add it to your .env file."
    )


# Initialize Tavily client
tavily = TavilyClient(
    api_key=TAVILY_API_KEY
)


# --------------------------------------------------
# WEB SEARCH TOOL
# --------------------------------------------------

@tool
def web_search(query: str) -> str:
    """
    Search the web for recent and reliable information.

    Returns titles, URLs, and short snippets
    from the search results.
    """

    try:
        results = tavily.search(
            query=query,
            max_results=5,
            search_depth="advanced"
        )

        search_results = results.get("results", [])

        if not search_results:
            return "No search results found."

        output = []

        for result in search_results:
            title = result.get("title", "No title")
            url = result.get("url", "No URL")
            content = result.get("content", "")

            output.append(
                f"Title: {title}\n"
                f"URL: {url}\n"
                f"Snippet: {content[:500]}\n"
            )

        return "\n--------\n".join(output)

    except Exception as e:
        return f"Web search failed: {str(e)}"


# --------------------------------------------------
# URL SCRAPING TOOL
# --------------------------------------------------

@tool
def scrap_url(url: str) -> str:
    """
    Scrape a webpage and return its clean text content
    for deeper research.
    """

    try:
        response = requests.get(
            url,
            timeout=10,
            headers={
                "User-Agent": "Mozilla/5.0"
            }
        )

        # Raise an exception for HTTP errors
        response.raise_for_status()

        soup = BeautifulSoup(
            response.text,
            "html.parser"
        )

        # Remove unnecessary HTML elements
        for tag in soup([
            "script",
            "style",
            "nav",
            "footer",
            "header",
            "aside"
        ]):
            tag.decompose()

        # Extract clean text
        clean_text = soup.get_text(
            separator=" ",
            strip=True
        )

        if not clean_text:
            return "No readable text found on this webpage."

        # Limit output length
        return clean_text[:5000]

    except requests.exceptions.RequestException as e:
        return f"Could not scrape URL: {str(e)}"

    except Exception as e:
        return f"Unexpected scraping error: {str(e)}"