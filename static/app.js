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

function renderEntries(type) {
  const list = document.querySelector(`#${type}-list`);
  const isExperience = type === "experience";
  const fields = isExperience
    ? [["role", "Job title"], ["company", "Company"], ["location", "Location"], ["dates", "Dates"], ["description", "What did you accomplish?"]]
    : [["degree", "Degree / course"], ["school", "School"], ["location", "Location"], ["dates", "Dates"], ["description", "Additional details"]];

  list.innerHTML = entries[type].map((entry, index) => `
    <div class="entry-card" data-entry-type="${type}" data-entry-index="${index}">
      <div class="entry-card-top"><span>${escapeHtml(entry[isExperience ? "role" : "degree"] || (isExperience ? "New position" : "New education"))}</span>
        <button class="remove-entry" type="button" aria-label="Remove ${isExperience ? "experience" : "education"} entry" data-remove="${index}">×</button>
      </div>
      <div class="entry-fields">
        ${fields.map(([key, label]) => `<label class="field ${key === "description" ? "entry-description" : ""}">${label}
          ${key === "description"
            ? `<textarea data-key="${key}" rows="3" placeholder="${label}">${escapeHtml(entry[key] || "")}</textarea>`
            : `<input data-key="${key}" value="${escapeHtml(entry[key] || "")}" placeholder="${label}">`}
        </label>`).join("")}
      </div>
    </div>`).join("");

  list.querySelectorAll(".entry-card").forEach((card) => {
    card.addEventListener("input", (event) => {
      const { entryIndex, entryType } = card.dataset;
      const key = event.target.dataset.key;
      if (!key) return;
      entries[entryType][Number(entryIndex)][key] = event.target.value;
      renderPreview();
      if (key === "role" || key === "degree") {
        const title = card.querySelector(".entry-card-top span");
        title.textContent = event.target.value || (entryType === "experience" ? "New position" : "New education");
      }
      scheduleSave();
    });
  });
  list.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      entries[type].splice(Number(button.dataset.remove), 1);
      renderEntries(type);
      renderPreview();
      scheduleSave();
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
      <div class="resume-entry-heading"><strong>${escapeHtml(entry.role || "")}</strong><span class="resume-entry-date">${escapeHtml(entry.dates || "")}</span></div>
      <p class="resume-entry-subtitle">${escapeHtml([entry.company, entry.location].filter(Boolean).join(" · "))}</p>
      ${entry.description ? `<p class="resume-entry-description">${escapeHtml(entry.description)}</p>` : ""}
    </div>`).join("");
  document.querySelector("#preview-education").innerHTML = entries.education.map((entry) => `
    <div class="resume-entry">
      <div class="resume-entry-heading"><strong>${escapeHtml(entry.degree || "")}</strong><span class="resume-entry-date">${escapeHtml(entry.dates || "")}</span></div>
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
});
document.querySelector("#add-education").addEventListener("click", () => {
  entries.education.push({ degree: "", school: "", location: "", dates: "", description: "" });
  renderEntries("education");
  renderPreview();
  scheduleSave();
});
form.addEventListener("input", () => {
  renderPreview();
  scheduleSave();
});
document.querySelector("#download-button").addEventListener("click", () => window.print());
document.querySelector("#job-description").addEventListener("input", scheduleSave);
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
  ].join(" ").toLowerCase();
}

