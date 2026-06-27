from common.parser_config_utils import (
    DEFAULT_LAYOUT_RECOGNIZER,
    normalize_layout_recognizer,
)


def test_normalize_layout_recognizer_defaults_to_paddleocr():
    assert DEFAULT_LAYOUT_RECOGNIZER == "PaddleOCR"
    assert normalize_layout_recognizer(None) == ("PaddleOCR", None)
    assert normalize_layout_recognizer("") == ("PaddleOCR", None)
    assert normalize_layout_recognizer("DeepDOC") == ("PaddleOCR", None)
    assert normalize_layout_recognizer(True) == ("PaddleOCR", None)


def test_normalize_layout_recognizer_keeps_explicit_paddleocr_model():
    model_name = "paddleocr-from-env-1@default@PaddleOCR"

    assert normalize_layout_recognizer(model_name) == ("PaddleOCR", model_name)
