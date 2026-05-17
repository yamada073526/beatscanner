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
    def _system_param(system: str | list[dict] | None, system_cache: bool):
        """system を Anthropic API の system param 形式に変換する.

        handover v82 Phase 4 で multi-block prompt cache 対応:
        - system: str + system_cache=True → 1-block array + ephemeral cache (backward compat)
        - system: str + system_cache=False → str raw passthrough (backward compat)
        - system: list[dict] → raw passthrough (新形式、 multi-block cache 対応、
            呼出側が cache_control を各 block に付与する責務)
        - system: None / "" → None

        list[dict] は Phase 4 の prompt.get_system_blocks() で生成。 4 break point まで
        cache 可能、 静的度の高い順 (instructions → few-shot → 将来 KB → user) で配置。
        """
        if not system:
            return None
        if isinstance(system, list):
            # multi-block 形式: 呼出側が cache_control を付与済前提、 raw passthrough
            return system
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
        system: str | list[dict] | None = None,
        system_cache: bool = False,
        prefill: str | None = None,
    ) -> str:
        """prefill を指定すると assistant の出力を強制的にその文字列で開始させる。
        例: prefill="{" を渡すと、Claude の出力は必ず `{` から続く（戻り値には prefill 自身が prepend される）。
        JSON-only 出力を確実にしたい場合に有効。

        system_cache=True で system prompt を ephemeral cache 化する.
        """
        messages: list[dict] = [{"role": "user", "content": prompt}]
        # Anthropic API は prefill 末尾空白を拒否するため rstrip して送信、
        # 戻り値には original prefill (空白付き) を prepend.
        api_prefill = prefill.rstrip() if prefill else None
        if api_prefill:
            messages.append({"role": "assistant", "content": api_prefill})
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
        system: str | list[dict] | None = None,
        system_cache: bool = False,
        prefill: str | None = None,
    ):
        """Yield text chunks as they arrive from Claude.
        - prompt: str を渡すと従来の単一テキスト user message として送信
        - user_content: list[dict] を渡すと structured content blocks (cache_control 可)
          として送信
        - prefill: assistant の出力を強制的にその文字列で開始させる
          (例: "## " で見出しから始まる出力を強制)。yield 結果には prefill 自身も含まれる
        system_cache=True で system prompt を ephemeral cache 化する.
        """
        if user_content is not None:
            messages = [{"role": "user", "content": user_content}]
        else:
            messages = [{"role": "user", "content": prompt}]
        # Anthropic API は assistant prefill の末尾空白を許さない (invalid_request_error).
        # 「## 」のような trailing space を含む prefill は API 用に rstrip し、
        # client 向け yield のみ original (空白付き) を保持する.
        api_prefill = prefill.rstrip() if prefill else None
        if api_prefill:
            messages.append({"role": "assistant", "content": api_prefill})
        kwargs: dict = dict(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages,
        )
        sys_param = self._system_param(system, system_cache)
        if sys_param is not None:
            kwargs["system"] = sys_param
        # prefill を先に yield することで client は prefill 込みの完全な出力を受け取る.
        # (Anthropic SDK は prefill 後の生成 token のみ stream するため)
        if prefill:
            yield prefill
        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text
