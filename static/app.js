const defaultEntries = {
  experience: [
    {
      role: "Data Scientist",
      company: "EXL Services",
      location: "Delhi, India",
      dates: "Feb 2022 — Present",
      description: "Developed and deployed ML models for classification and regression.\nWorked on model monitoring and performance tracking.\nBuilt pipelines for data ingestion, processing and model deployment.\nCollaborated with cross-functional teams to deliver business solutions."
    },
    {
      role: "Data Analyst",
      company: "ABC Tech Solutions",
      location: "Delhi, India",
      dates: "Jan 2021 — Jan 2022",
      description: "Performed data analysis and created insightful dashboards.\nWorked with large datasets using SQL and Python.\nSupported business stakeholders with data-driven insights."
    }
  ],
  education: [
    {
      degree: "B.Tech in Computer Science",
      school: "Delhi Technological University",
      location: "Delhi, India",
      dates: "2018 — 2022",
      description: ""
    }
  ],
  projects: [
    { name: "Inventory Optimization & Demand Forecasting", dates: "2024", description: "Built demand forecasting models using XGBoost and ARIMA, reducing inventory costs by 20%." },
    { name: "Model Monitoring Platform", dates: "2023", description: "Developed a model monitoring platform with FastAPI and Docker to track model performance." }
  ],
  certificates: [
    { name: "Claude Foundation", issuer: "Anthropic", dates: "2026" },
    { name: "Machine Learning Specialization", issuer: "Coursera", dates: "2024" }
  ]
};
const defaultHighlights = [
  "4+ years of experience in Data Science and Machine Learning",
  "Expertise in Python, SQL, ML, Deep Learning, and NLP",
  "Experience in end-to-end model development and deployment",
  "Strong problem-solving and analytical skills"
];

const entrySuggestions = {
  roles: [
    "Account Manager", "Accountant", "Administrative Assistant", "Android Developer", "AI Engineer",
    "Architect", "Business Analyst", "Business Development Manager", "Cloud Engineer", "Content Writer",
    "Customer Success Manager", "Cybersecurity Analyst", "Data Analyst", "Data Engineer", "Data Scientist",
    "Database Administrator", "DevOps Engineer", "Digital Marketing Manager", "Electrical Engineer",
    "Finance Manager", "Financial Analyst", "Frontend Developer", "Full Stack Developer", "Graphic Designer",
    "HR Business Partner", "HR Manager", "IT Support Engineer", "iOS Developer", "Java Developer",
    "Machine Learning Engineer", "Marketing Manager", "Mechanical Engineer", "Operations Manager",
    "Product Designer", "Product Manager", "Project Manager", "QA Engineer", "Recruiter",
    "Research Analyst", "Sales Executive", "Sales Manager", "SEO Specialist", "Software Developer",
    "Software Engineer", "Solutions Architect", "Supply Chain Analyst", "Technical Lead", "UX Designer",
    "UX Researcher", "Web Developer"
  ],
  companies: [
    "Accenture", "Adobe", "Airbnb", "Amazon", "American Express", "Atlassian", "BCG", "Capgemini",
    "Cisco", "Cognizant", "Deloitte", "DHL", "Flipkart", "Freshworks", "Goldman Sachs", "Google",
    "HCLTech", "IBM", "Infosys", "Intel", "JP Morgan", "KPMG", "L&T", "LinkedIn", "Mahindra",
    "Mastercard", "Meta", "Microsoft", "Mphasis", "Netflix", "Oracle", "PayPal", "PhonePe", "PwC",
    "Razorpay", "Salesforce", "Samsung", "ServiceNow", "Shopify", "Spotify", "Swiggy", "TCS",
    "Tech Mahindra", "Tata Motors", "Target", "Uber", "Walmart", "Wipro", "Zoho"
  ],
  locations: [
    "Ahmedabad, India", "Amritsar, India", "Atlanta, United States", "Austin, United States",
    "Bengaluru, India", "Bhopal, India", "Boston, United States", "Bhubaneswar, India",
    "Chandigarh, India", "Chennai, India", "Chicago, United States", "Coimbatore, India",
    "Delhi, India", "Dubai, UAE", "Gurugram, India", "Guwahati, India", "Hyderabad, India",
    "Indore, India", "Jaipur, India", "Kochi, India", "Kolkata, India", "London, United Kingdom",
    "Los Angeles, United States", "Lucknow, India", "Madurai, India", "Manchester, United Kingdom",
    "Mangaluru, India", "Melbourne, Australia", "Miami, United States", "Mumbai, India",
    "Mysuru, India", "Nagpur, India", "Nashik, India", "New York, United States",
    "Noida, India", "Patna, India", "Pune, India", "Remote", "San Francisco, United States",
    "Seattle, United States", "Singapore", "Surat, India", "Thiruvananthapuram, India",
    "Toronto, Canada", "Vadodara, India", "Visakhapatnam, India", "Work from home"
  ],
  degrees: [
    "Associate Degree", "Bachelor of Arts (BA)", "Bachelor of Business Administration (BBA)",
    "Bachelor of Commerce (BCom)", "Bachelor of Computer Applications (BCA)",
    "Bachelor of Engineering (BE)", "Bachelor of Science (BSc)", "Bachelor of Technology (BTech)",
    "Chartered Accountancy (CA)", "Diploma", "Doctor of Philosophy (PhD)",
    "Master of Arts (MA)", "Master of Business Administration (MBA)",
    "Master of Computer Applications (MCA)", "Master of Commerce (MCom)",
    "Master of Science (MSc)", "Master of Technology (MTech)", "Secondary School Certificate",
    "Higher Secondary Certificate", "Vocational Certificate"
  ],
  schools: [
    "Amity University", "Anna University", "Delhi University", "IIT Bombay", "IIT Delhi",
    "IIT Madras", "IIT Kanpur", "IIT Kharagpur", "IIT Roorkee", "IIM Ahmedabad", "IIM Bangalore",
    "IIM Calcutta", "IIM Lucknow", "Manipal Academy of Higher Education", "Mumbai University",
    "National Institute of Technology", "Savitribai Phule Pune University", "University of Hyderabad"
  ]
};

const form = document.querySelector("#resume-form");
const status = document.querySelector("#save-status");
const resumeStorage = window.ResumeDraftStorage;
const shareLinkKey = `forma-resume-share-link-${document.body.dataset.userId}`;
const resumeTitleInput = document.querySelector("#resume-title");
const importDraftButton = document.querySelector("#import-browser-draft");
const defaults = Object.fromEntries(new FormData(form).entries());
let persistedResumeId = /^\d+$/.test(document.body.dataset.resumeId || "")
  ? Number(document.body.dataset.resumeId)
  : null;
let persistedVersion = null;
let changeSequence = 0;
let saveInProgress = false;
let saveAgain = false;
let serverUnsaved = false;
let entries = structuredClone(defaultEntries);
let appearance = {
  theme: "#3159b7",
  layout: "single",
  font: "modern",
  sections: {
    summary: true, highlights: true, experience: true, education: true, skills: true,
    projects: true, languages: true, certificates: true, software: true, interests: true
  },
  photo: ""
};
let zoom = 100;
let saveTimer;
let activeSuggestion = { target: null, entryIndex: null };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function readForm() {
  return Object.fromEntries(new FormData(form).entries());
}

