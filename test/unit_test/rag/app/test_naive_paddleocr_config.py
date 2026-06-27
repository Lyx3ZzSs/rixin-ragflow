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

import rag.app.naive as naive
from common.constants import LLMType
from rag.app.naive import _build_paddleocr_model_config, by_paddleocr


def test_build_paddleocr_model_config_uses_selected_model_name_and_config_payload():
    config = {
        "PADDLEOCR_API_URL": "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs",
        "PADDLEOCR_ACCESS_TOKEN": "token",
        "PADDLEOCR_ALGORITHM": "PaddleOCR-VL-1.6",
    }

    model_config = _build_paddleocr_model_config(config, "PaddleOCR-VL-1.6@paddleocr@PaddleOCR")

    assert model_config["llm_factory"] == "PaddleOCR"
    assert model_config["llm_name"] == "PaddleOCR-VL-1.6"
    assert model_config["model_type"] == LLMType.OCR.value
    assert json.loads(model_config["api_key"]) == config


def test_by_paddleocr_falls_back_to_service_config_when_selected_instance_missing():
    config = {
        "PADDLEOCR_API_URL": "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs",
        "PADDLEOCR_ACCESS_TOKEN": "token",
        "PADDLEOCR_ALGORITHM": "PaddleOCR-VL-1.6",
    }
    original_get_model_config = naive.get_model_config_from_provider_instance
    original_collect = naive.collect_paddleocr_config
    original_llm_bundle = naive.LLMBundle

    class _FakeParser:
        def parse_pdf(self, **kwargs):
            return [("contract text", "@@1\t0\t0\t0\t0##")], []

    class _FakeBundle:
        def __init__(self, tenant_id, model_config, lang="Chinese"):
            self.model_config = model_config
            self.mdl = _FakeParser()

    try:
        naive.get_model_config_from_provider_instance = lambda *args, **kwargs: (_ for _ in ()).throw(LookupError("missing"))
        naive.collect_paddleocr_config = lambda: config
        naive.LLMBundle = _FakeBundle

        sections, tables, parser = by_paddleocr(
            "GNXNYN-20230310-00005.pdf",
            binary=b"%PDF",
            tenant_id="tenant-1",
            paddleocr_llm_name="PaddleOCR-VL-1.6@paddleocr@PaddleOCR",
        )
    finally:
        naive.get_model_config_from_provider_instance = original_get_model_config
        naive.collect_paddleocr_config = original_collect
        naive.LLMBundle = original_llm_bundle

    assert sections == [("contract text", "@@1\t0\t0\t0\t0##")]
    assert tables == []
    assert parser is not None


def test_by_paddleocr_does_not_fallback_when_selected_instance_parse_fails():
    config = {
        "PADDLEOCR_API_URL": "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs",
        "PADDLEOCR_ACCESS_TOKEN": "token",
        "PADDLEOCR_ALGORITHM": "PaddleOCR-VL-1.6",
    }
    original_get_model_config = naive.get_model_config_from_provider_instance
    original_collect = naive.collect_paddleocr_config
    original_llm_bundle = naive.LLMBundle

    class _FailingParser:
        def parse_pdf(self, **kwargs):
            raise RuntimeError("remote job failed")

    class _FakeBundle:
        def __init__(self, tenant_id, model_config, lang="Chinese"):
            self.model_config = model_config
            self.mdl = _FailingParser()

    try:
        naive.get_model_config_from_provider_instance = lambda *args, **kwargs: {
            "llm_factory": "PaddleOCR",
            "api_key": json.dumps(config),
            "api_base": "",
            "llm_name": "PaddleOCR-VL-1.6",
            "model_type": LLMType.OCR.value,
        }
        naive.collect_paddleocr_config = lambda: (_ for _ in ()).throw(AssertionError("fallback should not run"))
        naive.LLMBundle = _FakeBundle

        sections, tables, parser = by_paddleocr(
            "GNXNYN-20230310-00005.pdf",
            binary=b"%PDF",
            tenant_id="tenant-1",
            paddleocr_llm_name="PaddleOCR-VL-1.6@paddleocr@PaddleOCR",
        )
    finally:
        naive.get_model_config_from_provider_instance = original_get_model_config
        naive.collect_paddleocr_config = original_collect
        naive.LLMBundle = original_llm_bundle

    assert sections is None
    assert tables is None
    assert parser is not None
