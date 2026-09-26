from langchain.agents import create_agent
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate

from tools import web_search, scrap_url
from dotenv import load_dotenv


load_dotenv()


# ==========================================
# LLMs
# ==========================================
# IMPORTANT: openai/gpt-oss-20b is a REASONING model — before it writes its
# final answer, it "thinks" internally, and that thinking consumes tokens
# from the SAME max_tokens budget as the answer itself. If reasoning eats
# the whole budget, the model never gets to write the final answer and
# `response.content` comes back as an EMPTY STRING (no error is raised).
# This is exactly what was causing "report content not showing" and the
# critic scoring it 0/10 (it was genuinely reviewing an empty report).
#
# Two settings fix this:
#   - reasoning_effort="low"   -> model spends far fewer tokens "thinking"
#   - reasoning_format="parsed" -> reasoning is returned separately in
#     additional_kwargs.reasoning_content, so `content` only ever holds
#     the clean final answer (no stray <think>...</think> text mixed in)
#
# max_retries adds automatic exponential-backoff retries whenever Groq
# returns a 429 (rate limit) or a transient 5xx error, instead of the
# whole pipeline crashing on the first hiccup.

llm = ChatGroq(
    model="openai/gpt-oss-20b",
    temperature=0,
    max_tokens=1200,
    reasoning_effort="low",
    reasoning_format="parsed",
    max_retries=3,
    timeout=60,
)

writer_llm = ChatGroq(
    model="openai/gpt-oss-20b",
    temperature=0,
    max_tokens=3000,          # extra headroom: reasoning + full 500-650 word report
    reasoning_effort="low",   # keep reasoning short so most tokens go to the actual report
    reasoning_format="parsed",
    max_retries=3,
    timeout=90,
)


# ==========================================
# SEARCH AGENT
# ==========================================

def build_search_agent():

    return create_agent(
        model=llm,
        tools=[web_search],
        system_prompt=(
            "You are a research search agent.\n\n"

            "Find reliable and recent information about "
            "the user's research topic.\n\n"

            "Rules:\n"
            "- ALWAYS use the web_search tool.\n"
            "- Prefer reliable sources.\n"
            "- Focus only on important findings.\n"
            "- Preserve source titles and URLs.\n"
            "- Do not invent facts or sources.\n"
            "- Keep the response concise.\n\n"

            "Return key findings and source information only."
        )
    )


# ==========================================
# READER AGENT
# ==========================================

def build_reader_agent():

    return create_agent(
        model=llm,
        tools=[scrap_url],
        system_prompt=(
            "You are a web research reader agent.\n\n"

            "Read the most relevant sources provided "
            "by the search stage.\n\n"

            "Rules:\n"
            "- Select only 2 relevant sources.\n"
            "- Use scrap_url on both sources.\n"
            "- Extract factual information only.\n"
            "- Focus on statistics, dates and evidence.\n"
            "- Preserve source URLs.\n"
            "- Do not invent information.\n"
            "- Do not make unsupported conclusions.\n"
            "- Keep the response concise.\n\n"

            "Return useful research findings for the writer."
        )
    )


# ==========================================
# WRITER PROMPT
# ==========================================

writer_prompt = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are an expert research report writer.

Write a factual and concise research report using ONLY
the research provided.

STRICT RULES:

- Do not invent facts.
- Do not invent statistics.
- Do not invent dates.
- Do not invent studies or organizations.
- Do not invent URLs.
- Do not use outside knowledge.
- Do not make unsupported claims.
- Preserve source attribution.
- Avoid repetition.
- Complete every section."""
    ),

    (
        "human",
        """Write a short research report on:

TOPIC:
{topic}

RESEARCH:
{research}

Use this structure:

# Introduction

# Key Findings
Give 3-4 important findings.

# Detailed Analysis
Explain the main trends and evidence briefly.

# Practical Implications
Explain what the findings mean in practical terms.

# Limitations
Mention important limitations or uncertainty.

# Conclusion
Summarize the main findings.

# Sources
List only the URLs provided in the research.

IMPORTANT:

- Keep the complete report around 500-650 words.
- Keep every section concise.
- Use only information from the provided research.
- Do not create citations.
- Do not create statistics.
- Do not stop in the middle of a sentence.
- Complete the entire report."""
    )
])


# ==========================================
# WRITER CHAIN (uses writer_llm — higher max_tokens)
# ==========================================

writer_chain = writer_prompt | writer_llm


# ==========================================
# CRITIC PROMPT
# ==========================================

critic_prompt = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are a concise research quality critic.

Review the report for accuracy, evidence quality,
structure and completeness.

Do not rewrite the report.
Do not introduce new facts."""
    ),

    (
        "human",
        """Review this research report:

REPORT:
{report}

Check:

1. Accuracy
2. Evidence quality
3. Structure
4. Completeness
5. Clarity

Pay special attention to:
- unsupported statistics
- invented sources
- unsupported claims
- missing evidence
- incomplete sections

Respond in this format:

Score: X/10

Strengths:
- ...
- ...

Areas to Improve:
- ...
- ...

One line verdict:
..."""
    )
])


# ==========================================
# CRITIC CHAIN
# ==========================================

critic_chain = critic_prompt | llm