function toDateInputValue(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value;
  const match = /^(\d{2})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const shortYear = Number(match[3]);
  const year = shortYear < 70 ? 2000 + shortYear : 1900 + shortYear;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${match[2]}-${match[1]}`;
}

function formatResumeDate(value) {
  const isoDate = toDateInputValue(value);
  if (!isoDate) return value || "";
  const [year, month, day] = isoDate.split("-");
  return `${day}-${month}-${year.slice(-2)}`;
}

function renderSuggestionLists() {
  for (const [key, suggestions] of Object.entries(entrySuggestions)) {
    const datalist = document.createElement("datalist");
    datalist.id = `${key}-suggestions`;
    for (const suggestion of [...suggestions, "Other (type your own)"]) {
      const option = document.createElement("option");
      option.value = suggestion;
      datalist.append(option);
    }
    document.body.append(datalist);
  }
}

function renderEntries(type) {
  const list = document.querySelector(`#${type}-list`);
  const isExperience = type === "experience";
  const fields = isExperience
    ? [
      ["role", "Job title", "roles", "text"],
      ["company", "Company", "companies", "text"],
      ["location", "Location", "locations", "text"],
      ["dates", "Date", "", "date"],
      ["description", "What did you accomplish?", "", "textarea"]
    ]
    : type === "education"
    ? [
      ["degree", "Degree / course", "degrees", "text"],
      ["school", "School", "schools", "text"],
      ["location", "Location", "locations", "text"],
      ["dates", "Date", "", "date"],
      ["description", "Additional details", "", "textarea"]
    ]
    : type === "projects"
    ? [
      ["name", "Project name", "", "text"],
      ["dates", "Year", "", "text"],
      ["description", "What did you build?", "", "textarea"]
    ]
    : [
      ["name", "Certification", "", "text"],
      ["issuer", "Issuing organization", "", "text"],
      ["dates", "Year", "", "text"]
    ];

  list.innerHTML = entries[type].map((entry, index) => `
    <div class="entry-card" data-entry-type="${type}" data-entry-index="${index}">
      <div class="entry-card-top"><span>${escapeHtml(entry[isExperience ? "role" : type === "education" ? "degree" : "name"] || `New ${type.slice(0, -1)}`)}</span>
        <button class="remove-entry" type="button" aria-label="Remove ${type} entry" data-remove="${index}">×</button>
      </div>
      <div class="entry-fields">
        ${fields.map(([key, label, suggestionKey, fieldType]) => {
          const fieldId = `${type}-${index}-${key}`;
          if (fieldType === "textarea") {
            return `<label class="field entry-description" for="${fieldId}">${label}
              <textarea id="${fieldId}" data-key="${key}" rows="3" placeholder="${label}">${escapeHtml(entry[key] || "")}</textarea>
            </label>`;
          }
          if (fieldType === "date") {
            const legacyDate = entry[key] && !toDateInputValue(entry[key]);
            return `<label class="field entry-date-field" for="${fieldId}">${label}
              <div class="date-field-control">
                <input id="${fieldId}" type="text" data-key="${key}" value="${escapeHtml(formatResumeDate(entry[key]))}" placeholder="DD-MM-YY" aria-describedby="${fieldId}-hint" inputmode="numeric">
                <button class="date-picker-button" type="button" data-open-date-picker aria-label="Choose ${label.toLowerCase()} from calendar">▦</button>
                <input class="date-picker-input" type="date" data-date-picker="${fieldId}" tabindex="-1" aria-hidden="true">
              </div>
              <small id="${fieldId}-hint" class="field-hint">${legacyDate
                ? `Saved date text retained. Enter DD-MM-YY or choose a calendar date.`
                : "Enter DD-MM-YY or choose a calendar date."}</small>
            </label>`;
          }
          return `<label class="field" for="${fieldId}">${label}
            <input id="${fieldId}" data-key="${key}" data-suggestion="${suggestionKey}" list="${suggestionKey}-suggestions" value="${escapeHtml(entry[key] || "")}" placeholder="Search or type your own">
          </label>`;
        }).join("")}
      </div>
    </div>`).join("");

  list.querySelectorAll(".entry-card").forEach((card) => {
    card.addEventListener("input", (event) => {
      const { entryIndex, entryType } = card.dataset;
      const key = event.target.dataset.key;
      if (!key) return;
      const value = event.target.value === "Other (type your own)" ? "" : event.target.value;
      if (event.target.value === "Other (type your own)") {
        event.target.value = "";
        event.target.placeholder = "Type your own value";
      }
      entries[entryType][Number(entryIndex)][key] = value;
      if (key === "dates") {
        const picker = card.querySelector(`[data-date-picker="${event.target.id}"]`);
        const parsedDate = toDateInputValue(value);
        picker.value = parsedDate;
        const hint = card.querySelector(`#${event.target.id}-hint`);
        const invalidDate = value && !parsedDate;
        event.target.setAttribute("aria-invalid", String(Boolean(invalidDate)));
        hint.textContent = invalidDate
          ? "Enter a valid date as DD-MM-YY or choose a calendar date."
          : value ? `Resume date: ${formatResumeDate(value)} · DD-MM-YY` : "Enter DD-MM-YY or choose a calendar date.";
      }
      renderPreview();
      if (key === "role" || key === "degree" || key === "name") {
        const title = card.querySelector(".entry-card-top span");
        title.textContent = value || (entryType === "experience" ? "New position" : entryType === "education" ? "New education" : `New ${entryType.slice(0, -1)}`);
      }
      scheduleSave();
      refreshAnalysisIfVisible();
    });
  });
  list.querySelectorAll("[data-open-date-picker]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".entry-card");
      const picker = card.querySelector("[data-date-picker]");
      if (typeof picker.showPicker === "function") picker.showPicker();
      else picker.click();
    });
  });
  list.querySelectorAll("[data-date-picker]").forEach((picker) => {
    picker.addEventListener("change", () => {
      const card = picker.closest(".entry-card");
      const dateInput = card.querySelector(`#${picker.dataset.datePicker}`);
      dateInput.value = formatResumeDate(picker.value);
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  list.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      entries[type].splice(Number(button.dataset.remove), 1);
      renderEntries(type);
      renderPreview();
      scheduleSave();
      refreshAnalysisIfVisible();
    });
  });
}

