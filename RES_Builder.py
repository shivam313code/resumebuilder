import io
import hmac
import logging
import os
import secrets
import tempfile
import warnings
from hashlib import sha256
from urllib.parse import quote

import requests
from flask import Flask, flash, jsonify, redirect, render_template, request, send_file, session, url_for
from pdf2docx import Converter
from PIL import Image, ImageOps, UnidentifiedImageError

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024

logging.basicConfig(level=logging.INFO)

PREMIUM_PRICE_PAISE = 3500
PREMIUM_PRICE_RUPEES = 35
RESUME_TEMPLATES = [
    {
        "id": "signature",
        "name": "Signature",
        "tier": "premium",
        "description": "An elegant two-column layout with a confident, editorial feel.",
        "label": "BEST VISUAL",
    },
    {
        "id": "editorial",
        "name": "Editorial",
        "tier": "premium",
        "description": "A polished statement header and refined typography for a standout first impression.",
        "label": "PREMIUM",
    },
    {
        "id": "modern",
        "name": "Modern",
        "tier": "free",
        "description": "A crisp contemporary layout with a clean, easy-to-scan structure.",
        "label": "FREE",
    },
    {
        "id": "classic",
        "name": "Classic",
        "tier": "free",
        "description": "A timeless, ATS-friendly single-column format for any industry.",
        "label": "FREE",
    },
    {
        "id": "minimal",
        "name": "Minimal",
        "tier": "free",
        "description": "A quiet, minimalist design that puts your experience first.",
        "label": "FREE",
    },
    {
        "id": "impact",
        "name": "Impact",
        "tier": "free",
        "description": "A bold color accent and clear hierarchy for a confident profile.",
        "label": "FREE",
    },
    {
        "id": "compact",
        "name": "Compact",
        "tier": "free",
        "description": "A space-conscious layout for a focused, concise resume.",
        "label": "FREE",
    },
]
TEMPLATES_BY_ID = {template["id"]: template for template in RESUME_TEMPLATES}


def razorpay_credentials_configured():
    return bool(os.environ.get("RAZORPAY_KEY_ID") and os.environ.get("RAZORPAY_KEY_SECRET"))


def create_razorpay_client():
    return requests.Session()


def razorpay_api_request(client, method, resource, payload=None):
    response = client.request(
        method,
        f"https://api.razorpay.com/v1/{resource}",
        auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"]),
        json=payload,
        timeout=20,
    )
    response.raise_for_status()
    result = response.json()
    if not isinstance(result, dict):
        raise ValueError("Razorpay returned an unexpected response.")
    return result


@app.get("/")
def index():
    return render_template("home.html")


@app.get("/resume-builder")
def resume_builder():
    csrf_token = session.setdefault("resume_payment_csrf", secrets.token_urlsafe(32))
    return render_template(
        "resume_templates.html",
        templates=RESUME_TEMPLATES,
        paid_templates=session.get("paid_resume_templates", []),
        razorpay_ready=razorpay_credentials_configured(),
        csrf_token=csrf_token,
        premium_price=PREMIUM_PRICE_RUPEES,
    )


@app.get("/resume-builder/<template_id>")
def edit_resume(template_id):
    template = TEMPLATES_BY_ID.get(template_id)
    if template is None:
        return redirect(url_for("resume_builder"))
    if template["tier"] == "premium" and template_id not in session.get("paid_resume_templates", []):
        flash("Purchase this premium template to use it.", "error")
        return redirect(url_for("resume_builder"))
    return render_template("index.html", template=template)


