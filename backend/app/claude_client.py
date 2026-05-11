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

    @staticmethod
    def _system_param(system: str | None, system_cache: bool):
        """system を Anthropic API の system param 形式に変換する.
        system_cache=True なら structured array + ephemeral cache_control を付与し、
        prompt caching を有効化する (Haiku 4.5 で 5 分 TTL、最低 2048 token 必要).
        """
        if not system:
            return None
        if system_cache:
            return [{
                "type": "text",
                "text": system,
                "cache_control": {"type": "ephemeral"},
            }]
        return system

    async def complete(
        self,
        prompt: str,
        *,
        model: str = "claude-haiku-4-5-20251001",
        max_tokens: int = 1024,
        temperature: float = 0.0,
        system: str | None = None,
        system_cache: bool = False,
        prefill: str | None = None,
    ) -> str:
        """prefill を指定すると assistant の出力を強制的にその文字列で開始させる。
        例: prefill="{" を渡すと、Claude の出力は必ず `{` から続く（戻り値には prefill 自身が prepend される）。
        JSON-only 出力を確実にしたい場合に有効。

        system_cache=True で system prompt を ephemeral cache 化する.
        """
        messages: list[dict] = [{"role": "user", "content": prompt}]
        if prefill:
            messages.append({"role": "assistant", "content": prefill})
        kwargs: dict = dict(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages,
        )
        sys_param = self._system_param(system, system_cache)
        if sys_param is not None:
            kwargs["system"] = sys_param
        msg = await self.client.messages.create(**kwargs)
        body = "".join(b.text for b in msg.content if b.type == "text")
        if prefill:
            return (prefill + body).strip()
        return body.strip()

    async def stream_complete(
        self,
        prompt: str | None = None,
        *,
        user_content: list | None = None,
        model: str = "claude-haiku-4-5-20251001",
        max_tokens: int = 1024,
        temperature: float = 0.0,
        system: str | None = None,
        system_cache: bool = False,
    ):
        """Yield text chunks as they arrive from Claude.
        - prompt: str を渡すと従来の単一テキスト user message として送信
        - user_content: list[dict] を渡すと structured content blocks (cache_control 可)
          として送信。記事翻訳のように rules + 本文を user 側で cache 化したい場合に使用.
        system_cache=True で system prompt を ephemeral cache 化する.
        """
        if user_content is not None:
            messages = [{"role": "user", "content": user_content}]
        else:
            messages = [{"role": "user", "content": prompt}]
        kwargs: dict = dict(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages,
        )
        sys_param = self._system_param(system, system_cache)
        if sys_param is not None:
            kwargs["system"] = sys_param
        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text