function renderPreview() {
  const data = readForm();
  document.querySelectorAll("[data-preview]").forEach((element) => {
    const value = data[element.dataset.preview]?.trim();
    element.textContent = value || "";
    element.hidden = !value;
  });
  document.querySelector('[data-preview="summary"]').textContent = data.summary.trim();
  document.querySelector("#preview-experience").innerHTML = entries.experience.map((entry) => `
    <div class="resume-entry">
      <div class="resume-entry-heading"><strong>${escapeHtml(entry.role || "")}</strong><span class="resume-entry-date">${escapeHtml(formatResumeDate(entry.dates))}</span></div>
      <p class="resume-entry-subtitle">${escapeHtml([entry.company, entry.location].filter(Boolean).join(" · "))}</p>
      ${entry.description ? `<ul class="resume-entry-bullets">${entry.description.split(/\n+/).map((bullet) => bullet.trim()).filter(Boolean).map((bullet) => `<li>${escapeHtml(bullet.replace(/^[-•]\s*/, ""))}</li>`).join("")}</ul>` : ""}
    </div>`).join("");
  document.querySelector("#preview-education").innerHTML = entries.education.map((entry) => `
    <div class="resume-entry">
      <div class="resume-entry-heading"><strong>${escapeHtml(entry.degree || "")}</strong><span class="resume-entry-date">${escapeHtml(formatResumeDate(entry.dates))}</span></div>
      <p class="resume-entry-subtitle">${escapeHtml([entry.school, entry.location].filter(Boolean).join(" · "))}</p>
      ${entry.description ? `<p class="resume-entry-description">${escapeHtml(entry.description)}</p>` : ""}
    </div>`).join("");
  document.querySelector("#preview-projects").innerHTML = entries.projects.map((entry) => `
    <div class="resume-entry">
      <div class="resume-entry-heading"><strong>${escapeHtml(entry.name || "")}</strong><span class="resume-entry-date">${escapeHtml(entry.dates || "")}</span></div>
      ${entry.description ? `<ul class="resume-entry-bullets">${entry.description.split(/\n+/).map((bullet) => bullet.trim()).filter(Boolean).map((bullet) => `<li>${escapeHtml(bullet.replace(/^[-•]\s*/, ""))}</li>`).join("")}</ul>` : ""}
    </div>`).join("");
  document.querySelector("#preview-certificates").innerHTML = entries.certificates.map((entry) =>
    `<span class="resume-certificate"><strong>${escapeHtml(entry.name || "")}</strong><small>${escapeHtml([entry.issuer, entry.dates].filter(Boolean).join(" · "))}</small></span>`
  ).join("");
  const highlights = data.highlights.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  document.querySelector("#preview-highlights").innerHTML = highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  document.querySelector('[data-resume-section="highlights"]').hidden =
    !highlights.length || !appearance.sections.highlights;
  document.querySelector("#summary-count").textContent = String(data.summary.length);
  document.querySelector("#resume-photo").src = appearance.photo || "";
  document.querySelector("#resume-photo").hidden = !appearance.photo;
  document.querySelector("#resume-photo-placeholder").hidden = Boolean(appearance.photo);
  document.querySelector("#profile-photo-preview").src = appearance.photo || "";
  document.querySelector("#profile-photo-preview").hidden = !appearance.photo;
  document.querySelector("#profile-photo-placeholder").hidden = Boolean(appearance.photo);
  const skills = data.skills.split(",").map((skill) => skill.trim()).filter(Boolean);
  const skillPreview = document.querySelector("#preview-skills");
  const usesSkillBars = ["moon", "max", "social", "shelah"].some((templateId) =>
    document.querySelector("#resume-preview").classList.contains(`template-${templateId}`)
  );
  skillPreview.innerHTML = skills.map((skill, index) => usesSkillBars
    ? `<span class="skill-bar-item">${escapeHtml(skill)}<span class="skill-bar"><i style="--skill-level:${[88, 78, 72, 84, 67, 76, 80, 70][index % 8]}%"></i></span></span>`
    : `<span class="skill-chip">${escapeHtml(skill)}</span>`).join("");
  renderPreviewList("#preview-languages", "#languages-section", data.languages);
  renderPreviewList("#preview-software", "#software-section", data.software);
  renderPreviewList("#preview-interests", "#interests-section", data.interests);
  applyAppearance();
  updateCompleteness(data);
}

function applyAppearance() {
  const preview = document.querySelector("#resume-preview");
  preview.style.setProperty("--resume-accent", appearance.theme);
  preview.classList.toggle("layout-sidebar", appearance.layout === "sidebar");
  preview.classList.toggle("font-classic", appearance.font === "classic");
  preview.classList.toggle("font-compact", appearance.font === "compact");
  for (const [section, visible] of Object.entries(appearance.sections)) {
    const element = document.querySelector(`[data-resume-section="${section}"]`);
    const control = document.querySelector(`[data-section="${section}"]`);
    if (element) element.hidden = !visible;
    if (control) control.checked = visible;
  }
  document.querySelectorAll(".theme-swatch").forEach((swatch) => {
    swatch.classList.toggle("active", swatch.dataset.theme === appearance.theme);
  });
  document.querySelector("#resume-layout").value = appearance.layout;
  document.querySelector("#resume-font").value = appearance.font;
}

function saveAppearance() {
  scheduleSave();
}

function renderPreviewList(listSelector, sectionSelector, value) {
  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  const section = document.querySelector(sectionSelector);
  section.hidden = values.length === 0;
  document.querySelector(listSelector).innerHTML = values
    .map((item) => `<span class="skill-chip">${escapeHtml(item)}</span>`)
    .join("");
}

function renderHighlights() {
  const list = document.querySelector("#highlights-list");
  const values = (form.elements.namedItem("highlights").value || "").split(/\n+/);
  list.innerHTML = values.map((value, index) => `
    <label class="highlight-editor-row">
      <span aria-hidden="true">⠿</span>
      <input type="text" value="${escapeHtml(value.trim())}" data-highlight-index="${index}" aria-label="Key highlight ${index + 1}">
      <button type="button" class="remove-entry" data-remove-highlight="${index}" aria-label="Remove key highlight">▤</button>
    </label>
  `).join("");
  list.querySelectorAll("[data-highlight-index]").forEach((input) => {
    input.addEventListener("input", () => {
      const current = [...list.querySelectorAll("[data-highlight-index]")].map((item) => item.value.trim());
      form.elements.namedItem("highlights").value = current.join("\n");
      renderPreview();
      scheduleSave();
    });
  });
  list.querySelectorAll("[data-remove-highlight]").forEach((button) => {
    button.addEventListener("click", () => {
      const values = form.elements.namedItem("highlights").value.split(/\n+/);
      values.splice(Number(button.dataset.removeHighlight), 1);
      form.elements.namedItem("highlights").value = values.filter(Boolean).join("\n");
      renderHighlights();
      renderPreview();
      scheduleSave();
    });
  });
}

function updateCompleteness(data) {
  const checks = [
    Boolean(data.name.trim()), Boolean(data.title.trim()), Boolean(data.email.trim()),
    Boolean(data.summary.trim()), entries.experience.some((item) => item.role.trim() && item.company.trim()),
    entries.education.some((item) => item.degree.trim() && item.school.trim()), Boolean(data.skills.trim())
  ];
  const percentage = Math.round(checks.filter(Boolean).length / checks.length * 100);
  document.querySelector("#completion-label").textContent = `${percentage}%`;
  document.querySelector("#completion-bar").style.width = `${percentage}%`;
}

