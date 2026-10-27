# Build Anything

A lightweight Flask tools website with a resume builder, PDF-to-Word converter,
and photo resizer. The resume builder includes a live preview. Your resume
draft is stored in your browser's local storage; its **Download PDF** button
opens the browser's print dialog, where you can save it as a PDF.

## Run on Windows

1. Install Python 3.10 or newer if it is not already installed.
2. Open PowerShell in this project folder and run:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   python RES_Builder.py
   ```

3. Open <http://127.0.0.1:5000> in your browser.

If PowerShell blocks virtual-environment activation, run the install and app
commands using the environment's executable directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe RES_Builder.py
```

Uploads are limited to 20 MB. PDF conversion uses `pdf2docx`, and photo resizing
uses Pillow. Supported photo formats are JPG, PNG, and WebP; the selected
reduction percentage is applied to both image dimensions.

The homepage is in `templates/home.html`. Edit the templates in `templates/`
and `static/style.css` to customize the site.

## Resume template gallery

The resume builder includes five free, editable layouts: Timeless, Plain,
Blogger, Pacific, and General ATS. Each design has a visible gallery preview
that grows by 25% when hovered. Choose a design to open the live resume editor.

## Resume analysis MVP

The resume builder includes a local ATS-readiness checklist and optional job
description keyword comparison. The checklist uses visible criteria for
contact details, resume sections, skills, and evidence of outcomes. The job
comparison uses a basic keyword-frequency heuristic; it is not an ATS
simulation or a guarantee of ranking. Users should only add suggested terms
when they accurately describe their experience.

Resume drafts and the optional job description are stored in browser local
storage. They are not synced between devices or protected by an account. This
MVP does not yet include account registration, a server database, or
AI-generated resume content.
