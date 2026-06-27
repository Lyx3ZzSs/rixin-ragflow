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
import os
from collections.abc import Mapping

from common.config_utils import get_base_config
from common.constants import PADDLEOCR_DEFAULT_CONFIG, PADDLEOCR_ENV_KEYS

PADDLEOCR_CONFIG_KEY_ALIASES = {
    "PADDLEOCR_API_URL": ("api_url", "paddleocr_api_url", "PADDLEOCR_API_URL"),
    "PADDLEOCR_ACCESS_TOKEN": ("access_token", "paddleocr_access_token", "PADDLEOCR_ACCESS_TOKEN"),
    "PADDLEOCR_ALGORITHM": ("algorithm", "paddleocr_algorithm", "PADDLEOCR_ALGORITHM"),
    "PADDLEOCR_REQUEST_TIMEOUT": ("request_timeout", "paddleocr_request_timeout", "PADDLEOCR_REQUEST_TIMEOUT"),
    "PADDLEOCR_POLL_INTERVAL": ("poll_interval", "paddleocr_poll_interval", "PADDLEOCR_POLL_INTERVAL"),
    "PADDLEOCR_OPTIONAL_PAYLOAD": ("optional_payload", "optionalPayload", "paddleocr_optional_payload", "PADDLEOCR_OPTIONAL_PAYLOAD"),
}


def _has_value(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _normalize_value(key: str, value):
    if not isinstance(value, str):
        return value

    value = value.strip()
    if key == "PADDLEOCR_OPTIONAL_PAYLOAD":
        try:
            return json.loads(value)
        except Exception:
            return value
    if key in {"PADDLEOCR_REQUEST_TIMEOUT", "PADDLEOCR_POLL_INTERVAL"}:
        try:
            return int(value)
        except ValueError:
            return value
    return value


def _merge_paddleocr_mapping(config: dict, source: Mapping | None) -> None:
    if not isinstance(source, Mapping):
        return

    for env_key, aliases in PADDLEOCR_CONFIG_KEY_ALIASES.items():
        for alias in aliases:
            value = source.get(alias)
            if _has_value(value):
                config[env_key] = _normalize_value(env_key, value)
                break


def _merge_paddleocr_env(config: dict, environ: Mapping[str, str] | None = None) -> None:
    environ = environ if environ is not None else os.environ
    for key in PADDLEOCR_ENV_KEYS:
        value = environ.get(key)
        if _has_value(value):
            config[key] = _normalize_value(key, value)


def get_paddleocr_service_config() -> dict:
    config = get_base_config("paddleocr", {}) or {}
    return config if isinstance(config, dict) else {}


def build_paddleocr_config(
    service_config: Mapping | None = None,
    runtime_config: Mapping | None = None,
    environ: Mapping[str, str] | None = None,
) -> dict:
    """Resolve PaddleOCR config as service_conf < env < runtime config."""

    config = dict(PADDLEOCR_DEFAULT_CONFIG)
    _merge_paddleocr_mapping(config, service_config)
    _merge_paddleocr_env(config, environ)
    _merge_paddleocr_mapping(config, runtime_config)
    return config


def collect_paddleocr_config(
    service_config: Mapping | None = None,
    environ: Mapping[str, str] | None = None,
) -> dict | None:
    """Return startup PaddleOCR config only when an API URL is configured."""

    if service_config is None:
        service_config = get_paddleocr_service_config()
    config = build_paddleocr_config(service_config=service_config, environ=environ)
    return config if _has_value(config.get("PADDLEOCR_API_URL")) else None


def resolve_paddleocr_runtime_config(
    runtime_config: Mapping | None = None,
    environ: Mapping[str, str] | None = None,
) -> dict:
    service_config = get_paddleocr_service_config()
    return build_paddleocr_config(service_config=service_config, runtime_config=runtime_config, environ=environ)