function saveDraft() {
  const draft = {
    data: readForm(),
    entries,
    jobDescription: document.querySelector("#job-description").value,
    appearance,
    templateName: document.body.dataset.templateName || "Modern Pro",
    title: resumeTitleInput.value.trim(),
    updatedAt: new Date().toISOString()
  };
  let localSaved = false;
  try {
    resumeStorage.saveDraft(draft);
    localSaved = true;
  } catch (error) {
    console.error("Unable to save resume draft to this browser.", error);
  }
  if (persistedResumeId) {
    saveResumeToAccount();
  } else {
    status.textContent = localSaved
      ? "Browser draft saved — not yet saved to your account"
      : "Could not save browser draft";
  }
}

function scheduleSave() {
  changeSequence += 1;
  serverUnsaved = true;
  status.textContent = "Saving…";
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveDraft, 350);
}

function applyResumeContent(content) {
  if (!content || typeof content !== "object" || !content.data || !content.entries) {
    throw new Error("The saved resume has an invalid format.");
  }
  for (const [name, value] of Object.entries(content.data)) {
    const field = form.elements.namedItem(name);
    if (field && typeof value === "string") field.value = value;
  }
  for (const type of ["experience", "education", "projects", "certificates"]) {
    if (Array.isArray(content.entries[type])) {
      entries[type] = content.entries[type].filter((entry) => entry && typeof entry === "object").map((entry) =>
        Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, String(value ?? "")])));
    }
  }
  if (typeof content.jobDescription === "string") {
    document.querySelector("#job-description").value = content.jobDescription;
  }
  const savedAppearance = content.appearance;
  if (savedAppearance && typeof savedAppearance === "object") {
    if (typeof savedAppearance.theme === "string" && /^#[\da-f]{6}$/i.test(savedAppearance.theme)) {
      appearance.theme = savedAppearance.theme;
    }
    if (["single", "sidebar"].includes(savedAppearance.layout)) {
      appearance.layout = savedAppearance.layout;
    }
    if (["modern", "classic", "compact"].includes(savedAppearance.font)) {
      appearance.font = savedAppearance.font;
    }
    const photo = savedAppearance.photo || content.profilePhoto;
    if (typeof photo === "string" &&
      /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo) &&
      photo.length <= 2_800_000) {
      appearance.photo = photo;
    }
    if (savedAppearance.sections && typeof savedAppearance.sections === "object") {
      for (const section of Object.keys(appearance.sections)) {
        if (typeof savedAppearance.sections[section] === "boolean") {
          appearance.sections[section] = savedAppearance.sections[section];
        }
      }
    }
  } else if (typeof content.profilePhoto === "string" &&
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(content.profilePhoto) &&
    content.profilePhoto.length <= 2_800_000) {
    appearance.photo = content.profilePhoto;
  }
}

function loadDraft() {
  try {
    const draft = resumeStorage.readDraft();
    if (!draft || typeof draft !== "object") return false;
    applyResumeContent(draft);
    if (typeof draft.title === "string" && draft.title.trim()) {
      resumeTitleInput.value = draft.title;
    } else if (draft.data.name?.trim()) {
      resumeTitleInput.value = `${draft.data.name.trim()} Resume`;
    }
    return true;
  } catch (error) {
    status.textContent = "Could not load saved draft";
    console.error("Unable to load resume draft from this browser.", error);
    return false;
  }
}

function accountResumePayload() {
  const data = readForm();
  const enteredTitle = resumeTitleInput.value.trim();
  const title = !enteredTitle || enteredTitle === "Untitled resume"
    ? (data.name.trim() ? `${data.name.trim()} Resume` : "Untitled resume")
    : enteredTitle;
  const savedAppearance = { ...appearance };
  delete savedAppearance.photo;
  return {
    title,
    templateId: document.body.dataset.templateId,
    content: {
      ...resumePayload(),
      jobDescription: document.querySelector("#job-description").value,
      appearance: savedAppearance
    }
  };
}

async function saveResumeToAccount() {
  if (saveInProgress) {
    saveAgain = true;
    return;
  }
  saveInProgress = true;
  const savedSequence = changeSequence;
  status.textContent = "Saving to your account…";
  const isNew = !persistedResumeId;
  const payload = accountResumePayload();
  if (!isNew) payload.version = persistedVersion;
  try {
    const response = await fetch(
      isNew ? "/api/resumes" : `/api/resumes/${persistedResumeId}`,
      {
        method: isNew ? "POST" : "PUT",
        headers: csrfHeaders(),
        body: JSON.stringify(payload)
      }
    );
    if (!response.ok) throw new Error(await responseError(response));
    const saved = await response.json();
    persistedResumeId = saved.id;
    persistedVersion = saved.version;
    document.body.dataset.resumeId = String(saved.id);
    document.body.dataset.templateId = saved.templateId;
    document.body.dataset.templateName = saved.templateName;
    if (changeSequence === savedSequence) resumeTitleInput.value = saved.title;
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("resume", String(saved.id));
    window.history.replaceState({}, "", currentUrl);
    importDraftButton.hidden = true;
    serverUnsaved = changeSequence !== savedSequence;
    status.textContent = serverUnsaved ? "Saving recent changes…" : "Saved to your account";
  } catch (error) {
    serverUnsaved = true;
    status.textContent = responseStatusMessage(error);
    console.error("Unable to save resume to the account.", error);
  } finally {
    saveInProgress = false;
    if (saveAgain || changeSequence !== savedSequence) {
      saveAgain = false;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(saveDraft, 350);
    }
  }
}

function responseStatusMessage(error) {
  if (/Please sign in again|401/.test(error.message || "")) {
    return "Your session expired. Sign in again; this browser draft is preserved.";
  }
  if (/changed elsewhere|409/.test(error.message || "")) {
    return "This resume changed elsewhere. Reload it before saving again.";
  }
  return error.message || "Could not save to your account";
}

function renderLoadedResume() {
  renderSuggestionLists();
  for (const type of ["experience", "education", "projects", "certificates"]) {
    renderEntries(type);
  }
  renderHighlights();
  renderPreview();
}

