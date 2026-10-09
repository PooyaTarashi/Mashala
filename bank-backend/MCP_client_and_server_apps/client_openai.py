from mcp import ClientSession, StdioServerParameters
from contextlib import AsyncExitStack
from mcp.client.stdio import stdio_client
from typing import Optional, Any
import json
from openai import AsyncOpenAI

class BankAIClient:
    def __init__(self, model: str = "gpt-4o"):
        self.session: Optional[ClientSession] = None
        self.model = model
        self.exit_stack = AsyncExitStack()
        self.stdio: Optional[Any] = None
        self.write: Optional[Any] = None
        self.tools = []
        self.openai_client = AsyncOpenAI(api_key="",
                                          base_url="https://openrouter.ai/api/v1")

    async def connect_to_server(self, server_path: str = "server.py"):
        server_params = StdioServerParameters(
            command="python",
            args=[server_path],
        )

        stdio_transport = await self.exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        self.stdio, self.write = stdio_transport
        self.session = await self.exit_stack.enter_async_context(
            ClientSession(self.stdio, self.write)
        )

        await self.session.initialize()

        tools_result = await self.session.list_tools()
        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.inputSchema,
                },
            }
            for tool in tools_result.tools
        ]

        print(f"Connected to server with tools: {[tool['function']['name'] for tool in self.tools]}")

    async def process_prompt(self, prompt: str) -> str:
        response = await self.openai_client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "user", "content": prompt}
            ],
            tools=self.tools,
            tool_choice="auto",
        )

        assistant_message = response.choices[0].message

        messages = [
            {"role": "user", "content": prompt},
            assistant_message
        ]

        if assistant_message.tool_calls:
            for tool_call in assistant_message.tool_calls:
                tool_response = await self.session.call_tool(
                    tool_call.function.name,
                    arguments=json.loads(tool_call.function.arguments),
                )

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": tool_response.content[0].text,
                })

            final_response = await self.openai_client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=self.tools,
                tool_choice="none",
            )

            return final_response.choices[0].message.content
        
        return assistant_message.content
        

async def main():
    client = BankAIClient()
    await client.connect_to_server()

    prompt = ""
    while True:
        prompt = input("Enter your prompt (or 'exit' to quit): ")
        if prompt.lower() == 'exit':
            break

        response = await client.process_prompt(prompt)
        print(f"Response: {response}")


    await client.exit_stack.aclose()

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())