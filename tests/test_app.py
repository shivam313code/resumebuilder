import io
import os
import re
import sqlite3
import tempfile
import unittest
import zipfile
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
            ("/pricing", b"Choose the Plan"),
            ("/pdf-to-word", b"PDF to Word"),
            ("/photo-resize", b"Photo Resize"),
        )

        for path, expected_text in pages:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertIn(expected_text, response.data)

    def test_pricing_page_displays_plans_and_billing_controls(self):
        response = self.client.get("/pricing")

        self.assertEqual(response.status_code, 200)
        for expected_text in (
            b"Free",
            b"Pro",
            b"Team",
            b"Monthly",
            b"Yearly",
            b"ATS Optimization",
            b"Team Collaboration",
            b"7-Day Money Back",
        ):
            with self.subTest(expected_text=expected_text):
                self.assertIn(expected_text, response.data)

    def test_resume_builder_requires_login_and_displays_gallery_after_login(self):
        response = self.client.get("/resume-builder")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/login?next=/resume-builder")

        self._signup()
        response = self.client.get("/resume-builder")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Choose your resume style", response.data)

        response = self.client.get("/resume-builder/modern-pro")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Edit your resume", response.data)

    def test_dashboard_and_ai_copilot_are_authenticated_and_linked(self):
        for path in ("/dashboard", "/ai-copilot", "/job-tracker", "/settings"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 302)
                self.assertEqual(response.headers["Location"], f"/login?next={path}")

        self._signup()
        dashboard = self.client.get("/dashboard")
        self.assertEqual(dashboard.status_code, 200)
        self.assertIn(b"Welcome back", dashboard.data)
        self.assertIn(b'href="/ai-copilot"', dashboard.data)
        self.assertIn(b'href="/resume-builder/modern-pro"', dashboard.data)
        self.assertIn(b'id="resume-list"', dashboard.data)

        copilot = self.client.get("/ai-copilot")
        self.assertEqual(copilot.status_code, 200)
        self.assertIn(b"Your AI Resume Copilot", copilot.data)
        self.assertIn(b'data-mode="tailor"', copilot.data)
        self.assertIn(b'id="suggestion-list"', copilot.data)
        self.assertIn(b'id="copilot-checks"', copilot.data)

    def test_job_tracker_and_settings_render_functional_controls(self):
        self._signup()

        tracker = self.client.get("/job-tracker")
        self.assertEqual(tracker.status_code, 200)
        self.assertIn(b"Track Your", tracker.data)
        self.assertIn(b'id="job-table-body"', tracker.data)
        self.assertIn(b'id="job-dialog"', tracker.data)
        self.assertIn(b'href="/settings"', tracker.data)

        settings = self.client.get("/settings")
        self.assertEqual(settings.status_code, 200)
        self.assertIn(b"Profile Information", settings.data)
        self.assertIn(b'id="profile-form"', settings.data)
        self.assertIn(b'action="/account/password"', settings.data)
        self.assertIn(b'href="/job-tracker"', settings.data)

    def test_settings_profile_update_is_authenticated_and_csrf_protected(self):
        self.assertEqual(
            self.client.post("/account/profile", json={"name": "New Name"}).status_code,
            401,
        )
        self._signup()

        response = self.client.post(
            "/account/profile",
            json={"name": "Avery Updated"},
            headers={"X-CSRF-Token": self._session_csrf_token()},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"name": "Avery Updated"})
        self.assertIn(b"Avery Updated", self.client.get("/settings").data)
        self.assertEqual(
            self.client.post(
                "/account/profile",
                json={"name": "Bad Token"},
                headers={"X-CSRF-Token": "invalid"},
            ).status_code,
            400,
        )

    def test_password_change_requires_valid_current_password_and_csrf(self):
        self._signup()
        token = self._session_csrf_token()
        response = self.client.post(
            "/account/password",
            data={
                "csrf_token": token,
                "current_password": "incorrect current password",
                "new_password": "updated password that is long",
                "confirm_password": "updated password that is long",
            },
        )
        self.assertEqual(response.status_code, 302)
        self.assertIn("Your current password is incorrect.", self.client.get("/settings").get_data(as_text=True))

        response = self.client.post(
            "/account/password",
            data={
                "csrf_token": token,
                "current_password": "correct horse battery staple",
                "new_password": "updated password that is long",
                "confirm_password": "updated password that is long",
            },
        )
        self.assertEqual(response.status_code, 302)
        self._logout()
        login_page = self.client.get("/login")
        response = self.client.post(
            "/login",
            data={
                "csrf_token": self._csrf_token(login_page),
                "email": "avery@example.com",
                "password": "updated password that is long",
            },
        )
        self.assertEqual(response.status_code, 302)

    def test_resume_editor_renders_customization_and_export_controls(self):
        self._signup()

        response = self.client.get("/resume-builder/modern-pro")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Color theme", response.data)
        self.assertIn(b"Modern Pro", response.data)
        self.assertIn(b"Key Highlights", response.data)
        self.assertIn(b"Upload Photo", response.data)
        self.assertIn(b"Projects", response.data)
        self.assertIn(b"Download as DOCX", response.data)
        self.assertIn(b"Create cover letter draft", response.data)
        self.assertIn(b"data-section=", response.data)

    def test_resume_docx_export_returns_valid_document(self):
        self._signup()
        token = self._session_csrf_token()
        response = self.client.post(
            "/api/resume/export/docx",
            json={
                "data": {"name": "Avery Candidate", "title": "Engineer", "summary": "Builds useful tools."},
                "entries": {
                    "experience": [],
                    "education": [],
                    "projects": [{"name": "ResumePro", "dates": "2026", "description": "Built a resume app."}],
                    "certificates": [],
                },
            },
            headers={"X-CSRF-Token": token},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.mimetype,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
            document = archive.read("word/document.xml")
        self.assertIn(b"Avery Candidate", document)
        self.assertIn(b"Professional Summary", document)
        self.assertIn(b"ResumePro", document)

    def test_resume_share_is_private_revocable_and_csrf_protected(self):
        payload = {
            "data": {"name": "Avery Candidate", "title": "Engineer", "summary": "Builds useful tools."},
            "entries": {"experience": [], "education": []},
        }
        self.assertEqual(
            self.client.post("/api/resume/share", json=payload).status_code,
            401,
        )
        self._signup()
        token = self._session_csrf_token()
        response = self.client.post(
            "/api/resume/share",
            json=payload,
            headers={"X-CSRF-Token": token},
        )
        self.assertEqual(response.status_code, 201)
        share_url = response.get_json()["url"]
        share_path = share_url.removeprefix("http://localhost")
        shared = self.client.get(share_path)
        self.assertEqual(shared.status_code, 200)
        self.assertIn(b"Avery Candidate", shared.data)
        revoke_path = share_path.replace("/resume/shared/", "/api/resume/share/")
        self.assertEqual(self.client.delete(revoke_path).status_code, 400)

        updated_response = self.client.post(
            "/api/resume/share",
            json=payload,
            headers={"X-CSRF-Token": token},
        )
        self.assertEqual(updated_response.status_code, 201)
        self.assertEqual(self.client.get(share_path).status_code, 404)
        updated_share_url = updated_response.get_json()["url"]
        updated_revoke_path = updated_share_url.removeprefix("http://localhost").replace(
            "/resume/shared/", "/api/resume/share/"
        )

        response = self.client.delete(
            updated_revoke_path,
            headers={"X-CSRF-Token": token},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get(updated_share_url.removeprefix("http://localhost")).status_code, 404)

    def test_resume_api_rejects_malformed_and_oversized_data(self):
        self._signup()
        token = self._session_csrf_token()
        headers = {"X-CSRF-Token": token}
        invalid = self.client.post(
            "/api/resume/share",
            json={"data": [], "entries": {}},
            headers=headers,
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(
            self.client.post(
                "/api/resume/share",
                json={
                    "data": {"name": "A" * 10_001},
                    "entries": {"experience": [], "education": []},
                },
                headers=headers,
            ).status_code,
            400,
        )

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

    def test_signup_from_home_can_open_modern_pro_directly(self):
        response = self.client.get("/signup?next=/resume-builder/modern-pro")
        response = self.client.post(
            "/signup?next=/resume-builder/modern-pro",
            data={
                "csrf_token": self._csrf_token(response),
                "name": "Avery Candidate",
                "email": "avery@example.com",
                "password": "correct horse battery staple",
                "terms": "accepted",
            },
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/resume-builder/modern-pro")
        self.assertEqual(
            self.client.get("/resume-builder/modern-pro").status_code,
            200,
        )

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
        self.assertIn(b'href="/pricing"', response.data)
        self.assertIn(b"ATS Score", response.data)
        self.assertIn(b'href="/signup?next=/dashboard"', response.data)
        self.assertIn(b'href="/login?next=/dashboard"', response.data)
        self.assertIn(b'href="/resume-builder/modern-pro"', response.data)
        self.assertIn(b'class="rp-trust-belt"', response.data)
        self.assertEqual(response.data.count(b'class="rp-trust-group">'), 1)
        self.assertIn(b'class="rp-trust-group" aria-hidden="true"', response.data)
        self.assertIn(b'href="/resume-builder"', response.data)
        self.assertIn(b'href="/pdf-to-word"', response.data)
        self.assertIn(b'href="/photo-resize"', response.data)

    def _csrf_token(self, response):
        match = re.search(rb'name="csrf_token" value="([^"]+)"', response.data)
        self.assertIsNotNone(match)
        return match.group(1).decode()

    def _session_csrf_token(self):
        with self.client.session_transaction() as browser_session:
            return browser_session["_csrf_token"]

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
