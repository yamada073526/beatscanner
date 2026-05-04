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
        temperature: float = 0.0,
        system: str | None = None,
        prefill: str | None = None,
    ) -> str:
        """prefill を指定すると assistant の出力を強制的にその文字列で開始させる。
        例: prefill="{" を渡すと、Claude の出力は必ず `{` から続く（戻り値には prefill 自身が prepend される）。
        JSON-only 出力を確実にしたい場合に有効。"""
        messages: list[dict] = [{"role": "user", "content": prompt}]
        if prefill:
            messages.append({"role": "assistant", "content": prefill})
        kwargs: dict = dict(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages,
        )
        if system:
            kwargs["system"] = system
        msg = await self.client.messages.create(**kwargs)
        body = "".join(b.text for b in msg.content if b.type == "text")
        if prefill:
            return (prefill + body).strip()
        return body.strip()

    async def stream_complete(
        self,
        prompt: str,
        *,
        model: str = "claude-haiku-4-5-20251001",
        max_tokens: int = 1024,
        temperature: float = 0.0,
        system: str | None = None,
    ):
        """Yield text chunks as they arrive from Claude."""
        kwargs: dict = dict(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[{"role": "user", "content": prompt}],
        )
        if system:
            kwargs["system"] = system
        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text