async function loadAccountResume() {
  if (!persistedResumeId) {
    try {
      const hasCurrentDraft = resumeStorage.hasCurrentDraft();
      const hasLegacyDraft = resumeStorage.hasLegacyDraft();
      importDraftButton.hidden = !(hasCurrentDraft || hasLegacyDraft);
      const loaded = loadDraft();
      status.textContent = loaded
        ? "Browser draft loaded — not yet saved to your account"
        : "New resume — changes stay in this browser until saved";
      renderLoadedResume();
    } catch (error) {
      status.textContent = "Browser storage is unavailable; save to your account.";
      console.error("Unable to inspect browser draft storage.", error);
    }
    return;
  }
  status.textContent = "Loading from your account…";
  const editorWorkspace = document.querySelector(".editor-app");
  const saveButton = document.querySelector("#save-resume-button");
  editorWorkspace.inert = true;
  saveButton.disabled = true;
  try {
    const response = await fetch(`/api/resumes/${persistedResumeId}`);
    if (!response.ok) throw new Error(await responseError(response));
    const saved = await response.json();
    persistedVersion = saved.version;
    document.body.dataset.templateId = saved.templateId;
    document.body.dataset.templateName = saved.templateName || document.body.dataset.templateName;
    resumeTitleInput.value = saved.title;
    applyResumeContent(saved.content);
    status.textContent = "Saved to your account";
    renderLoadedResume();
  } catch (error) {
    status.textContent = responseStatusMessage(error);
    console.error("Unable to load resume from the account.", error);
  } finally {
    editorWorkspace.inert = false;
    saveButton.disabled = false;
  }
}

