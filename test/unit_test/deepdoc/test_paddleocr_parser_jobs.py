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

import deepdoc.parser.paddleocr_parser as paddleocr_parser
from deepdoc.parser.paddleocr_parser import PaddleOCRConfig, PaddleOCRParser


class _FakeResponse:
    def __init__(self, text: str):
        self.text = text

    def raise_for_status(self):
        return None


def test_jobs_api_detection():
    assert PaddleOCRParser._is_jobs_api("https://paddleocr.aistudio-app.com/api/v2/ocr/jobs")
    assert not PaddleOCRParser._is_jobs_api("https://paddleocr.aistudio-app.com/api")


def test_jobs_jsonl_is_normalized_to_layout_results():
    parser = PaddleOCRParser()
    original_get = paddleocr_parser.requests.get
    payload = {"result": {"layoutParsingResults": [{"markdown": {"text": "# Contract\n\nBody"}}]}}

    try:
        paddleocr_parser.requests.get = lambda *args, **kwargs: _FakeResponse(json.dumps(payload))
        result = parser._fetch_jobs_jsonl("https://example.com/result.jsonl", PaddleOCRConfig())
    finally:
        paddleocr_parser.requests.get = original_get

    assert result == {"layoutParsingResults": [{"markdown": {"text": "# Contract\n\nBody"}}]}
