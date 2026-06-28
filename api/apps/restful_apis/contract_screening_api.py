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

import asyncio
import logging

from api.apps import current_user, login_required
from api.apps.services.contract_screening_service import (
    ContractScreeningError,
    ContractScreeningStore,
    create_initial_task,
    new_task_id,
    run_screening_task,
    validate_create_task_request,
)
from api.db.services.knowledgebase_service import KnowledgebaseService
from api.utils.api_utils import (
    add_tenant_id_to_kwargs,
    get_error_argument_result,
    get_error_data_result,
    get_request_json,
    get_result,
)


@manager.route("/contract-screening/tasks", methods=["POST"])  # noqa: F821
@login_required
@add_tenant_id_to_kwargs
async def create_task(tenant_id: str):
    try:
        payload = validate_create_task_request(await get_request_json())
    except ContractScreeningError as exc:
        return get_error_argument_result(exc.message)

    if not KnowledgebaseService.accessible(kb_id=payload["kb_id"], user_id=tenant_id):
        return get_error_data_result(message="You don't own the dataset.")

    task_id = new_task_id()
    task = create_initial_task(
        task_id=task_id,
        tenant_id=tenant_id,
        user_id=current_user.id,
        kb_id=payload["kb_id"],
        prompt=payload["prompt"],
        filters=payload["filters"],
    )
    ContractScreeningStore().save(task)
    _start_background_task(tenant_id, task_id)
    return get_result(data={"task_id": task_id})


@manager.route("/contract-screening/tasks/<task_id>", methods=["GET"])  # noqa: F821
@login_required
@add_tenant_id_to_kwargs
async def get_task(task_id: str, tenant_id: str):
    task = ContractScreeningStore().get(tenant_id, task_id)
    if not task:
        return get_error_data_result(message="Task not found")

    return get_result(data={
        "task_id": task.get("task_id", task_id),
        "status": task.get("status", ""),
        "phase": task.get("phase", ""),
        "progress": task.get("progress", 0.0),
        "message": task.get("message", ""),
        "error": task.get("error", ""),
    })


@manager.route("/contract-screening/tasks/<task_id>/results", methods=["GET"])  # noqa: F821
@login_required
@add_tenant_id_to_kwargs
async def get_results(task_id: str, tenant_id: str):
    task = ContractScreeningStore().get(tenant_id, task_id)
    if not task:
        return get_error_data_result(message="Task not found")

    strategy = task.get("strategy")
    if not isinstance(strategy, dict):
        strategy = {}

    items = task.get("items")
    if not isinstance(items, list):
        items = []

    skipped = task.get("skipped")
    if not isinstance(skipped, dict):
        skipped = {}

    return get_result(data={
        "task_id": task.get("task_id", task_id),
        "prompt": task.get("prompt", ""),
        "strategy": strategy,
        "items": items,
        "skipped": skipped,
        "status": task.get("status", ""),
    })


def _start_background_task(tenant_id: str, task_id: str) -> asyncio.Task:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

    task = loop.create_task(run_screening_task(tenant_id, task_id))
    task.add_done_callback(_log_background_task_exception)
    return task


def _log_background_task_exception(task: asyncio.Task):
    try:
        task.result()
    except asyncio.CancelledError:
        logging.info("contract screening task was cancelled")
    except Exception:
        logging.exception("contract screening task failed")
