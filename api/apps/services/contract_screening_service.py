#
#  Copyright 2026 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#

import json
import time
from dataclasses import asdict, dataclass, field
from typing import Any

from common.misc_utils import get_uuid
from rag.utils.redis_conn import REDIS_CONN


DEFAULT_FILTERS = {"risk": "全部", "status": "全部", "source": "全部"}
TASK_TTL_SECONDS = 60 * 60 * 24


class ContractScreeningError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


@dataclass
class ContractScreeningTask:
    task_id: str
    tenant_id: str
    user_id: str
    kb_id: str
    prompt: str
    filters: dict[str, str]
    status: str = "pending"
    phase: str = "parse_prompt"
    progress: float = 0.0
    message: str = "等待开始筛选"
    strategy: list[str] = field(default_factory=list)
    items: list[dict[str, Any]] = field(default_factory=list)
    skipped: dict[str, int] = field(default_factory=dict)
    error: str = ""
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


def _task_key(tenant_id: str, task_id: str) -> str:
    return f"contract_screening:{tenant_id}:{task_id}"


def validate_create_task_request(req: dict[str, Any]) -> dict[str, Any]:
    kb_id = str(req.get("kb_id") or "").strip()
    if not kb_id:
        raise ContractScreeningError("`kb_id` is required")

    prompt = str(req.get("prompt") or "").strip()
    if not prompt:
        raise ContractScreeningError("`prompt` is required")

    filters = dict(DEFAULT_FILTERS)
    incoming_filters = req.get("filters") or {}
    if isinstance(incoming_filters, dict):
        for key in filters:
            value = incoming_filters.get(key)
            if isinstance(value, str) and value.strip():
                filters[key] = value.strip()

    return {"kb_id": kb_id, "prompt": prompt, "filters": filters}


def create_initial_task(
    *,
    task_id: str,
    tenant_id: str,
    user_id: str,
    kb_id: str,
    prompt: str,
    filters: dict[str, str],
) -> dict[str, Any]:
    return asdict(
        ContractScreeningTask(
            task_id=task_id,
            tenant_id=tenant_id,
            user_id=user_id,
            kb_id=kb_id,
            prompt=prompt,
            filters=filters,
        )
    )


class ContractScreeningStore:
    def __init__(self, redis=REDIS_CONN, ttl_seconds: int = TASK_TTL_SECONDS):
        self.redis = redis
        self.ttl_seconds = ttl_seconds

    def save(self, task: dict[str, Any]) -> bool:
        task["updated_at"] = time.time()
        return self.redis.set_obj(
            _task_key(task["tenant_id"], task["task_id"]),
            task,
            exp=self.ttl_seconds,
        )

    def get(self, tenant_id: str, task_id: str) -> dict[str, Any] | None:
        raw = self.redis.get(_task_key(tenant_id, task_id))
        if not raw:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        if isinstance(raw, str):
            return json.loads(raw)
        return raw


def new_task_id() -> str:
    return get_uuid()