function extractJobKeywords(jobDescription) {
  const ignored = new Set([
    "about", "above", "after", "again", "against", "also", "among", "an", "and", "any", "are", "as",
    "at", "be", "because", "by",
    "been", "being", "below", "both", "but", "can", "could", "demonstrated", "does", "doing", "down",
    "during", "each", "excellent", "for", "from", "further", "have", "having", "here", "into", "its",
    "in", "is", "more", "most", "must", "not", "of", "on", "only", "or", "other", "our", "out", "over", "per",
    "same", "should",
    "some", "such", "than", "that", "the", "their", "them", "then", "there", "these", "they", "this",
    "those", "through", "to", "under", "using", "very", "was", "want", "were", "what", "when", "where",
    "which", "while", "will", "with", "work", "working", "you", "your", "years", "experience", "skills",
    "ability", "strong", "including", "required", "preferred", "responsibilities", "responsible",
    "candidate", "candidates", "team", "teams", "job", "description", "opportunity", "looking"
  ]);
  const frequencies = new Map();
  const matches = [...jobDescription.toLowerCase().matchAll(/[a-z][a-z0-9+#.-]{1,}/g)];
  const words = matches.map((match) => match[0].replace(/^[.-]+|[.-]+$/g, ""));
  const addCandidate = (keyword) => {
    frequencies.set(keyword, (frequencies.get(keyword) || 0) + 1);
  };
  words.forEach((word, index) => {
    if (word.length >= 2 && !ignored.has(word) && !/^\d+$/.test(word)) addCandidate(word);
    const nextWord = words[index + 1];
    const gap = index < matches.length - 1
      ? jobDescription.slice(matches[index].index + matches[index][0].length, matches[index + 1].index)
      : "";
    if (nextWord && /^\s+$/.test(gap) && !ignored.has(word) && !ignored.has(nextWord)) {
      addCandidate(`${word} ${nextWord}`);
    }
  });
  const rankedKeywords = [...frequencies.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length || left[0].localeCompare(right[0]))
    .slice(0, 15)
    .map(([keyword]) => keyword);
  const phrases = rankedKeywords.filter((keyword) => keyword.includes(" "));
  return rankedKeywords.filter((keyword) =>
    keyword.includes(" ") || !phrases.some((phrase) => phrase.split(" ").includes(keyword))
  );
}

function analyzeResume() {
  const data = readForm();
  const checks = [
    { label: "Contact details include an email address", passed: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()), weight: 15 },
    { label: "Professional title is included", passed: Boolean(data.title.trim()), weight: 10 },
    { label: "Professional summary is included", passed: data.summary.trim().length >= 40, weight: 15 },
    { label: "At least one role includes a title and employer", passed: entries.experience.some((item) => item.role.trim() && item.company.trim()), weight: 20 },
    { label: "At least one education entry is complete", passed: entries.education.some((item) => item.degree.trim() && item.school.trim()), weight: 10 },
    { label: "Skills are listed", passed: data.skills.split(",").some((skill) => skill.trim()), weight: 15 },
    {
      label: "Experience describes outcomes or measurable results",
      passed: entries.experience.some((item) => /\d|%|\b(increased|improved|reduced|delivered|launched|led|built|created|achieved|saved|grew)\b/i.test(item.description)),
      weight: 15
    }
  ];
  const score = checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
  const jobDescription = document.querySelector("#job-description").value.trim();
  const resumeText = getResumeText(data);
  const keywords = jobDescription ? extractJobKeywords(jobDescription) : [];
  const matchedKeywords = keywords.filter((keyword) => new RegExp(`(^|[^a-z0-9+#])${escapeRegExp(keyword)}([^a-z0-9+#]|$)`, "i").test(resumeText));
  const missingKeywords = keywords.filter((keyword) => !matchedKeywords.includes(keyword));
  const results = document.querySelector("#analysis-results");
  const scoreLabel = score >= 80 ? "Strong foundation" : score >= 55 ? "Room to improve" : "Needs attention";
  const checklist = checks.map((check) =>
    `<li class="${check.passed ? "check-passed" : "check-missed"}"><span aria-hidden="true">${check.passed ? "✓" : "!"}</span>${escapeHtml(check.label)}</li>`
  ).join("");
  const jobResult = jobDescription
    ? `<section class="match-results"><h3>Job description match</h3>
        ${keywords.length
          ? `<p><strong>${matchedKeywords.length} of ${keywords.length}</strong> highlighted job-description terms found in your resume content.</p>`
          : "<p>There were not enough specific terms to compare. Try pasting more of the job description.</p>"}
        ${matchedKeywords.length ? `<div class="keyword-group"><strong>Found</strong><p>${matchedKeywords.map(escapeHtml).join(", ")}</p></div>` : ""}
        ${missingKeywords.length ? `<div class="keyword-group keyword-gap"><strong>Not found — review these</strong><p>${missingKeywords.map(escapeHtml).join(", ")}</p><small>Only add a term if it accurately reflects your skills or experience. Consider describing relevant work using the employer’s wording.</small></div>` : ""}
        <small>Keyword comparison is a simple local text match, not an employer ATS simulation.</small>
      </section>`
    : `<p class="analysis-prompt">Paste a job description above to compare its terms with your resume.</p>`;

  results.innerHTML = `<div class="score-summary"><div><span class="eyebrow">RESUME READINESS CHECKLIST</span><strong class="score-value">${score}<span>/100</span></strong></div><span class="score-label">${scoreLabel}</span></div>
    <p class="score-disclaimer">A transparent checklist of common resume basics, not a prediction of how any employer’s ATS will rank your application.</p>
    <ul class="checklist-results">${checklist}</ul>${jobResult}`;
  results.hidden = false;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

loadDraft();
renderEntries("experience");
renderEntries("education");
renderPreview();
