import io
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app import create_app
from app.config import load_config
from app.services.pdf_service import convert_pdf_to_docx


class FakePdfConverter:
    def __init__(self, _pdf_path):
        pass

    def convert(self, docx_path):
        Path(docx_path).write_bytes(b"test docx content")

    def close(self):
        pass


class ResumeBuilderRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app("testing")
        self.client = self.app.test_client()

    def test_main_pages_render(self):
        pages = (
            ("/", b"Build Anything"),
            ("/resume-builder", b"Build your resume"),
            ("/pdf-to-word", b"PDF to Word"),
            ("/photo-resize", b"Photo Resize"),
        )

        for path, expected_text in pages:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertIn(expected_text, response.data)

    def test_pdf_to_word_rejects_missing_upload(self):
        response = self.client.post("/pdf-to-word", data={})

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/pdf-to-word")

    def test_pdf_to_word_rejects_wrong_extension(self):
        response = self.client.post(
            "/pdf-to-word",
            data={"file": (io.BytesIO(b"%PDF-1.7"), "resume.txt")},
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/pdf-to-word")

    def test_pdf_to_word_rejects_invalid_pdf_signature(self):
        response = self.client.post(
            "/pdf-to-word",
            data={"file": (io.BytesIO(b"not a pdf"), "resume.pdf")},
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/pdf-to-word")

    def test_pdf_to_word_returns_converted_document(self):
        with patch("app.services.pdf_service.Converter", FakePdfConverter):
            response = self.client.post(
                "/pdf-to-word",
                data={"file": (io.BytesIO(b"%PDF-1.7 test content"), "resume.pdf")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.mimetype,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        self.assertIn("attachment", response.headers["Content-Disposition"])
        self.assertEqual(response.data, b"test docx content")

    def test_photo_resize_rejects_invalid_reduction(self):
        for reduction in ("0", "91", "invalid"):
            with self.subTest(reduction=reduction):
                response = self.client.post(
                    "/photo-resize",
                    data={
                        "file": (io.BytesIO(b"image data"), "photo.png"),
                        "reduction": reduction,
                    },
                )
                self.assertEqual(response.status_code, 302)
                self.assertEqual(response.headers["Location"], "/photo-resize")

    def test_photo_resize_returns_reduced_png(self):
        source = io.BytesIO()
        Image.new("RGB", (100, 80), color="red").save(source, format="PNG")
        source.seek(0)

        response = self.client.post(
            "/photo-resize",
            data={
                "file": (source, "photo.png"),
                "reduction": "50",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "image/png")
        self.assertIn("resized-photo.png", response.headers["Content-Disposition"])
        with Image.open(io.BytesIO(response.data)) as resized:
            self.assertEqual(resized.size, (50, 40))

    def test_photo_resize_rejects_unreadable_image(self):
        response = self.client.post(
            "/photo-resize",
            data={
                "file": (io.BytesIO(b"not an image"), "photo.png"),
                "reduction": "50",
            },
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/photo-resize")


class ApplicationConfigTests(unittest.TestCase):
    def test_development_debug_is_disabled_by_default(self):
        with patch.dict(os.environ, {}, clear=True):
            config = load_config("development")

        self.assertFalse(config["DEBUG"])
        self.assertFalse(config["SESSION_COOKIE_SECURE"])
        self.assertTrue(config["SESSION_COOKIE_HTTPONLY"])

    def test_development_debug_requires_explicit_opt_in(self):
        with patch.dict(os.environ, {"FLASK_DEBUG": "true"}, clear=True):
            config = load_config("development")

        self.assertTrue(config["DEBUG"])

    def test_production_requires_a_secret_key(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "FLASK_SECRET_KEY"):
                load_config("production")

    def test_production_ignores_debug_opt_in_and_uses_secure_cookies(self):
        with patch.dict(
            os.environ,
            {"FLASK_SECRET_KEY": "production-secret", "FLASK_DEBUG": "true"},
            clear=True,
        ):
            config = load_config("production")

        self.assertFalse(config["DEBUG"])
        self.assertTrue(config["SESSION_COOKIE_SECURE"])
        self.assertEqual(config["SECRET_KEY"], "production-secret")

    def test_unknown_environment_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "APP_ENV"):
            load_config("staging")

    def test_invalid_debug_value_is_rejected(self):
        with patch.dict(os.environ, {"FLASK_DEBUG": "sometimes"}, clear=True):
            with self.assertRaisesRegex(ValueError, "FLASK_DEBUG"):
                load_config("development")


class ApplicationFactoryTests(unittest.TestCase):
    def test_factory_registers_existing_routes(self):
        app = create_app("testing")
        rules = {rule.rule for rule in app.url_map.iter_rules()}

        self.assertTrue(
            {"/", "/resume-builder", "/pdf-to-word", "/photo-resize"}.issubset(rules)
        )

    def test_factory_applies_overrides(self):
        app = create_app("testing", {"MAX_CONTENT_LENGTH": 1024})

        self.assertEqual(app.config["MAX_CONTENT_LENGTH"], 1024)

    def test_upload_size_error_keeps_tool_specific_page(self):
        app = create_app("testing", {"MAX_CONTENT_LENGTH": 64})
        response = app.test_client().post(
            "/photo-resize",
            data={
                "file": (io.BytesIO(b"x" * 256), "photo.png"),
                "reduction": "50",
            },
        )

        self.assertEqual(response.status_code, 413)
        self.assertIn(b"photo is too large", response.data)

    def test_pdf_service_returns_converted_content(self):
        with patch("app.services.pdf_service.Converter", FakePdfConverter):
            converted = convert_pdf_to_docx(b"%PDF-1.7 test content")

        self.assertEqual(converted.read(), b"test docx content")


if __name__ == "__main__":
    unittest.main()
