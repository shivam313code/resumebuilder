import io
import json
import re
import zipfile
from xml.etree.ElementTree import Element, SubElement, register_namespace, tostring


MAX_RESUME_SIZE = 3_000_000
WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
PACKAGE_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships"
register_namespace("w", WORD_NAMESPACE)


def validate_resume(payload):
    if not isinstance(payload, dict) or len(json.dumps(payload)) > MAX_RESUME_SIZE:
        raise ValueError("Resume data is invalid or too large.")
    data = payload.get("data")
    entries = payload.get("entries")
    if not isinstance(data, dict) or not isinstance(entries, dict):
        raise ValueError("Resume data is incomplete.")

    clean_data = {}
    for field in (
        "name", "title", "email", "phone", "location", "website", "summary",
        "portfolio", "highlights", "skills", "languages", "certificates", "software", "interests",
    ):
        value = data.get(field, "")
        if not isinstance(value, str) or len(value) > 10_000:
            raise ValueError("Resume fields must be text under 10,000 characters.")
        clean_data[field] = value.strip()

    clean_entries = {}
    entry_fields = {
        "experience": ("role", "company", "location", "dates", "description"),
        "education": ("degree", "school", "location", "dates", "description"),
        "projects": ("name", "dates", "description"),
        "certificates": ("name", "issuer", "dates"),
    }
    for section, fields in entry_fields.items():
        values = entries.get(section, [])
        if not isinstance(values, list) or len(values) > 50:
            raise ValueError("Resume section contains too many entries.")
        clean_entries[section] = []
        for item in values:
            if not isinstance(item, dict):
                raise ValueError("Resume entries must be objects.")
            clean_item = {}
            for field in fields:
                value = item.get(field, "")
                if not isinstance(value, str) or len(value) > 10_000:
                    raise ValueError("Resume entry fields must be text under 10,000 characters.")
                clean_item[field] = value.strip()
            clean_entries[section].append(clean_item)

    profile_photo = payload.get("profilePhoto", "")
    if not isinstance(profile_photo, str) or (
        profile_photo
        and (
            len(profile_photo) > 2_800_000
            or not re.fullmatch(
                r"data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*",
                profile_photo,
            )
        )
    ):
        raise ValueError("Profile photo must be a JPG, PNG, or WebP image under 2 MB.")
    return {"data": clean_data, "entries": clean_entries, "profilePhoto": profile_photo}


def validate_resume_document(payload):
    if not isinstance(payload, dict) or len(json.dumps(payload)) > MAX_RESUME_SIZE:
        raise ValueError("Resume data is invalid or too large.")
    appearance = payload.get("appearance", {})
    if not isinstance(appearance, dict):
        raise ValueError("Resume appearance settings are invalid.")
    profile_photo = payload.get("profilePhoto", appearance.get("photo", ""))
    validated = validate_resume({**payload, "profilePhoto": profile_photo})

    job_description = payload.get("jobDescription", "")
    if not isinstance(job_description, str) or len(job_description) > 10_000:
        raise ValueError("Job description must be text under 10,000 characters.")

    theme = appearance.get("theme", "#3159b7")
    layout = appearance.get("layout", "single")
    font = appearance.get("font", "modern")
    sections = appearance.get("sections", {})
    if not isinstance(theme, str) or not re.fullmatch(r"#[\da-fA-F]{6}", theme):
        raise ValueError("Resume theme must be a six-digit color.")
    if not isinstance(layout, str) or layout not in {"single", "sidebar"}:
        raise ValueError("Resume layout is invalid.")
    if not isinstance(font, str) or font not in {"modern", "classic", "compact"}:
        raise ValueError("Resume font is invalid.")
    if not isinstance(sections, dict) or any(
        not isinstance(value, bool) for value in sections.values()
    ):
        raise ValueError("Resume section settings are invalid.")
    allowed_sections = {
        "summary", "highlights", "experience", "education", "skills",
        "projects", "languages", "certificates", "software", "interests",
    }
    if set(sections) - allowed_sections:
        raise ValueError("Resume section settings contain an unknown section.")
    default_sections = {
        section: True for section in allowed_sections
    }
    default_sections.update(sections)

    return {
        **validated,
        "jobDescription": job_description,
        "appearance": {
            "theme": theme.lower(),
            "layout": layout,
            "font": font,
            "sections": default_sections,
        },
    }


