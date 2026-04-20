"""Anthropic Claude API client for earnings summaries."""
from __future__ import annotations

import os

from anthropic import AsyncAnthropic


class ClaudeError(Exception):
    pass


class ClaudeClient:
    def __init__(self, api_key: str | None = None):
        key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not key:
            raise ClaudeError("ANTHROPIC_API_KEY is not set")
        self.client = AsyncAnthropic(api_key=key)

    async def complete(
        self,
        prompt: str,
        *,
        model: str = "claude-haiku-4-5-20251001",
        max_tokens: int = 1024,
    ) -> str:
        msg = await self.client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(b.text for b in msg.content if b.type == "text").strip()

    async def stream_complete(
        self,
        prompt: str,
        *,
        model: str = "claude-haiku-4-5-20251001",
        max_tokens: int = 1024,
    ):
        """Yield text chunks as they arrive from Claude."""
        async with self.client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for text in stream.text_stream:
                yield text
