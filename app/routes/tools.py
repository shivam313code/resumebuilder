from flask import Blueprint, current_app, flash, redirect, render_template, request, send_file, url_for

from ..services.image_service import (
    ImageTooLargeError,
    InvalidImageError,
    UnsupportedImageFormatError,
    resize_image,
)
from ..services.pdf_service import convert_pdf_to_docx


tools_blueprint = Blueprint("tools", __name__)


@tools_blueprint.route("/pdf-to-word", methods=["GET", "POST"])
def pdf_to_word():
    if request.method == "GET":
        return render_template("pdf_to_word.html")

    uploaded_file = request.files.get("file")
    if not uploaded_file or not uploaded_file.filename:
        flash("Choose a PDF file to convert.", "error")
        return redirect(url_for("tools.pdf_to_word"))
    if not uploaded_file.filename.lower().endswith(".pdf"):
        flash("Please upload a file with a .pdf extension.", "error")
        return redirect(url_for("tools.pdf_to_word"))
    if b"%PDF-" not in uploaded_file.stream.read(1024):
        flash("This file does not appear to be a valid PDF.", "error")
        return redirect(url_for("tools.pdf_to_word"))
    uploaded_file.stream.seek(0)

    try:
        converted_document = convert_pdf_to_docx(uploaded_file.read())
        return send_file(
            converted_document,
            as_attachment=True,
            download_name="converted.docx",
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    except Exception:
        current_app.logger.exception("PDF to Word conversion failed")
        flash("We couldn't convert this PDF. Try another PDF file.", "error")
        return redirect(url_for("tools.pdf_to_word"))


@tools_blueprint.route("/photo-resize", methods=["GET", "POST"])
def photo_resize():
    if request.method == "GET":
        return render_template("photo_resize.html")

    uploaded_file = request.files.get("file")
    if not uploaded_file or not uploaded_file.filename:
        flash("Choose a photo to resize.", "error")
        return redirect(url_for("tools.photo_resize"))

    try:
        reduction = int(request.form.get("reduction", "50"))
    except ValueError:
        flash("Choose a reduction between 1% and 90%.", "error")
        return redirect(url_for("tools.photo_resize"))
    if not 1 <= reduction <= 90:
        flash("Choose a reduction between 1% and 90%.", "error")
        return redirect(url_for("tools.photo_resize"))

    try:
        output_stream, extension, mimetype = resize_image(uploaded_file.read(), reduction)
        return send_file(
            output_stream,
            as_attachment=True,
            download_name=f"resized-photo.{extension}",
            mimetype=mimetype,
        )
    except ImageTooLargeError:
        flash("This photo is too large to process safely.", "error")
        return redirect(url_for("tools.photo_resize"))
    except UnsupportedImageFormatError:
        flash("Upload a JPG, PNG, or WebP photo.", "error")
        return redirect(url_for("tools.photo_resize"))
    except (InvalidImageError, OSError, ValueError):
        flash("We couldn't read this image. Upload a valid JPG, PNG, or WebP photo.", "error")
        return redirect(url_for("tools.photo_resize"))
    except Exception:
        current_app.logger.exception("Photo resizing failed")
        flash("We couldn't resize this photo. Please try another image.", "error")
        return redirect(url_for("tools.photo_resize"))
