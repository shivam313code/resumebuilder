import io
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError


class UnsupportedImageFormatError(Exception):
    pass


class ImageTooLargeError(Exception):
    pass


class InvalidImageError(Exception):
    pass


def resize_image(image_content, reduction):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image_stream = io.BytesIO(image_content)
            with Image.open(image_stream) as source_image:
                if source_image.format not in {"JPEG", "PNG", "WEBP"}:
                    raise UnsupportedImageFormatError
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
    except UnsupportedImageFormatError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise ImageTooLargeError from error
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise InvalidImageError from error

    mimetype = "image/jpeg" if extension == "jpg" else f"image/{extension}"
    return output_stream, extension, mimetype