@app.post("/api/resume-templates/order")
def create_resume_template_order():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify(error="Choose a valid premium template."), 400
    csrf_token = session.get("resume_payment_csrf", "")
    request_token = request.headers.get("X-CSRF-Token", "")
    if not csrf_token or not hmac.compare_digest(csrf_token, request_token):
        return jsonify(error="Refresh the page before starting checkout."), 403

    template_id = data.get("template_id")
    template = TEMPLATES_BY_ID.get(template_id) if isinstance(template_id, str) else None
    if not template or template["tier"] != "premium":
        return jsonify(error="That premium template is not available."), 400
    if template_id in session.get("paid_resume_templates", []):
        return jsonify(error="You already own this template.", redirect=url_for("edit_resume", template_id=template_id)), 409
    if not razorpay_credentials_configured():
        return jsonify(error="Payments are not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable checkout."), 503

    try:
        client = create_razorpay_client()
        order = razorpay_api_request(client, "POST", "orders", {
            "amount": PREMIUM_PRICE_PAISE,
            "currency": "INR",
            "receipt": f"ba-{template_id}-{secrets.token_hex(8)}",
            "notes": {"template_id": template_id},
        })
        order_id = order.get("id")
        if not order_id:
            raise RuntimeError("Razorpay did not return an order ID.")
        pending_orders = session.get("pending_resume_template_orders", {})
        if not isinstance(pending_orders, dict):
            pending_orders = {}
        pending_orders[order_id] = template_id
        session["pending_resume_template_orders"] = dict(list(pending_orders.items())[-5:])
        return jsonify(
            key_id=os.environ["RAZORPAY_KEY_ID"],
            order_id=order_id,
            amount=PREMIUM_PRICE_PAISE,
            currency="INR",
            name="Build Anything",
            description=f"{template['name']} resume template",
        )
    except Exception:
        app.logger.exception("Unable to create Razorpay order")
        return jsonify(error="We couldn't start checkout. Please try again."), 502


@app.post("/api/resume-templates/verify")
def verify_resume_template_payment():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify(error="We couldn't verify this payment."), 400
    csrf_token = session.get("resume_payment_csrf", "")
    request_token = request.headers.get("X-CSRF-Token", "")
    if not csrf_token or not hmac.compare_digest(csrf_token, request_token):
        return jsonify(error="Refresh the page before verifying payment."), 403

    order_id = data.get("razorpay_order_id")
    payment_id = data.get("razorpay_payment_id")
    signature = data.get("razorpay_signature")
    pending_orders = session.get("pending_resume_template_orders", {})
    if not isinstance(pending_orders, dict):
        pending_orders = {}
    if (
        not isinstance(order_id, str)
        or not isinstance(payment_id, str)
        or not isinstance(signature, str)
        or order_id not in pending_orders
        or not razorpay_credentials_configured()
    ):
        return jsonify(error="We couldn't verify this payment. Please contact support if you were charged."), 400

    expected_signature = hmac.new(
        os.environ["RAZORPAY_KEY_SECRET"].encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, signature):
        return jsonify(error="Payment verification failed. The template remains locked."), 400

    template_id = pending_orders[order_id]
    try:
        client = create_razorpay_client()
        order = razorpay_api_request(client, "GET", f"orders/{quote(order_id, safe='')}")
        payment = razorpay_api_request(client, "GET", f"payments/{quote(payment_id, safe='')}")
        order_notes = order.get("notes") or {}
        if (
            order.get("id") != order_id
            or order.get("amount") != PREMIUM_PRICE_PAISE
            or order.get("currency") != "INR"
            or order_notes.get("template_id") != template_id
            or order.get("status") != "paid"
            or payment.get("id") != payment_id
            or payment.get("order_id") != order_id
            or payment.get("amount") != PREMIUM_PRICE_PAISE
            or payment.get("currency") != "INR"
            or payment.get("status") != "captured"
        ):
            return jsonify(error="Payment is not confirmed yet. Please wait a moment and try again."), 409
    except Exception:
        app.logger.exception("Unable to verify Razorpay payment")
        return jsonify(error="We couldn't confirm payment with Razorpay. Please try again."), 502

    paid_templates = set(session.get("paid_resume_templates", []))
    paid_templates.add(template_id)
    session["paid_resume_templates"] = sorted(paid_templates)
    pending_orders.pop(order_id, None)
    session["pending_resume_template_orders"] = pending_orders
    return jsonify(redirect=url_for("edit_resume", template_id=template_id))


