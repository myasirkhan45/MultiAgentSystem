from langchain.agents import create_agent
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from tools import web_search,scrap_url
import os
from dotenv import load_dotenv

load_dotenv()


llm = ChatGroq(
    model="openai/gpt-oss-20b",
    temperature=0
)

def build_search_agent():

    return create_agent(
        model=llm,
        tools=[web_search],

        system_prompt=(
            "You are a research search agent.\n"
            "Your job is to search the web for reliable information.\n\n"

            "IMPORTANT:\n"
            "Whenever the user asks for research or recent information, "
            "you MUST call the web_search tool.\n"
            "Do not respond with statements such as "
            "'I need to browse' or 'Use web_search'.\n"
            "Actually call the tool."
        )
    )


def build_reader_agent():
    return create_agent(
        model=llm,
        tools=[scrap_url],
        system_prompt=(
            "You are a web reader agent. "
            "Use the scrap_url tool to extract content from a relevant URL. "
            "Return the extracted information clearly."
        )
    )

# writer chain

writer_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an expert research writer. Write clear, structured and insightful reports."),
    ("human", """Write a detailed research report on the topic below.

Topic: {topic}

Research Gathered:
{research}

Structure the report as:
- Introduction
- Key Findings (minimum 3 well-explained points)
- Conclusion
- Sources (list all URLs found in the research)

Be detailed, factual and professional."""),
])

writer_chain = writer_prompt | llm | StrOutputParser()

# critic_chain

critic_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a sharp and constructive research critic. Be honest and specific."),
    ("human", """Review the research report below and evaluate it strictly.

Report:
{report}

Respond in this exact format:

Score: X/10

Strengths:
- ...

Areas to Improve:
- ...

One line verdict:
...
"""),
])

critic_chain = critic_prompt | llm | StrOutputParser()

