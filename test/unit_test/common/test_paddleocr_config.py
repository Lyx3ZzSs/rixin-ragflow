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

from common.paddleocr_config import build_paddleocr_config, collect_paddleocr_config


def test_collect_paddleocr_config_reads_service_conf_aliases():
    config = collect_paddleocr_config(
        service_config={
            "api_url": "https://ocr.example.com/api",
            "access_token": "token-from-conf",
            "algorithm": "PaddleOCR-VL",
        },
        environ={},
    )

    assert config["PADDLEOCR_API_URL"] == "https://ocr.example.com/api"
    assert config["PADDLEOCR_ACCESS_TOKEN"] == "token-from-conf"
    assert config["PADDLEOCR_ALGORITHM"] == "PaddleOCR-VL"
    assert config["PADDLEOCR_REQUEST_TIMEOUT"] == 1800
    assert config["PADDLEOCR_POLL_INTERVAL"] == 5
    assert config["PADDLEOCR_OPTIONAL_PAYLOAD"] == {}


def test_collect_paddleocr_config_requires_api_url():
    assert collect_paddleocr_config(service_config={"algorithm": "PaddleOCR-VL"}, environ={}) is None


def test_collect_paddleocr_config_uses_v16_defaults_and_jobs_options():
    config = collect_paddleocr_config(
        service_config={
            "api_url": "https://ocr.example.com/api/v2/ocr/jobs",
            "request_timeout": 1800,
            "poll_interval": 3,
            "optional_payload": {
                "useDocOrientationClassify": False,
                "useDocUnwarping": False,
                "useChartRecognition": False,
            },
        },
        environ={},
    )

    assert config["PADDLEOCR_ALGORITHM"] == "PaddleOCR-VL-1.6"
    assert config["PADDLEOCR_REQUEST_TIMEOUT"] == 1800
    assert config["PADDLEOCR_POLL_INTERVAL"] == 3
    assert config["PADDLEOCR_OPTIONAL_PAYLOAD"] == {
        "useDocOrientationClassify": False,
        "useDocUnwarping": False,
        "useChartRecognition": False,
    }


def test_paddleocr_env_overrides_service_conf():
    config = collect_paddleocr_config(
        service_config={
            "api_url": "https://ocr.example.com/api",
            "access_token": "token-from-conf",
            "algorithm": "PaddleOCR-VL",
        },
        environ={
            "PADDLEOCR_API_URL": "https://env-ocr.example.com/api",
            "PADDLEOCR_ACCESS_TOKEN": "token-from-env",
        },
    )

    assert config["PADDLEOCR_API_URL"] == "https://env-ocr.example.com/api"
    assert config["PADDLEOCR_ACCESS_TOKEN"] == "token-from-env"
    assert config["PADDLEOCR_ALGORITHM"] == "PaddleOCR-VL"


def test_paddleocr_runtime_config_overrides_env_and_service_conf():
    config = build_paddleocr_config(
        service_config={
            "api_url": "https://ocr.example.com/api",
            "access_token": "token-from-conf",
        },
        environ={
            "PADDLEOCR_API_URL": "https://env-ocr.example.com/api",
            "PADDLEOCR_ACCESS_TOKEN": "token-from-env",
        },
        runtime_config={
            "paddleocr_api_url": "https://runtime-ocr.example.com/api",
            "paddleocr_access_token": "token-from-runtime",
        },
    )

    assert config["PADDLEOCR_API_URL"] == "https://runtime-ocr.example.com/api"
    assert config["PADDLEOCR_ACCESS_TOKEN"] == "token-from-runtime"