@app.route("/pdf-to-word", methods=["GET", "POST"])
def pdf_to_word():
    if request.method == "GET":
        return render_template("pdf_to_word.html")

    uploaded_file = request.files.get("file")
    if not uploaded_file or not uploaded_file.filename:
        flash("Choose a PDF file to convert.", "error")
        return redirect(url_for("pdf_to_word"))
    if not uploaded_file.filename.lower().endswith(".pdf"):
        flash("Please upload a file with a .pdf extension.", "error")
        return redirect(url_for("pdf_to_word"))
    if b"%PDF-" not in uploaded_file.stream.read(1024):
        flash("This file does not appear to be a valid PDF.", "error")
        return redirect(url_for("pdf_to_word"))
    uploaded_file.stream.seek(0)

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = os.path.join(temp_dir, "source.pdf")
            docx_path = os.path.join(temp_dir, "converted.docx")
            uploaded_file.save(pdf_path)
            converter = Converter(pdf_path)
            try:
                converter.convert(docx_path)
            finally:
                converter.close()
            with open(docx_path, "rb") as converted_file:
                converted_document = io.BytesIO(converted_file.read())
        converted_document.seek(0)
        return send_file(
            converted_document,
            as_attachment=True,
            download_name="converted.docx",
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    except Exception:
        app.logger.exception("PDF to Word conversion failed")
        flash("We couldn't convert this PDF. Try another PDF file.", "error")
        return redirect(url_for("pdf_to_word"))


@app.route("/photo-resize", methods=["GET", "POST"])
def photo_resize():
    if request.method == "GET":
        return render_template("photo_resize.html")

    uploaded_file = request.files.get("file")
    if not uploaded_file or not uploaded_file.filename:
        flash("Choose a photo to resize.", "error")
        return redirect(url_for("photo_resize"))

    try:
        reduction = int(request.form.get("reduction", "50"))
    except ValueError:
        flash("Choose a reduction between 1% and 90%.", "error")
        return redirect(url_for("photo_resize"))
    if not 1 <= reduction <= 90:
        flash("Choose a reduction between 1% and 90%.", "error")
        return redirect(url_for("photo_resize"))

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image_stream = io.BytesIO(uploaded_file.read())
            with Image.open(image_stream) as source_image:
                if source_image.format not in {"JPEG", "PNG", "WEBP"}:
                    flash("Upload a JPG, PNG, or WebP photo.", "error")
                    return redirect(url_for("photo_resize"))
                source_image.verify()
            image_stream.seek(0)
            with Image.open(image_stream) as source_image:
                image = ImageOps.exif_transpose(source_image)
                original_width, original_height = image.size
                new_size = (
                    max(1, round(original_width * (100 - reduction) / 100)),
                    max(1, round(original_height * (100 - reduction) / 100)),
                )
                resized_image = image.resize(new_size, Image.Resampling.LANCZOS)
                output_format = source_image.format
                output_stream = io.BytesIO()
                if output_format == "JPEG":
                    if resized_image.mode not in {"RGB", "L"}:
                        resized_image = resized_image.convert("RGB")
                    resized_image.save(output_stream, format="JPEG", quality=90, optimize=True)
                    extension = "jpg"
                else:
                    resized_image.save(output_stream, format=output_format, optimize=True)
                    extension = "png" if output_format == "PNG" else "webp"
        output_stream.seek(0)
        return send_file(
            output_stream,
            as_attachment=True,
            download_name=f"resized-photo.{extension}",
            mimetype=f"image/{'jpeg' if extension == 'jpg' else extension}",
        )
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        flash("This photo is too large to process safely.", "error")
        return redirect(url_for("photo_resize"))
    except (UnidentifiedImageError, OSError, ValueError):
        flash("We couldn't read this image. Upload a valid JPG, PNG, or WebP photo.", "error")
        return redirect(url_for("photo_resize"))
    except Exception:
        app.logger.exception("Photo resizing failed")
        flash("We couldn't resize this photo. Please try another image.", "error")
        return redirect(url_for("photo_resize"))


@app.errorhandler(413)
def file_too_large(_error):
    if request.path == url_for("pdf_to_word"):
        flash("The PDF is too large. Please upload a file under 20 MB.", "error")
        return render_template("pdf_to_word.html"), 413
    if request.path == url_for("photo_resize"):
        flash("The photo is too large. Please upload a file under 20 MB.", "error")
        return render_template("photo_resize.html"), 413
    return "File too large. Maximum upload size is 20 MB.", 413


if __name__ == "__main__":
    app.run(debug=True)
