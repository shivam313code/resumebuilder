import io
import logging
import os
import secrets
import tempfile
import warnings

from flask import Flask, flash, redirect, render_template, request, send_file, url_for
from pdf2docx import Converter
from PIL import Image, ImageOps, UnidentifiedImageError

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024

logging.basicConfig(level=logging.INFO)

RESUME_TEMPLATES = [
    {
        "id": "timeless",
        "name": "Timeless",
        "description": "Classic two-column layout with a calm blue accent.",
    },
    {
        "id": "plain",
        "name": "Plain",
        "description": "Minimal, modern and ATS-conscious.",
    },
    {
        "id": "blogger",
        "name": "Blogger",
        "description": "Simple single-column layout for readable content.",
    },
    {
        "id": "pacific",
        "name": "Pacific",
        "description": "Clean two-column layout with a compact profile header.",
    },
    {
        "id": "general-ats",
        "name": "General ATS",
        "description": "Conservative, text-first layout designed for parsing.",
    },
]
TEMPLATES_BY_ID = {template["id"]: template for template in RESUME_TEMPLATES}


@app.get("/")
def index():
    return render_template("home.html")


@app.get("/resume-builder")
def resume_builder():
    return render_template("resume_templates.html", templates=RESUME_TEMPLATES)


@app.get("/resume-builder/<template_id>")
def edit_resume(template_id):
    template = TEMPLATES_BY_ID.get(template_id)
    if template is None:
        return redirect(url_for("resume_builder"))
    return render_template(
        "index.html",
        template=template,
        template_change_url=url_for("resume_builder"),
    )


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
    app.run(debug=app.config["DEBUG"])