document.querySelector("#add-experience").addEventListener("click", () => {
  entries.experience.push({ role: "", company: "", location: "", dates: "", description: "" });
  renderEntries("experience");
  renderPreview();
  scheduleSave();
  refreshAnalysisIfVisible();
});
document.querySelector("#add-education").addEventListener("click", () => {
  entries.education.push({ degree: "", school: "", location: "", dates: "", description: "" });
  renderEntries("education");
  renderPreview();
  scheduleSave();
  refreshAnalysisIfVisible();
});
document.querySelector("#add-project").addEventListener("click", () => {
  entries.projects.push({ name: "", dates: "", description: "" });
  renderEntries("projects");
  renderPreview();
  scheduleSave();
});
document.querySelector("#add-certificate").addEventListener("click", () => {
  entries.certificates.push({ name: "", issuer: "", dates: "" });
  renderEntries("certificates");
  renderPreview();
  scheduleSave();
});
document.querySelector("#add-highlight").addEventListener("click", () => {
  const field = form.elements.namedItem("highlights");
  field.value = [...field.value.split(/\n+/).filter(Boolean), ""].join("\n");
  renderHighlights();
  const inputs = document.querySelectorAll("[data-highlight-index]");
  inputs[inputs.length - 1]?.focus();
});
document.querySelector("#profile-photo-input").addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
    window.alert("Choose a JPG, PNG, or WebP photo under 2 MB.");
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    appearance.photo = String(reader.result);
    renderPreview();
    scheduleSave();
  });
  reader.addEventListener("error", () => window.alert("We couldn't read this photo. Please try another file."));
  reader.readAsDataURL(file);
});
form.addEventListener("input", () => {
  renderPreview();
  if (document.activeElement?.name === "highlights") renderHighlights();
  scheduleSave();
  refreshAnalysisIfVisible();
});
const downloadButton = document.querySelector("#download-button");
const downloadOptions = document.querySelector("#download-options");
downloadButton.addEventListener("click", () => {
  const isOpen = !downloadOptions.hidden;
  downloadOptions.hidden = isOpen;
  downloadButton.setAttribute("aria-expanded", String(!isOpen));
});
document.querySelector("#download-pdf").addEventListener("click", () => {
  downloadOptions.hidden = true;
  downloadButton.setAttribute("aria-expanded", "false");
  window.print();
});
document.querySelector("#download-docx").addEventListener("click", downloadDocx);
document.querySelector("#share-button").addEventListener("click", () => createShareLink());
document.querySelector("#refresh-share-link").addEventListener("click", () => createShareLink(true));
document.querySelector("#copy-share-link").addEventListener("click", copyShareLink);
document.querySelector("#revoke-share-link").addEventListener("click", revokeShareLink);
document.querySelectorAll(".theme-swatch").forEach((button) => {
  button.addEventListener("click", () => {
    appearance.theme = button.dataset.theme;
    applyAppearance();
    saveAppearance();
  });
});
document.querySelector("#resume-layout").addEventListener("change", (event) => {
  appearance.layout = event.target.value;
  applyAppearance();
  saveAppearance();
});
document.querySelector("#resume-font").addEventListener("change", (event) => {
  appearance.font = event.target.value;
  applyAppearance();
  saveAppearance();
});
document.querySelectorAll("[data-section]").forEach((control) => {
  control.addEventListener("change", () => {
    appearance.sections[control.dataset.section] = control.checked;
    applyAppearance();
    saveAppearance();
  });
});
document.querySelectorAll("[data-assist]").forEach((button) => {
  button.addEventListener("click", () => runWritingAssistant(button.dataset.assist));
});
document.querySelector("#view-analysis-button").addEventListener("click", () => {
  analyzeResume();
  document.querySelector("#analysis-card").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#cover-letter-button").addEventListener("click", createCoverLetterDraft);
document.querySelector("#success-cover-letter").addEventListener("click", () => {
  document.querySelector("#download-success-dialog").close();
  createCoverLetterDraft();
});
document.querySelector("#success-optimize").addEventListener("click", () => {
  document.querySelector("#download-success-dialog").close();
  optimizeForJob();
});
document.querySelector("#copy-suggestion").addEventListener("click", copySuggestion);
document.querySelector("#apply-suggestion").addEventListener("click", applySuggestion);
window.addEventListener("afterprint", () => document.querySelector("#download-success-dialog").showModal());
document.querySelector("#job-description").addEventListener("input", () => {
  scheduleSave();
  refreshAnalysisIfVisible();
});
resumeTitleInput.addEventListener("input", scheduleSave);
document.querySelector("#save-resume-button").addEventListener("click", () => {
  window.clearTimeout(saveTimer);
  saveDraft();
  saveResumeToAccount();
});
importDraftButton.addEventListener("click", async () => {
  if (persistedResumeId) return;
  try {
    if (!resumeStorage.hasCurrentDraft()) {
      if (!resumeStorage.hasLegacyDraft()) {
        throw new Error("No browser draft is available to import.");
      }
      const confirmed = window.confirm(
        "This legacy draft has no account ownership information. Import it only if you know it belongs to your account."
      );
      if (!confirmed) return;
      resumeStorage.importLegacyDraft();
    }
    if (!loadDraft()) throw new Error("The browser draft could not be loaded.");
    renderLoadedResume();
    changeSequence += 1;
    serverUnsaved = true;
    window.clearTimeout(saveTimer);
    saveDraft();
    await saveResumeToAccount();
  } catch (error) {
    status.textContent = error.message || "Could not import the browser draft";
    console.error("Unable to import the browser resume draft.", error);
  }
});
window.addEventListener("beforeunload", (event) => {
  if (!serverUnsaved) return;
  event.preventDefault();
  event.returnValue = "";
});
document.querySelector("#analyze-button").addEventListener("click", analyzeResume);
document.querySelector("#reset-button").addEventListener("click", () => {
  if (!window.confirm("Reset this editor to its starter content? Saved account resumes will be updated.")) return;
  form.reset();
  for (const [name, value] of Object.entries(defaults)) form.elements.namedItem(name).value = value;
  resumeTitleInput.value = "Untitled resume";
  entries = structuredClone(defaultEntries);
  renderHighlights();
  document.querySelector("#job-description").value = "";
  appearance = {
    theme: "#3159b7",
    layout: "single",
    font: "modern",
    sections: {
      summary: true, highlights: true, experience: true, education: true, skills: true,
      projects: true, languages: true, certificates: true, software: true, interests: true
    },
    photo: ""
  };
  document.querySelector("#analysis-results").hidden = true;
  document.querySelector("#ats-score-value").innerHTML = "—<small>/ 100</small>";
  document.querySelector("#ats-mini-checks").textContent = "Run your resume check to see feedback.";
  renderEntries("experience");
  renderEntries("education");
  renderEntries("projects");
  renderEntries("certificates");
  renderPreview();
  scheduleSave();
});
document.querySelector("#zoom-in").addEventListener("click", () => changeZoom(10));
document.querySelector("#zoom-out").addEventListener("click", () => changeZoom(-10));

function changeZoom(amount) {
  zoom = Math.max(70, Math.min(120, zoom + amount));
  document.querySelector("#zoom-label").textContent = `${zoom}%`;
  document.querySelector("#resume-preview").style.zoom = `${zoom}%`;
}

function resumePayload() {
  return { data: readForm(), entries, profilePhoto: appearance.photo };
}

function csrfHeaders() {
  return {
    "Content-Type": "application/json",
    "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
  };
}

async function responseError(response) {
  try {
    const body = await response.json();
    return body.error || `Request failed (${response.status}).`;
  } catch (error) {
    console.error("Could not read the server error response.", error);
    return `Request failed (${response.status}).`;
  }
}

async function downloadDocx() {
  downloadOptions.hidden = true;
  downloadButton.setAttribute("aria-expanded", "false");
  status.textContent = "Preparing DOCX…";
  try {
    const response = await fetch("/api/resume/export/docx", {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify(resumePayload())
    });
    if (!response.ok) throw new Error(await responseError(response));
    const file = await response.blob();
    const fileUrl = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = `${readForm().name.trim().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "") || "resume"}.docx`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(fileUrl);
    status.textContent = "DOCX downloaded";
    document.querySelector("#download-success-dialog").showModal();
  } catch (error) {
    status.textContent = "DOCX download failed";
    window.alert(error.message || "We couldn't create the DOCX. Please try again.");
  }
}

let activeShareToken = "";
let activeShareUrl = "";

function loadShareLink() {
  try {
    const savedUrl = localStorage.getItem(shareLinkKey);
    if (!savedUrl) return;
    const parsedUrl = new URL(savedUrl, window.location.href);
    if (parsedUrl.origin !== window.location.origin || !/^\/resume\/shared\/[A-Za-z0-9_-]+$/.test(parsedUrl.pathname)) {
      localStorage.removeItem(shareLinkKey);
      return;
    }
    activeShareUrl = parsedUrl.href;
    activeShareToken = parsedUrl.pathname.split("/").pop();
  } catch (error) {
    console.error("Unable to load the saved share link.", error);
  }
}

function persistShareLink(url) {
  try {
    localStorage.setItem(shareLinkKey, url);
    return true;
  } catch (error) {
    console.error("Unable to save the share link in this browser.", error);
    return false;
  }
}

async function createShareLink(replaceExisting = false) {
  const dialog = document.querySelector("#share-dialog");
  const feedback = document.querySelector("#share-feedback");
  if (activeShareUrl && !replaceExisting) {
    document.querySelector("#share-link").value = activeShareUrl;
    document.querySelector("#refresh-share-link").hidden = false;
    document.querySelector("#revoke-share-link").hidden = false;
    feedback.textContent = "This link shows the previously shared version. Update it to share your latest changes.";
    dialog.showModal();
    return;
  }
  feedback.textContent = "Creating your private link…";
  try {
    const response = await fetch("/api/resume/share", {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify(resumePayload())
    });
    if (!response.ok) throw new Error(await responseError(response));
    const result = await response.json();
    const link = document.querySelector("#share-link");
    link.value = result.url;
    activeShareUrl = result.url;
    activeShareToken = new URL(result.url).pathname.split("/").pop();
    document.querySelector("#revoke-share-link").hidden = false;
    document.querySelector("#refresh-share-link").hidden = false;
    feedback.textContent = persistShareLink(result.url)
      ? "Anyone with this link can view this saved version."
      : "Link created, but browser storage is unavailable. Save or copy this link to manage it later.";
    dialog.showModal();
  } catch (error) {
    feedback.textContent = error.message || "We couldn't create a share link.";
    dialog.showModal();
  }
}

async function copyShareLink() {
  const feedback = document.querySelector("#share-feedback");
  try {
    await navigator.clipboard.writeText(document.querySelector("#share-link").value);
    feedback.textContent = "Link copied to clipboard.";
  } catch (error) {
    feedback.textContent = "Copy was blocked by the browser. Select the link and copy it manually.";
    console.error("Unable to copy the resume share link.", error);
  }
}

async function revokeShareLink() {
  const feedback = document.querySelector("#share-feedback");
  if (!activeShareToken) {
    feedback.textContent = "Create a new link to manage sharing.";
    return;
  }
  try {
    const response = await fetch(`/api/resume/share/${encodeURIComponent(activeShareToken)}`, {
      method: "DELETE",
      headers: { "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content }
    });
    if (!response.ok) throw new Error(await responseError(response));
    document.querySelector("#share-link").value = "";
    document.querySelector("#revoke-share-link").hidden = true;
    document.querySelector("#refresh-share-link").hidden = true;
    activeShareToken = "";
    activeShareUrl = "";
    localStorage.removeItem(shareLinkKey);
    feedback.textContent = "Share link disabled. It can no longer be viewed.";
  } catch (error) {
    feedback.textContent = error.message || "We couldn't disable this link.";
  }
}

function openAssistantDialog(title, description, text, target, entryIndex = null) {
  activeSuggestion = { target, entryIndex };
  document.querySelector("#assistant-dialog-title").textContent = title;
  document.querySelector("#assistant-dialog-description").textContent = description;
  document.querySelector("#assistant-suggestion").value = text;
  document.querySelector("#assistant-feedback").textContent = "";
  document.querySelector("#apply-suggestion").textContent = target === "cover-letter"
    ? "Download draft"
    : "Apply suggestion";
  document.querySelector("#assistant-dialog").showModal();
}

function runWritingAssistant(action) {
  const data = readForm();
  if (action === "optimize") {
    optimizeForJob();
    return;
  }
  if (action === "skills") {
    const description = document.querySelector("#job-description").value.trim();
    if (!description) {
      document.querySelector("#analysis-card").scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelector("#job-description").focus();
      return;
    }
    const currentSkills = data.skills.split(",").map((skill) => skill.trim()).filter(Boolean);
    const currentText = ` ${normalizeMatchText(currentSkills.join(" "))} `;
    const suggestions = extractJobKeywords(description).filter((keyword) =>
      !currentText.includes(` ${normalizeMatchText(keyword)} `)
    );
    openAssistantDialog(
      "Review skills for this job",
      suggestions.length
        ? `Possible job terms: ${suggestions.join(", ")}. They are not added automatically. Edit the list below and apply only skills you can support with real experience.`
        : "Your listed skills already overlap with the highlighted job terms. You can refine the wording below.",
      currentSkills.join(", "),
      "skills"
    );
    return;
  }
  if (action === "bullets") {
    const entryIndex = entries.experience.findIndex((entry) => entry.description.trim());
    if (entryIndex < 0) {
      document.querySelector("#add-experience").click();
      document.querySelector("#experience-section").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const description = entries.experience[entryIndex].description.trim();
    const bulletText = description.split(/(?<=[.!?])\s+/).filter(Boolean).map((sentence) => `• ${sentence}`).join("\n");
    openAssistantDialog(
      "Strengthen an experience entry",
      "This only formats your existing description into scannable bullets. Add accurate outcomes or metrics yourself; none are invented.",
      bulletText,
      "experience-description",
      entryIndex
    );
    return;
  }
  if (action === "summary" || action === "grammar" || action === "shorten") {
    const summary = data.summary.trim().replace(/\s+/g, " ");
    let suggestion = summary;
    let title = "Polish your summary";
    let description = "Review this wording before applying it. No experience or results have been added.";
    if (action === "grammar") {
      suggestion = summary
        .replace(/\s*([,.;:!?])\s*/g, "$1 ")
        .replace(/\s+/g, " ")
        .replace(/(^|[.!?]\s+)([a-z])/g, (_match, prefix, letter) => prefix + letter.toUpperCase())
        .trim();
      title = "Polish summary wording";
    } else if (action === "shorten") {
      const sentences = summary.match(/[^.!?]+[.!?]?/g) || [];
      suggestion = sentences.slice(0, 2).join(" ").trim();
      title = "Shorten your summary";
      description = "This keeps the first two sentences from your current summary. Check that the shorter version still represents you accurately.";
    } else if (!summary) {
      description = "Add your own background and strengths here. The assistant does not invent career details.";
    }
    openAssistantDialog(title, description, suggestion, "summary");
  }
}

function optimizeForJob() {
  document.querySelector("#analysis-card").scrollIntoView({ behavior: "smooth", block: "start" });
  const jobDescription = document.querySelector("#job-description");
  if (!jobDescription.value.trim()) {
    jobDescription.focus();
    document.querySelector("#analysis-results").hidden = false;
    document.querySelector("#analysis-results").innerHTML =
      '<p class="analysis-prompt">Paste the target job description above, then run the check to compare role keywords.</p>';
    return;
  }
  analyzeResume();
  document.querySelector("#analysis-results").focus({ preventScroll: true });
}

function createCoverLetterDraft() {
  const data = readForm();
  const experience = entries.experience.find((entry) => entry.description.trim());
  const jobTitle = data.title.trim() || "[Target job title]";
  const summary = data.summary.trim() || "[Add a relevant summary of your background and strengths.]";
  const background = experience
    ? `My experience as ${experience.role || "[role]"} at ${experience.company || "[organization]"} includes ${experience.description.trim()}`
    : "[Add one relevant example from your experience, projects, or education.]";
  const letter = `Dear Hiring Team,\n\nI am writing to express my interest in the ${jobTitle} opportunity. ${summary}\n\n${background}\n\nI would welcome the opportunity to discuss how my experience could support your team. Thank you for your time and consideration.\n\nSincerely,\n${data.name.trim() || "[Your name]"}`;
  openAssistantDialog(
    "Your cover letter draft",
    "This draft uses only details in your resume. Replace placeholders, add the employer's name, and verify every statement before sending.",
    letter,
    "cover-letter"
  );
}

async function copySuggestion() {
  const feedback = document.querySelector("#assistant-feedback");
  try {
    await navigator.clipboard.writeText(document.querySelector("#assistant-suggestion").value);
    feedback.textContent = "Text copied to clipboard.";
  } catch (error) {
    feedback.textContent = "Copy was blocked by the browser. Select the text and copy it manually.";
    console.error("Unable to copy the writing suggestion.", error);
  }
}

function applySuggestion() {
  const suggestion = document.querySelector("#assistant-suggestion").value.trim();
  if (activeSuggestion.target === "cover-letter") {
    downloadTextFile(suggestion, "cover-letter.txt", "text/plain;charset=utf-8");
    document.querySelector("#assistant-feedback").textContent = "Cover letter draft downloaded.";
    return;
  }
  if (activeSuggestion.target === "experience-description") {
    entries.experience[activeSuggestion.entryIndex].description = suggestion;
    renderEntries("experience");
  } else if (activeSuggestion.target === "summary" || activeSuggestion.target === "skills") {
    form.elements.namedItem(activeSuggestion.target).value = suggestion;
  }
  renderPreview();
  scheduleSave();
  refreshAnalysisIfVisible();
  document.querySelector("#assistant-feedback").textContent = "Suggestion applied to your resume.";
  window.setTimeout(() => document.querySelector("#assistant-dialog").close(), 500);
}

function downloadTextFile(text, fileName, type) {
  const file = new Blob([text], { type });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getResumeText(data) {
  return [
    ...Object.values(data),
    ...Object.values(entries).flatMap((section) => section.flatMap((entry) => Object.values(entry)))
  ].join(" ");
}

function normalizeMatchText(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‐‑‒–—-]/g, " ")
    .replace(/\bux\s+research\b/g, " user research ")
    .replace(/\bux\s+design\b/g, " user experience design ")
    .replace(/\bux\b/g, " user experience ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractJobKeywords(jobDescription) {
  const ignored = new Set([
    "a", "about", "above", "after", "again", "against", "all", "also", "am", "an", "and", "any",
    "are", "as", "at", "be", "because", "been", "being", "below", "both", "but", "by", "can",
    "could", "demonstrated", "does", "doing", "down", "during", "each", "excellent", "for", "from",
    "further", "have", "having", "here", "how", "i", "if", "in", "into", "is", "it", "its", "looking",
    "me", "more", "most", "must", "of", "on", "only", "or", "other", "our", "out", "over", "per",
    "same", "should", "so", "some", "such", "than", "that", "the", "their", "them", "then", "there",
    "these", "they", "this", "those", "through", "to", "under", "up", "us", "using", "very", "was",
    "we", "were", "what", "when", "where", "which", "while", "will", "with", "work", "working",
    "you", "your", "years", "year", "experience", "experiences", "skill", "skills", "ability",
    "strong", "including", "required", "preferred", "responsibilities", "responsible", "candidate",
    "candidates", "team", "teams", "job", "description", "opportunity", "role", "position"
  ]);
  const preparedDescription = String(jobDescription)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‐‑‒–—-]/g, " ")
    .replace(/\bux\s+research\b/g, " user research ")
    .replace(/\bux\s+design\b/g, " user experience design ")
    .replace(/\bux\b/g, " user experience ")
    .replace(/&/g, " and ");
  const frequencies = new Map();
  const matches = [...preparedDescription.matchAll(/[a-z][a-z0-9+#]*/g)];
  const words = matches.map((match) => match[0]);
  const addCandidate = (keyword, weight) => {
    frequencies.set(keyword, (frequencies.get(keyword) || 0) + weight);
  };
  words.forEach((word, index) => {
    const nextWord = words[index + 1];
    if (word.length >= 2 && !ignored.has(word) && !/^\d+$/.test(word)) addCandidate(word, 1);
    const gap = index < matches.length - 1
      ? preparedDescription.slice(matches[index].index + matches[index][0].length, matches[index + 1].index)
      : "";
    if (nextWord && /^\s+$/.test(gap) && !ignored.has(word) && !ignored.has(nextWord)) {
      addCandidate(`${word} ${nextWord}`, 3);
    }
  });
  const rankedKeywords = [...frequencies.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length || left[0].localeCompare(right[0]));
  const selected = rankedKeywords.slice(0, 15).map(([keyword]) => keyword);
  const phrases = selected.filter((keyword) => keyword.includes(" "));
  return selected.filter((keyword) => keyword.includes(" ") ||
    !phrases.some((phrase) => phrase.split(" ").includes(keyword)));
}

function analyzeResume() {
  const data = readForm();
  const checks = [
    {
      label: "Your name and professional title are present",
      passed: Boolean(data.name.trim() && data.title.trim()),
      guidance: "Add your name and the role you are targeting."
    },
    {
      label: "Contact details include a valid email address",
      passed: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()),
      guidance: "Check that your email address is complete and correctly formatted."
    },
    {
      label: "Professional summary has useful detail",
      passed: data.summary.trim().length >= 40,
      guidance: "Add a concise summary of your background and relevant strengths."
    },
    {
      label: "At least one work experience entry has a title and employer",
      passed: entries.experience.some((item) => item.role.trim() && item.company.trim()),
      guidance: "Add a role and employer, or include relevant projects if you are early in your career."
    },
    {
      label: "Skills are listed",
      passed: data.skills.split(",").some((skill) => skill.trim()),
      guidance: "Add relevant skills, separated by commas."
    },
    {
      label: "Experience describes outcomes or measurable results",
      passed: entries.experience.some((item) => /\d|%|\b(increased|improved|reduced|delivered|launched|led|built|created|achieved|saved|grew)\b/i.test(item.description)),
      guidance: "Where accurate, describe your contribution and its result or impact."
    }
  ];
  const jobDescription = document.querySelector("#job-description").value.trim();
  const resumeText = ` ${normalizeMatchText(getResumeText(data))} `;
  const keywords = jobDescription ? extractJobKeywords(jobDescription) : [];
  const matchedKeywords = keywords.filter((keyword) => {
    const normalizedKeyword = normalizeMatchText(keyword);
    return normalizedKeyword && resumeText.includes(` ${normalizedKeyword} `);
  });
  const missingKeywords = keywords.filter((keyword) => !matchedKeywords.includes(keyword));
  const results = document.querySelector("#analysis-results");
  const checksPassed = checks.filter((check) => check.passed).length;
  const readinessScore = Math.round(checksPassed / checks.length * 100);
  const checklist = checks.map((check) =>
    `<li class="${check.passed ? "check-passed" : "check-missed"}">
      <span aria-hidden="true">${check.passed ? "✓" : "!"}</span>
      <div>${escapeHtml(check.label)}${check.passed ? "" : `<small>${escapeHtml(check.guidance)}</small>`}</div>
    </li>`
  ).join("");
  const matchPercentage = keywords.length
    ? Math.round(matchedKeywords.length / keywords.length * 100)
    : 0;
  const matchLabel = keywords.length
    ? `${matchPercentage}% keyword overlap`
    : "Not enough distinct role-related terms to compare.";
  const jobResult = jobDescription
    ? `<section class="match-results"><h3>Job description match</h3>
        ${keywords.length
          ? `<p class="match-score"><strong>${escapeHtml(matchLabel)}</strong> <span>${matchedKeywords.length} of ${keywords.length} highlighted terms found in your resume.</span></p>`
          : "<p>There were not enough specific terms to compare. Try pasting more of the job description.</p>"}
        ${matchedKeywords.length ? `<div class="keyword-group"><strong>Found</strong><p>${matchedKeywords.map(escapeHtml).join(", ")}</p></div>` : ""}
        ${missingKeywords.length ? `<div class="keyword-group keyword-gap"><strong>Not found — review these</strong><p>${missingKeywords.map(escapeHtml).join(", ")}</p><small>Only add a term if it accurately reflects your skills or experience. Consider describing relevant work using the employer’s wording.</small></div>` : ""}
        <small>Terms are matched against the resume fields above. This is a basic text comparison, not an employer ATS simulation. Only include terms that accurately describe your experience.</small>
      </section>`
    : `<p class="analysis-prompt">Paste a job description above to compare its terms with your resume.</p>`;

  results.innerHTML = `<div class="score-summary"><div><span class="eyebrow">RESUME READINESS CHECK</span><strong class="score-value">${readinessScore}<span>/100 readiness points</span></strong></div><span class="score-label">${checksPassed} of ${checks.length} checks met</span></div>
    <p class="score-disclaimer">A local content-readiness checklist—not an employer ATS score or a prediction of how your application will rank. Education is optional and is not scored here.</p>
    <ul class="checklist-results">${checklist}</ul>${jobResult}`;
  document.querySelector("#ats-score-value").innerHTML = `${readinessScore}<small>/ 100</small>`;
  const missedCheck = checks.find((check) => !check.passed);
  document.querySelector("#ats-mini-checks").innerHTML = missedCheck
    ? `<span>!</span> ${escapeHtml(missedCheck.guidance)}`
    : "<span>✓</span> All core content checks passed.";
  results.hidden = false;
}

function refreshAnalysisIfVisible() {
  if (!document.querySelector("#analysis-results").hidden) analyzeResume();
}

try {
  const userId = document.body.dataset.userId;
  const savedSettings = userId ? localStorage.getItem(`forma-settings-${userId}`) : null;
  const preferences = savedSettings ? JSON.parse(savedSettings).preferences : null;
  if (["modern", "classic", "compact"].includes(preferences?.font)) {
    appearance.font = preferences.font;
  }
} catch (error) {
  console.error("Unable to load saved editor preferences.", error);
}

loadShareLink();
renderSuggestionLists();
for (const type of ["experience", "education", "projects", "certificates"]) renderEntries(type);
renderHighlights();
renderPreview();
loadAccountResume();
document.querySelectorAll(".section-tabs a").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".section-tabs a").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    const sectionId = tab.getAttribute("href").slice(1);
    const activeSection = document.getElementById(sectionId);
    const activeTab = activeSection?.dataset.editorTab ||
      (sectionId === "certificates-form-section" ? "certificates" : "additional");
    document.querySelectorAll("[data-editor-tab]").forEach((section) => {
      section.hidden = section.dataset.editorTab !== activeTab;
    });
  });
});
