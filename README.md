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

## Resume templates and premium checkout

The resume builder offers seven layouts: five free templates and two premium
templates (Signature and Editorial). Each premium template costs ₹35 and is
unlocked in the current browser session after Razorpay confirms a captured
payment.

To enable checkout, create Razorpay API keys and configure them in PowerShell
before starting the app. Use test keys while developing; never commit or share
the secret key.

```powershell
$env:RAZORPAY_KEY_ID = "your_razorpay_key_id"
$env:RAZORPAY_KEY_SECRET = "your_razorpay_key_secret"
$env:FLASK_SECRET_KEY = "a-long-random-secret-for-your-app"
.\.venv\Scripts\python.exe RES_Builder.py
```

Keep `FLASK_SECRET_KEY` unchanged between restarts so Flask's signed session
cookie remains valid. For production, use HTTPS and configure these values in
your hosting provider's secret/environment-variable settings. Without Razorpay
keys, all five free templates remain available and paid templates stay locked.
