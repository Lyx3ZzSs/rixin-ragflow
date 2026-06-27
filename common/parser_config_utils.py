#
#  Copyright 2025 The InfiniFlow Authors. All Rights Reserved.
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

from typing import Any


DEFAULT_LAYOUT_RECOGNIZER = "PaddleOCR"
LOCAL_OCR_LAYOUT_RECOGNIZERS = {"deepdoc"}


def normalize_layout_recognizer(layout_recognizer_raw: Any) -> tuple[Any, str | None]:
    parser_model_name: str | None = None
    layout_recognizer = layout_recognizer_raw

    if layout_recognizer is None:
        return DEFAULT_LAYOUT_RECOGNIZER, None

    if isinstance(layout_recognizer, bool):
        return (DEFAULT_LAYOUT_RECOGNIZER if layout_recognizer else "Plain Text"), None

    if isinstance(layout_recognizer_raw, str):
        layout_recognizer = layout_recognizer_raw.strip()
        lowered = layout_recognizer.lower()
        if not lowered or lowered in LOCAL_OCR_LAYOUT_RECOGNIZERS or lowered.endswith("@deepdoc"):
            return DEFAULT_LAYOUT_RECOGNIZER, None
        if lowered.endswith("@mineru"):
            parser_model_name = layout_recognizer
            layout_recognizer = "MinerU"
        elif lowered.endswith("@paddleocr"):
            parser_model_name = layout_recognizer
            layout_recognizer = "PaddleOCR"
        elif lowered.endswith("@opendataloader"):
            parser_model_name = layout_recognizer
            layout_recognizer = "OpenDataLoader"

    return layout_recognizer, parser_model_name
