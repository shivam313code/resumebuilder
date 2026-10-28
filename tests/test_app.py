import io
import os
import re
import sqlite3
import tempfile
import unittest
from contextlib import closing
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


class FakeOAuthUserInfoResponse:
    def raise_for_status(self):
        pass

    def json(self):
        return {
            "sub": "provider-user-123",
            "name": "OAuth Candidate",
            "email": "oauth@example.com",
            "email_verified": True,
        }


class FakeOAuthClient:
    def authorize_access_token(self):
        return {"access_token": "test-token"}

    def get(self, _url, *, token):
        if token != {"access_token": "test-token"}:
            raise AssertionError("OAuth user info request did not use the token.")
        return FakeOAuthUserInfoResponse()


class ResumeBuilderRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        database_path = Path(self.temp_dir.name) / "accounts.sqlite3"
        self.app = create_app("testing", {"DATABASE": str(database_path)})
        self.client = self.app.test_client()

    def test_main_pages_render(self):
        pages = (
            ("/", b"ResumePro"),
            ("/pdf-to-word", b"PDF to Word"),
            ("/photo-resize", b"Photo Resize"),
        )

        for path, expected_text in pages:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertIn(expected_text, response.data)

    def test_resume_builder_requires_login_and_displays_gallery_after_login(self):
        response = self.client.get("/resume-builder")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/login?next=/resume-builder")

        self._signup()
        response = self.client.get("/resume-builder")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Choose your resume style", response.data)

        response = self.client.get("/resume-builder/plain")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Build your resume", response.data)

    def test_signup_creates_account_and_logs_the_user_in(self):
        response = self._signup()

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/resume-builder")
        with self.client.session_transaction() as browser_session:
            self.assertIn("user_id", browser_session)

        with closing(sqlite3.connect(self.app.config["DATABASE"])) as connection:
            name, email, password_hash = connection.execute(
                "SELECT name, email, password_hash FROM users"
            ).fetchone()
        self.assertEqual(name, "Avery Candidate")
        self.assertEqual(email, "avery@example.com")
        self.assertNotEqual(password_hash, "correct horse battery staple")

    def test_login_after_signup_and_logout(self):
        self._signup()
        self._logout()

        response = self.client.get("/login")
        response = self.client.post(
            "/login",
            data={
                "csrf_token": self._csrf_token(response),
                "email": "avery@example.com",
                "password": "correct horse battery staple",
            },
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/resume-builder")

        response = self._logout()
        self.assertEqual(response.status_code, 302)
        with self.client.session_transaction() as browser_session:
            self.assertNotIn("user_id", browser_session)

    def test_signup_validates_password_terms_email_and_csrf(self):
        response = self.client.get("/signup")
        token = self._csrf_token(response)
        invalid_submissions = (
            {"name": "Avery", "email": "avery@example.com", "password": "short", "terms": "accepted"},
            {"name": "Avery", "email": "not-an-email", "password": "correct horse battery staple", "terms": "accepted"},
            {"name": "Avery", "email": "avery@example.com", "password": "correct horse battery staple"},
        )
        for data in invalid_submissions:
            with self.subTest(data=data):
                response = self.client.post(
                    "/signup", data={"csrf_token": token, **data}
                )
                self.assertEqual(response.status_code, 400)

        response = self.client.post(
            "/signup",
            data={
                "name": "Avery",
                "email": "avery@example.com",
                "password": "correct horse battery staple",
                "terms": "accepted",
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_duplicate_signup_is_rejected(self):
        self._signup()
        self._logout()
        response = self.client.get("/signup")
        response = self.client.post(
            "/signup",
            data={
                "csrf_token": self._csrf_token(response),
                "name": "Another Avery",
                "email": "AVERY@example.com",
                "password": "correct horse battery staple",
                "terms": "accepted",
            },
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn(b"account with that email already exists", response.data)

    def test_login_rejects_wrong_credentials(self):
        self._signup()
        self._logout()
        response = self.client.get("/login")
        response = self.client.post(
            "/login",
            data={
                "csrf_token": self._csrf_token(response),
                "email": "avery@example.com",
                "password": "wrong password here",
            },
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn(b"Email or password is incorrect.", response.data)

    def test_login_rejects_external_redirect_targets(self):
        self._signup()
        self._logout()
        response = self.client.get("/login")
        response = self.client.post(
            "/login?next=%2F%5C%5Cevil.example",
            data={
                "csrf_token": self._csrf_token(response),
                "email": "avery@example.com",
                "password": "correct horse battery staple",
            },
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/resume-builder")

    def test_oauth_button_reports_missing_provider_configuration(self):
        response = self.client.get("/auth/google", follow_redirects=True)

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Google sign-in is not configured yet.", response.data)

    def test_oauth_callback_creates_account_from_verified_provider_email(self):
        self.app.config["OAUTH_ENABLED"]["google"] = True
        with patch("app.auth.oauth.create_client", return_value=FakeOAuthClient()):
            response = self.client.get("/auth/google/callback")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/resume-builder")
        with self.client.session_transaction() as browser_session:
            self.assertIn("user_id", browser_session)

        with closing(sqlite3.connect(self.app.config["DATABASE"])) as connection:
            account = connection.execute(
                """
                SELECT users.name, users.email, oauth_accounts.subject
                FROM users
                JOIN oauth_accounts ON oauth_accounts.user_id = users.id
                """
            ).fetchone()
        self.assertEqual(
            account, ("OAuth Candidate", "oauth@example.com", "provider-user-123")
        )

    def test_homepage_shows_signed_in_user_and_csrf_protected_logout(self):
        self._signup()
        response = self.client.get("/")

        self.assertIn(b"Avery Candidate", response.data)
        self.assertIn(b'action="/logout"', response.data)
        self.assertIn(b'name="csrf_token"', response.data)

    def test_legal_pages_render(self):
        self.assertEqual(self.client.get("/terms").status_code, 200)
        self.assertEqual(self.client.get("/privacy").status_code, 200)

    def test_homepage_contains_resume_builder_sections_and_existing_tool_links(self):
        response = self.client.get("/")

        self.assertIn(b"Create a Job-Winning", response.data)
        self.assertIn(b"AI Tools", response.data)
        self.assertIn(b"ATS Score", response.data)
        self.assertIn(b'href="/signup"', response.data)
        self.assertIn(b'href="/login"', response.data)
        self.assertIn(b'href="/resume-builder"', response.data)
        self.assertIn(b'href="/pdf-to-word"', response.data)
        self.assertIn(b'href="/photo-resize"', response.data)

    def _csrf_token(self, response):
        match = re.search(rb'name="csrf_token" value="([^"]+)"', response.data)
        self.assertIsNotNone(match)
        return match.group(1).decode()

    def _signup(self):
        response = self.client.get("/signup")
        return self.client.post(
            "/signup",
            data={
                "csrf_token": self._csrf_token(response),
                "name": "Avery Candidate",
                "email": "avery@example.com",
                "password": "correct horse battery staple",
                "terms": "accepted",
            },
        )

    def _logout(self):
        response = self.client.get("/")
        match = re.search(
            rb'<form class="rp-logout-form"[^>]*>.*?name="csrf_token" value="([^"]+)"',
            response.data,
        )
        self.assertIsNotNone(match)
        return self.client.post("/logout", data={"csrf_token": match.group(1).decode()})

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

    def test_oauth_configuration_is_read_from_environment(self):
        with patch.dict(
            os.environ,
            {
                "GOOGLE_CLIENT_ID": "google-client",
                "GOOGLE_CLIENT_SECRET": "google-secret",
                "LINKEDIN_CLIENT_ID": "linkedin-client",
                "LINKEDIN_CLIENT_SECRET": "linkedin-secret",
            },
            clear=True,
        ):
            config = load_config("testing")

        self.assertEqual(config["GOOGLE_CLIENT_ID"], "google-client")
        self.assertEqual(config["GOOGLE_CLIENT_SECRET"], "google-secret")
        self.assertEqual(config["LINKEDIN_CLIENT_ID"], "linkedin-client")
        self.assertEqual(config["LINKEDIN_CLIENT_SECRET"], "linkedin-secret")

    def test_invalid_debug_value_is_rejected(self):
        with patch.dict(os.environ, {"FLASK_DEBUG": "sometimes"}, clear=True):
            with self.assertRaisesRegex(ValueError, "FLASK_DEBUG"):
                load_config("development")


class ApplicationFactoryTests(unittest.TestCase):
    def test_factory_registers_existing_routes(self):
        app = create_app("testing")
        rules = {rule.rule for rule in app.url_map.iter_rules()}

        self.assertTrue(
            {
                "/",
                "/resume-builder",
                "/resume-builder/<template_id>",
                "/login",
                "/signup",
                "/logout",
                "/pdf-to-word",
                "/photo-resize",
            }.issubset(rules)
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