def _append_text(parent, text, *, bold=False, size=None):
    paragraph = SubElement(parent, f"{{{WORD_NAMESPACE}}}p")
    run = SubElement(paragraph, f"{{{WORD_NAMESPACE}}}r")
    if bold or size:
        properties = SubElement(run, f"{{{WORD_NAMESPACE}}}rPr")
        if bold:
            SubElement(properties, f"{{{WORD_NAMESPACE}}}b")
        if size:
            SubElement(properties, f"{{{WORD_NAMESPACE}}}sz", {f"{{{WORD_NAMESPACE}}}val": str(size)})
    for line_index, line in enumerate(str(text).splitlines() or [""]):
        if line_index:
            SubElement(run, f"{{{WORD_NAMESPACE}}}br")
        SubElement(run, f"{{{WORD_NAMESPACE}}}t", {"{http://www.w3.org/XML/1998/namespace}space": "preserve"}).text = line
    return paragraph


def build_docx(resume):
    document = Element(f"{{{WORD_NAMESPACE}}}document")
    body = SubElement(document, f"{{{WORD_NAMESPACE}}}body")
    data = resume["data"]
    _append_text(body, data["name"] or "Resume", bold=True, size=34)
    if data["title"]:
        _append_text(body, data["title"], bold=True, size=24)
    contact = " | ".join(
        value for value in (
            data["email"], data["phone"], data["location"], data["website"], data["portfolio"]
        ) if value
    )
    if contact:
        _append_text(body, contact)
    for title, field in (
        ("Professional Summary", "summary"),
        ("Key Highlights", "highlights"),
        ("Experience", "experience"),
        ("Education", "education"),
        ("Projects", "projects"),
        ("Certifications", "certificates"),
        ("Skills", "skills"),
        ("Languages", "languages"),
        ("Certificates", "certificates"),
        ("Software", "software"),
        ("Interests", "interests"),
    ):
        value = data.get(field, "")
        section_entries = resume["entries"].get(field, [])
        if not value and not section_entries:
            continue
        _append_text(body, title, bold=True, size=24)
        if value:
            _append_text(body, value)
        for entry in section_entries:
            heading = " — ".join(item for item in (
                entry.get("role") or entry.get("degree") or entry.get("name"),
                entry.get("company") or entry.get("school") or entry.get("issuer"),
            ) if item)
            if heading:
                _append_text(body, heading, bold=True)
            metadata = " | ".join(
                item for item in (entry.get("location"), entry.get("dates")) if item
            )
            if metadata:
                _append_text(body, metadata)
            if entry.get("description"):
                _append_text(body, entry["description"])
    section_properties = SubElement(body, f"{{{WORD_NAMESPACE}}}sectPr")
    SubElement(
        section_properties,
        f"{{{WORD_NAMESPACE}}}pgSz",
        {f"{{{WORD_NAMESPACE}}}w": "11906", f"{{{WORD_NAMESPACE}}}h": "16838"},
    )

    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    relationships = Element(f"{{{PACKAGE_NAMESPACE}}}Relationships")
    SubElement(
        relationships,
        f"{{{PACKAGE_NAMESPACE}}}Relationship",
        {
            "Id": "rId1",
            "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
            "Target": "word/document.xml",
        },
    )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", tostring(relationships, encoding="utf-8", xml_declaration=True))
        archive.writestr("word/document.xml", tostring(document, encoding="utf-8", xml_declaration=True))
    output.seek(0)
    return output
