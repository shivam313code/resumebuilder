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
  document.querySelector("#preview-skills").innerHTML = data.skills.split(",").map((skill) => skill.trim()).filter(Boolean)
    .map((skill) => `<span class="skill-chip">${escapeHtml(skill)}</span>`).join("");
  updateCompleteness(data);
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
    localStorage.setItem("forma-resume-draft", JSON.stringify({ data: readForm(), entries }));
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
document.querySelector("#reset-button").addEventListener("click", () => {
  if (!window.confirm("Start over and clear your saved resume draft?")) return;
  form.reset();
  for (const [name, value] of Object.entries(defaults)) form.elements.namedItem(name).value = value;
  entries = structuredClone(defaultEntries);
  localStorage.removeItem("forma-resume-draft");
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

loadDraft();
renderEntries("experience");
renderEntries("education");
renderPreview();
