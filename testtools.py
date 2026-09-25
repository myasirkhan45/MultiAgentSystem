from langchain_groq import ChatGroq
from tools import web_search

llm = ChatGroq(
    model="openai/gpt-oss-20b",
    temperature=0
)

llm_with_tool = llm.bind_tools(
    [web_search],
    tool_choice="required"
)

response = llm_with_tool.invoke(
    "Search the web for recent information about the impact of war on petrol prices in Pakistan."
)

print("\n================ RESPONSE ================\n")
print(response)

print("\n================ TOOL CALLS ================\n")
print(response.tool_calls)