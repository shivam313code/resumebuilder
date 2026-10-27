const defaultEntries = {
  experience: [
    {
      role: "Senior Product Designer",
      company: "Northstar Studio",
      location: "New York, NY",
      dates: "2021 — Present",
      description: "Led end-to-end design for a mobile platform used by 200K+ customers. Partnered with product and engineering to improve onboarding conversion by 28%."
    },
    {
      role: "Product Designer",
      company: "Brightside Digital",
      location: "New York, NY",
      dates: "2018 — 2021",
      description: "Designed accessible web experiences and built a shared component library that helped the team ship new features 30% faster."
    }
  ],
  education: [
    {
      degree: "BFA, Communication Design",
      school: "Parsons School of Design",
      location: "New York, NY",
      dates: "2014 — 2018",
      description: ""
    }
  ]
};

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
const defaults = Object.fromEntries(new FormData(form).entries());
let entries = structuredClone(defaultEntries);
let zoom = 100;
let saveTimer;

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
    : [
      ["degree", "Degree / course", "degrees", "text"],
      ["school", "School", "schools", "text"],
      ["location", "Location", "locations", "text"],
      ["dates", "Date", "", "date"],
      ["description", "Additional details", "", "textarea"]
    ];

  list.innerHTML = entries[type].map((entry, index) => `
    <div class="entry-card" data-entry-type="${type}" data-entry-index="${index}">
      <div class="entry-card-top"><span>${escapeHtml(entry[isExperience ? "role" : "degree"] || (isExperience ? "New position" : "New education"))}</span>
        <button class="remove-entry" type="button" aria-label="Remove ${isExperience ? "experience" : "education"} entry" data-remove="${index}">×</button>
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
      if (key === "role" || key === "degree") {
        const title = card.querySelector(".entry-card-top span");
        title.textContent = value || (entryType === "experience" ? "New position" : "New education");
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
      ${entry.description ? `<p class="resume-entry-description">${escapeHtml(entry.description)}</p>` : ""}
    </div>`).join("");
  document.querySelector("#preview-education").innerHTML = entries.education.map((entry) => `
    <div class="resume-entry">
      <div class="resume-entry-heading"><strong>${escapeHtml(entry.degree || "")}</strong><span class="resume-entry-date">${escapeHtml(formatResumeDate(entry.dates))}</span></div>
      <p class="resume-entry-subtitle">${escapeHtml([entry.school, entry.location].filter(Boolean).join(" · "))}</p>
      ${entry.description ? `<p class="resume-entry-description">${escapeHtml(entry.description)}</p>` : ""}
    </div>`).join("");
  const skills = data.skills.split(",").map((skill) => skill.trim()).filter(Boolean);
  const skillPreview = document.querySelector("#preview-skills");
  const usesSkillBars = ["moon", "max", "social", "shelah"].some((templateId) =>
    document.querySelector("#resume-preview").classList.contains(`template-${templateId}`)
  );
  skillPreview.innerHTML = skills.map((skill, index) => usesSkillBars
    ? `<span class="skill-bar-item">${escapeHtml(skill)}<span class="skill-bar"><i style="--skill-level:${[88, 78, 72, 84, 67, 76, 80, 70][index % 8]}%"></i></span></span>`
    : `<span class="skill-chip">${escapeHtml(skill)}</span>`).join("");
  renderPreviewList("#preview-languages", "#languages-section", data.languages);
  renderPreviewList("#preview-certificates", "#certificates-section", data.certificates);
  renderPreviewList("#preview-software", "#software-section", data.software);
  renderPreviewList("#preview-interests", "#interests-section", data.interests);
  updateCompleteness(data);
}

function renderPreviewList(listSelector, sectionSelector, value) {
  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  const section = document.querySelector(sectionSelector);
  section.hidden = values.length === 0;
  document.querySelector(listSelector).innerHTML = values
    .map((item) => `<span class="skill-chip">${escapeHtml(item)}</span>`)
    .join("");
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
  try {
    localStorage.setItem("forma-resume-draft", JSON.stringify({
      data: readForm(),
      entries,
      jobDescription: document.querySelector("#job-description").value
    }));
    status.textContent = "All changes saved";
  } catch (error) {
    status.textContent = "Could not save draft";
    console.error("Unable to save resume draft to this browser.", error);
  }
}

function scheduleSave() {
  status.textContent = "Saving…";
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveDraft, 350);
}

function loadDraft() {
  try {
    const saved = localStorage.getItem("forma-resume-draft");
    if (!saved) return;
    const draft = JSON.parse(saved);
    if (!draft || typeof draft !== "object" || !draft.data || !draft.entries) return;
    for (const [name, value] of Object.entries(draft.data)) {
      const field = form.elements.namedItem(name);
      if (field && typeof value === "string") field.value = value;
    }
    for (const type of ["experience", "education"]) {
      if (Array.isArray(draft.entries[type])) {
        entries[type] = draft.entries[type].filter((entry) => entry && typeof entry === "object").map((entry) =>
          Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, String(value ?? "")])));
      }
    }
    if (typeof draft.jobDescription === "string") {
      document.querySelector("#job-description").value = draft.jobDescription;
    }
  } catch (error) {
    status.textContent = "Could not load saved draft";
    console.error("Unable to load resume draft from this browser.", error);
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
form.addEventListener("input", () => {
  renderPreview();
  scheduleSave();
  refreshAnalysisIfVisible();
});
document.querySelector("#download-button").addEventListener("click", () => window.print());
document.querySelector("#job-description").addEventListener("input", () => {
  scheduleSave();
  refreshAnalysisIfVisible();
});
document.querySelector("#analyze-button").addEventListener("click", analyzeResume);
document.querySelector("#reset-button").addEventListener("click", () => {
  if (!window.confirm("Start over and clear your saved resume draft?")) return;
  form.reset();
  for (const [name, value] of Object.entries(defaults)) form.elements.namedItem(name).value = value;
  entries = structuredClone(defaultEntries);
  document.querySelector("#job-description").value = "";
  localStorage.removeItem("forma-resume-draft");
  document.querySelector("#analysis-results").hidden = true;
  renderEntries("experience");
  renderEntries("education");
  renderPreview();
  status.textContent = "All changes saved";
});
document.querySelector("#zoom-in").addEventListener("click", () => changeZoom(10));
document.querySelector("#zoom-out").addEventListener("click", () => changeZoom(-10));

function changeZoom(amount) {
  zoom = Math.max(70, Math.min(120, zoom + amount));
  document.querySelector("#zoom-label").textContent = `${zoom}%`;
  document.querySelector("#resume-preview").style.zoom = `${zoom}%`;
}

function getResumeText(data) {
  return [
    ...Object.values(data),
    ...entries.experience.flatMap((entry) => Object.values(entry)),
    ...entries.education.flatMap((entry) => Object.values(entry))
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

  results.innerHTML = `<div class="score-summary"><div><span class="eyebrow">RESUME CONTENT CHECK</span><strong class="score-value">${checksPassed}<span>/${checks.length} checks</span></strong></div><span class="score-label">${checksPassed === checks.length ? "All checks met" : `${checks.length - checksPassed} to review`}</span></div>
    <p class="score-disclaimer">A content checklist—not an ATS score or a prediction of how an employer will rank your application. Education is optional and is not scored here.</p>
    <ul class="checklist-results">${checklist}</ul>${jobResult}`;
  results.hidden = false;
}

function refreshAnalysisIfVisible() {
  if (!document.querySelector("#analysis-results").hidden) analyzeResume();
}

loadDraft();
renderSuggestionLists();
renderEntries("experience");
renderEntries("education");
renderPreview();
