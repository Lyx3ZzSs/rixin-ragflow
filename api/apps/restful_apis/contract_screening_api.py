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
import os
from pathlib import Path

from quart import request

from api.apps import current_user, login_required
from api.apps.services.contract_screening_export_service import create_screening_export
from api.apps.services.contract_screening_feedback_service import create_screening_feedback
from api.apps.services.contract_screening_service import (
    ContractScreeningError,
    ContractScreeningStore,
    create_initial_task,
    mark_stale_task_failed,
    new_task_id,
    run_screening_task,
    save_task_or_raise,
    validate_create_task_request,
)
from api.apps.services.contract_screening_parser_service import parse_screening_prompt
from api.db.services import contract_screening_service as contract_screening_db_service
from api.db.services.knowledgebase_service import KnowledgebaseService
from api.utils.api_utils import (
    add_tenant_id_to_kwargs,
    get_error_argument_result,
    get_error_data_result,
    get_request_json,
    get_result,
)


_background_tasks: set[asyncio.Task] = set()
EXPORT_OUTPUT_DIR = Path(os.getenv("CONTRACT_SCREENING_EXPORT_DIR", "/tmp/ragflow-contract-screening-exports"))


@manager.route("/contract-screening/parse", methods=["POST"])  # noqa: F821
@login_required
@add_tenant_id_to_kwargs
async def parse_prompt(tenant_id: str):
    try:
        req = await get_request_json()
        payload = parse_screening_prompt(req)
        if not KnowledgebaseService.accessible(kb_id=req.get("kb_id"), user_id=tenant_id):
            return get_error_data_result(message="You don't own the dataset.")
        return get_result(data=payload)
    except ContractScreeningError as exc:
        return get_error_argument_result(exc.message)
    except Exception:
        logging.exception("failed to parse contract screening prompt")
        return get_error_data_result(message="Internal server error")


@manager.route("/contract-screening/tasks", methods=["GET"])  # noqa: F821
@login_required
@add_tenant_id_to_kwargs
async def list_tasks(tenant_id: str):
    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 20))
        kb_id = (request.args.get("kb_id") or "").strip() or None
        data = contract_screening_db_service.ContractScreeningTaskService.list_tasks(
            tenant_id=tenant_id,
            user_id=current_user.id,
            page=page,
            page_size=page_size,
            kb_id=kb_id,
        )
        return get_result(data=data)
    except Exception:
        logging.exception("failed to list contract screening tasks")
        return get_error_data_result(message="Internal server error")


@manager.route("/contract-screening/tasks", methods=["POST"])  # noqa: F821
@login_required
@add_tenant_id_to_kwargs
async def create_task(tenant_id: str):
    try:
        payload = validate_create_task_request(await get_request_json())
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
            conditions=payload["conditions"],
            evidence_policy=payload["evidence_policy"],
        )
        if not ContractScreeningStore().save(task):
            raise RuntimeError("Failed to persist contract screening task")
        _start_background_task(tenant_id, task_id)
        return get_result(data={"task_id": task_id})
    except ContractScreeningError as exc:
        return get_error_argument_result(exc.message)
    except Exception:
        logging.exception("failed to create contract screening task")
        return get_error_data_result(message="Internal server error")


@manager.route("/contract-screening/tasks/<task_id>", methods=["GET"])  # noqa: F821
@login_required
@add_tenant_id_to_kwargs
async def get_task(task_id: str, tenant_id: str):
    try:
        task = _load_task_or_error(tenant_id, task_id)
    except ContractScreeningError as exc:
        return get_error_data_result(message=exc.message)
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
    try:
        task = _load_task_or_error(tenant_id, task_id)
    except ContractScreeningError as exc:
        return get_error_data_result(message=exc.message)
    if not task:
        return get_error_data_result(message="Task not found")

    persisted = contract_screening_db_service.build_results_payload(tenant_id, task_id)
    if persisted:
        return get_result(data=persisted)

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


@manager.route("/contract-screening/tasks/<task_id>/exports", methods=["POST"])  # noqa: F821
@login_required
@add_tenant_id_to_kwargs
async def create_export(task_id: str, tenant_id: str):
    try:
        if not _task_available_for_export(tenant_id, task_id):
            return get_error_data_result(message="Task not found")

        req = await get_request_json()
        export_format = str(req.get("format") or "").lower()
        export = create_screening_export(
            tenant_id=tenant_id,
            user_id=current_user.id,
            task_id=task_id,
            export_format=export_format,
            output_dir=EXPORT_OUTPUT_DIR,
        )
        return get_result(data=export)
    except ContractScreeningError as exc:
        return get_error_argument_result(exc.message)
    except Exception:
        logging.exception("failed to create contract screening export")
        return get_error_data_result(message="Internal server error")


@manager.route("/contract-screening/exports/<export_id>", methods=["GET"])  # noqa: F821
@login_required
@add_tenant_id_to_kwargs
async def get_export(export_id: str, tenant_id: str):
    success, export = contract_screening_db_service.ContractScreeningExportService.get_by_id(export_id)
    if not success or not export or export.tenant_id != tenant_id:
        return get_error_data_result(message="Export not found")
    return get_result(data={
        "export_id": export.id,
        "task_id": export.task_id,
        "format": export.format,
        "status": export.status,
        "file_name": export.file_name,
        "file_key": export.file_key,
        "error": export.error,
    })


@manager.route("/contract-screening/tasks/<task_id>/feedback", methods=["POST"])  # noqa: F821
@login_required
@add_tenant_id_to_kwargs
async def create_feedback(task_id: str, tenant_id: str):
    try:
        feedback = create_screening_feedback(
            tenant_id=tenant_id,
            user_id=current_user.id,
            task_id=task_id,
            payload=await get_request_json(),
        )
        return get_result(data=feedback)
    except ContractScreeningError as exc:
        return get_error_argument_result(exc.message)
    except Exception:
        logging.exception("failed to create contract screening feedback")
        return get_error_data_result(message="Internal server error")


def _start_background_task(tenant_id: str, task_id: str) -> asyncio.Future:
    coro = run_screening_task(tenant_id, task_id)
    try:
        task = asyncio.create_task(coro)
    except RuntimeError:
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        result = loop.run_until_complete(coro)
        future = loop.create_future()
        future.set_result(result)
        return future

    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    task.add_done_callback(_log_background_task_exception)
    return task


def _load_task_or_error(tenant_id: str, task_id: str) -> dict | None:
    store = ContractScreeningStore()
    task = store.get(tenant_id, task_id)
    if not task:
        return None
    if mark_stale_task_failed(task):
        save_task_or_raise(store, task)
    return task


def _task_available_for_export(tenant_id: str, task_id: str) -> bool:
    task = _load_task_or_error(tenant_id, task_id)
    if task:
        return True
    return bool(contract_screening_db_service.build_results_payload(tenant_id, task_id))


def _log_background_task_exception(task: asyncio.Task):
    try:
        task.result()
    except asyncio.CancelledError:
        logging.info("contract screening task was cancelled")
    except Exception:
        logging.exception("contract screening task failed")
