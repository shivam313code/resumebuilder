(() => {
  const resumeStorage = window.ResumeDraftStorage;
  const statsKey = "forma-copilot-stats";
  const jobKey = "forma-copilot-job-description";
  const sectionSelect = document.querySelector("#copilot-section");
  const contentField = document.querySelector("#copilot-content");
  const roleField = document.querySelector("#copilot-role");
  const descriptionField = document.querySelector("#copilot-job-description");
  const modeButtons = [...document.querySelectorAll("[data-mode]")];
  const suggestionList = document.querySelector("#suggestion-list");
  const feedback = document.querySelector("#copilot-feedback");
  const state = { draft: null, mode: "improve", modeKey: "improve", variations: [], activeSection: "experience", contentBySection: {} };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);

  function readDraft() {
    try {
      const parsed = resumeStorage.readDraft();
      return parsed && parsed.data && parsed.entries ? parsed : null;
    } catch (error) {
      console.error("Unable to read the saved resume draft.", error);
      feedback.textContent = "The saved resume could not be read. Open the editor and save the draft again.";
      return null;
    }
  }

  function readSavedJobText() {
    try {
      return localStorage.getItem(jobKey) || "";
    } catch (error) {
      console.error("Unable to read the saved job description.", error);
      return "";
    }
  }

  function sectionText(section, draft = state.draft) {
    if (!draft) return "";
    if (section === "summary") return draft.data.summary || "";
    if (section === "skills") return draft.data.skills || "";
    if (section === "experience") {
      return (draft.entries.experience || []).find((entry) => entry?.description?.trim())?.description || "";
    }
    if (section === "projects") {
      return (draft.entries.projects || []).find((entry) => entry?.description?.trim())?.description || "";
    }
    if (section === "education") {
      const item = (draft.entries.education || []).find((entry) => entry?.degree || entry?.school || entry?.description);
      return item ? [item.degree, item.school, item.location, item.description].filter(Boolean).join("\n") : "";
    }
    return "";
  }

  function saveLocalDraft() {
    try {
      resumeStorage.saveDraft(state.draft);
      feedback.textContent = "Applied to your local resume draft.";
      refreshAnalysis();
    } catch (error) {
      feedback.textContent = "Could not save this edit in your browser. Check available local storage and try again.";
      console.error("Unable to update the local resume draft.", error);
    }
  }

  function loadSection({ preserveCurrent = true } = {}) {
    if (preserveCurrent && contentField.value.trim()) {
      state.contentBySection[state.activeSection] = contentField.value;
    }
    const section = sectionSelect.value;
    contentField.value = state.contentBySection[section] ?? sectionText(section);
    state.activeSection = section;
    updateCount();
  }

  function selectSection(section) {
    if ([...sectionSelect.options].some((option) => option.value === section)) {
      state.contentBySection[state.activeSection] = contentField.value;
      sectionSelect.value = section;
      loadSection({ preserveCurrent: false });
    }
  }

  const modeLabels = {
    improve: "Improve your content",
    generate: "Generate a section",
    tailor: "Tailor for a job",
    grammar: "Fix grammar",
    ats: "Optimize for ATS",
    shorten: "Rewrite and shorten",
    summary: "Professional summary",
    skills: "Skills suggestions",
    "cover-letter": "Cover letter draft",
    interview: "Interview preparation",
    "job-match": "Job match"
  };

  function setMode(mode) {
    const aliases = { "cover-letter": "generate", "job-match": "tailor", interview: "generate" };
    state.modeKey = mode;
    state.mode = aliases[mode] || mode;
    modeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    });
    document.querySelector("#copilot-input-title").textContent = modeLabels[mode] || modeLabels[state.mode];
    document.querySelector("#copilot-job-description-field").hidden = !["tailor", "job-match"].includes(mode);
    if (mode === "summary") selectSection("summary");
    if (mode === "skills") selectSection("skills");
    if (mode === "cover-letter") selectSection("summary");
    if (mode === "interview") selectSection("experience");
    if (mode === "job-match") selectSection("skills");
    if (mode === "ats") refreshAnalysis();
    if (["cover-letter", "interview"].includes(mode)) {
      feedback.textContent = "This tool can prepare a draft or prompts only from information in your resume. Review everything before use.";
    } else {
      feedback.textContent = "";
    }
  }

  function cleanText(value) {
    return value.replace(/\s+/g, " ").trim()
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/(^|[.!?]\s+)([a-z])/g, (_match, prefix, letter) => prefix + letter.toUpperCase());
  }

  function sentenceList(value) {
    return value.split(/\n+|(?<=[.!?])\s+/).map((line) => cleanText(line)).filter(Boolean);
  }

  function buildVariations(text) {
    const selectedSection = sectionSelect.value;
    const cleaned = cleanText(text);
    const sentences = sentenceList(text);
    const short = selectedSection === "skills"
      ? text.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 8).join(", ")
      : sentences.slice(0, 2).join(" ");
    const targetTerms = new Set(tokens(`${roleField.value} ${descriptionField.value}`));
    const technicalTerms = /\b(python|sql|machine learning|data|model|api|cloud|automation|analytics|research|design|figma)\b/i;
    const detailFirst = [...sentences].sort((a, b) => {
      if (state.mode === "tailor" && targetTerms.size) {
        const score = (sentence) => tokens(sentence).filter((word) => targetTerms.has(word)).length;
        return score(b) - score(a);
      }
      return Number(technicalTerms.test(b)) - Number(technicalTerms.test(a));
    }).join("\n");
    const bulletFormat = detailFirst.split("\n").filter(Boolean).map((sentence) => `• ${sentence}`).join("\n");
    const focusLabels = [...document.querySelectorAll(".focus-areas input:checked")]
      .map((input) => ({ clarity: "Clear", impact: "Impact", concise: "Concise", technical: "Technical" })[input.value]);
    const variants = [
      { title: "Version 1 — Clear and professional", tag: focusLabels[0] || "Professional", text: cleaned },
      { title: "Version 2 — Concise", tag: focusLabels[1] || "Concise", text: short || cleaned },
      { title: "Version 3 — Scannable bullet format", tag: focusLabels[2] || "Bullet format", text: bulletFormat || cleaned }
    ];
    if (state.modeKey === "cover-letter") {
      const data = state.draft?.data || {};
      const experience = (state.draft?.entries?.experience || []).find((entry) => entry?.description?.trim());
      const letter = [
        "Dear Hiring Team,",
        "",
        `I am interested in the ${roleField.value.trim() || "[target role]"} opportunity.`,
        data.summary?.trim() || cleaned,
        experience?.description?.trim() ? `\nMy relevant experience includes: ${experience.description.trim()}` : "",
        "",
        "Sincerely,",
        data.name?.trim() || "[Your name]"
      ].filter(Boolean).join("\n");
      return [{ title: "Cover letter draft — review before sending", tag: "From your resume", text: letter }];
    }
    if (state.modeKey === "interview") {
      const firstSentence = sentences[0] || cleaned;
      return [
        { title: "Practice prompt 1 — Your contribution", tag: "Interview prompt", text: `Describe your specific contribution to this work: “${firstSentence}” What did you do, and what did you learn?` },
        { title: "Practice prompt 2 — Your approach", tag: "Interview prompt", text: `Explain the approach you took for: “${firstSentence}” Which decisions were yours?` },
        { title: "Practice prompt 3 — Reflection", tag: "Interview prompt", text: `Reflect on this experience: “${firstSentence}” What would you improve next time?` }
      ];
    }
    if (state.modeKey === "grammar") {
      variants[0].title = "Version 1 — Grammar polished";
      variants[1].title = "Version 2 — Clean punctuation";
      variants[2].title = "Version 3 — Readable format";
    } else if (state.modeKey === "tailor" || state.modeKey === "job-match") {
      variants[0].title = "Version 1 — Role-focused";
      variants[1].title = "Version 2 — Relevant details";
      variants[2].title = "Version 3 — Role-focused bullets";
    } else if (state.modeKey === "generate") {
      variants[0].title = "Version 1 — From your details";
      variants[1].title = "Version 2 — Short format";
      variants[2].title = "Version 3 — Key details first";
    }
    return variants
      .map((variant) => ({ ...variant, text: variant.text.trim() }))
      .filter((variant, index, all) => all.findIndex((item) => item.text === variant.text) === index)
      .map((variant, index) => ({
        ...variant,
        title: variant.title.replace(/^Version \d+/, `Version ${index + 1}`)
      }));
  }

  function renderSuggestions() {
    document.querySelector("#suggestion-count").textContent = `${state.variations.length} Variations`;
    if (!state.variations.length) return;
    suggestionList.innerHTML = state.variations.map((item, index) => `
      <article class="suggestion-variant">
        <div class="suggestion-variant-heading"><span class="variant-status">${index === 0 ? "✦" : "✓"}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.tag)}</small></div><button type="button" class="suggestion-copy-icon" data-copy-index="${index}" aria-label="Copy version ${index + 1}">▢</button></div>
        <p>${escapeHtml(item.text)}</p>
        <div class="suggestion-actions"><button type="button" class="workspace-primary-button use-suggestion" data-use-index="${index}">${state.modeKey === "cover-letter" ? "Save Letter Draft" : state.modeKey === "interview" ? "Save Practice Notes" : "✦ Use This"}</button><button type="button" class="small-outline-button" data-copy-index="${index}">▢ Copy</button><button type="button" class="small-outline-button" data-regenerate-index="${index}">⟳ Regenerate</button></div>
      </article>`).join("");
  }

  function updateCount() {
    document.querySelector("#copilot-count").textContent = String(contentField.value.length);
  }

  function generate() {
    state.draft = readDraft();
    state.contentBySection[sectionSelect.value] = contentField.value;
    const content = contentField.value.trim();
    if (!content) {
      feedback.textContent = "Add your own details in this section first. Copilot will not invent work history or achievements.";
      contentField.focus();
      return;
    }
    if ((state.modeKey === "tailor" || state.modeKey === "job-match") &&
      !roleField.value.trim() && !descriptionField.value.trim()) {
      feedback.textContent = "Enter a target role or job description to create a role-focused version.";
      roleField.focus();
      return;
    }
    state.variations = buildVariations(content);
    state.counter += 1;
    renderSuggestions();
    feedback.textContent = "Suggestions are based only on the text you provided. Verify every detail before applying.";
    document.querySelector("#suggestion-subtitle").textContent = "Review, copy, or apply a variation to your local resume.";
    try {
      const stats = JSON.parse(localStorage.getItem(statsKey) || '{"generations":0}');
      stats.generations = (Number.isInteger(stats.generations) ? stats.generations : 0) + 1;
      localStorage.setItem(statsKey, JSON.stringify(stats));
    } catch (error) {
      console.error("Unable to update Copilot activity in this browser.", error);
    }
  }

  function applyVariation(index) {
    const variation = state.variations[index];
    if (!variation) return;
    if (state.modeKey === "cover-letter" || state.modeKey === "interview") {
      const storageKey = state.modeKey === "cover-letter"
        ? "forma-cover-letter-draft"
        : "forma-interview-notes";
      try {
        localStorage.setItem(storageKey, variation.text);
        feedback.textContent = state.modeKey === "cover-letter"
          ? "Cover letter draft saved in this browser."
          : "Interview practice notes saved in this browser.";
      } catch (error) {
        feedback.textContent = "Could not save this draft in your browser.";
        console.error("Unable to save Copilot notes.", error);
      }
      return;
    }
    if (!state.draft) state.draft = readDraft() || { data: {}, entries: {} };
    const section = sectionSelect.value;
    if (section === "summary" || section === "skills") {
      state.draft.data[section] = variation.text;
    } else if (section === "experience" || section === "projects") {
      const collection = state.draft.entries[section] || [];
      let entry = collection.find((item) => item?.description?.trim());
      if (!entry) {
        entry = section === "experience"
          ? { role: "", company: "", location: "", dates: "", description: "" }
          : { name: "", dates: "", description: "" };
        collection.push(entry);
      }
      entry.description = variation.text;
      state.draft.entries[section] = collection;
    } else if (section === "education") {
      const collection = state.draft.entries.education || [];
      let entry = collection[0];
      if (!entry) {
        entry = { degree: "", school: "", location: "", dates: "", description: "" };
        collection.push(entry);
      }
      entry.description = variation.text;
      state.draft.entries.education = collection;
    }
    state.draft.updatedAt = new Date().toISOString();
    contentField.value = variation.text;
    state.contentBySection[section] = variation.text;
    updateCount();
    saveLocalDraft();
  }

  async function copyVariation(index) {
    const variation = state.variations[index];
    if (!variation) return;
    try {
      await navigator.clipboard.writeText(variation.text);
      feedback.textContent = "Suggestion copied to clipboard.";
    } catch (error) {
      feedback.textContent = "Clipboard access was blocked. Select the suggestion text and copy it manually.";
      console.error("Unable to copy the Copilot suggestion.", error);
    }
  }

  function tokens(value) {
    const ignored = new Set(["with", "from", "that", "this", "your", "have", "will", "into", "over", "and", "the", "for", "are", "was", "were", "has", "had", "our", "you", "their", "they", "them", "than", "then", "can", "may", "not", "role", "work", "team"]);
    return [...new Set((value.toLowerCase().match(/[a-z][a-z+#.-]{1,}/g) || [])
      .filter((word) => !ignored.has(word)))];
  }

  function refreshAnalysis() {
    state.draft = readDraft();
    const draft = state.draft;
    const data = draft?.data || {};
    const entries = draft?.entries || {};
    const experience = Array.isArray(entries.experience) ? entries.experience : [];
    const skills = (data.skills || "").split(",").map((item) => item.trim()).filter(Boolean);
    const checks = [
      { label: "Contact information", passed: Boolean(data.name?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || "")) },
      { label: "Work experience", passed: experience.some((item) => item?.role?.trim() && item?.company?.trim()) },
      { label: "Skills listed", passed: skills.length > 0 },
      { label: "Summary included", passed: Boolean(data.summary?.trim()) },
      { label: "Education included", passed: (entries.education || []).some((item) => item?.degree?.trim() && item?.school?.trim()) },
      { label: "Outcome details", passed: experience.some((item) => /\d|%|\b(increased|improved|reduced|delivered|launched|led|built|created|achieved|saved|grew)\b/i.test(item.description || "")) }
    ];
    const score = draft ? Math.round(checks.filter((item) => item.passed).length / checks.length * 100) : 0;
    document.querySelector("#copilot-gauge").style.setProperty("--gauge-value", `${score}%`);
    document.querySelector("#copilot-score").textContent = draft ? String(score) : "—";
    document.querySelector("#copilot-score-label").textContent = !draft ? "No local resume draft" : score >= 80 ? "Strong content coverage" : "Room to strengthen";
    document.querySelector("#copilot-score-detail").textContent = draft
      ? `${checks.filter((item) => item.passed).length} of ${checks.length} local content checks met.`
      : "Save a resume in this browser to review the checklist.";
    document.querySelector("#copilot-checks").innerHTML = checks.map((item) => `
      <li class="${item.passed ? "is-complete" : ""}"><span>${item.passed ? "✓" : "○"}</span>${escapeHtml(item.label)}<small>${item.passed ? "Complete" : "Review"}</small></li>`).join("");
    const keywordRoot = document.querySelector("#copilot-keywords");
    const targetDescription = descriptionField.value.trim();
    const targetText = `${roleField.value} ${targetDescription}`.trim();
    const targetKeywords = targetText ? tokens(targetText).slice(0, 18) : [];
    const resumeText = `${data.summary || ""} ${data.skills || ""} ${experience.map((item) => item?.description || "").join(" ")}`.toLowerCase();
    if (targetKeywords.length) {
      const matched = targetKeywords.filter((word) => resumeText.includes(word));
      const missing = targetKeywords.filter((word) => !matched.includes(word));
      keywordRoot.innerHTML = [
        ...matched.map((word) => `<span class="copilot-keyword">✓ ${escapeHtml(word)}</span>`),
        ...missing.slice(0, 8).map((word) => `<span class="copilot-keyword keyword-missing">○ ${escapeHtml(word)}</span>`)
      ].join("");
      document.querySelector(".keyword-card .copilot-card-heading p").textContent =
        `${matched.length}/${targetKeywords.length} job description terms found`;
    } else {
      keywordRoot.innerHTML = skills.length
        ? skills.map((skill) => `<span class="copilot-keyword">${escapeHtml(skill)}</span>`).join("")
        : '<span class="keyword-empty">Add skills in your resume to see them here.</span>';
      document.querySelector(".keyword-card .copilot-card-heading p").textContent =
        targetDescription ? "From your saved resume draft" : "Add a target role or job description to compare";
    }
    renderTips(checks, data, skills);
  }

  function renderTips(checks, data, skills) {
    const tips = [];
    if (!data.summary?.trim()) tips.push("Add a concise professional summary.");
    if (data.summary && data.summary.trim().length < 40) tips.push("Expand your summary with relevant background and strengths.");
    if (!skills.length) tips.push("Add relevant skills that you can support with experience.");
    if (!checks.find((item) => item.label === "Outcome details").passed) tips.push("Where accurate, clarify the outcome or scale of your work.");
    if (!tips.length) tips.push("Your core sections are present. Review clarity and verify every detail.");
    document.querySelector("#copilot-tips").innerHTML = tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("");
  }

  sectionSelect.addEventListener("change", () => loadSection());
  contentField.addEventListener("input", updateCount);
  roleField.addEventListener("input", refreshAnalysis);
  descriptionField.addEventListener("input", () => {
    try {
      localStorage.setItem(jobKey, descriptionField.value);
    } catch (error) {
      feedback.textContent = "Could not save this job description in your browser.";
      console.error("Unable to save the job description locally.", error);
    }
    refreshAnalysis();
  });
  modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  document.querySelectorAll(".more-tools-grid [data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setMode(button.dataset.mode);
      document.querySelector("#copilot-tools").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
  document.querySelector("#copilot-generate").addEventListener("click", generate);
  document.querySelector("#refresh-analysis").addEventListener("click", refreshAnalysis);
  suggestionList.addEventListener("click", (event) => {
    const useButton = event.target.closest("[data-use-index]");
    const copyButton = event.target.closest("[data-copy-index]");
    const regenerateButton = event.target.closest("[data-regenerate-index]");
    if (useButton) applyVariation(Number(useButton.dataset.useIndex));
    if (copyButton) copyVariation(Number(copyButton.dataset.copyIndex));
    if (regenerateButton) generate();
  });

  const params = new URLSearchParams(window.location.search);
  const initialMode = params.get("mode") || "improve";
  descriptionField.value = readSavedJobText();
  if (initialMode === "summary" || initialMode === "skills") setMode(initialMode);
  else setMode(initialMode);
  state.draft = readDraft();
  loadSection({ preserveCurrent: false });
  refreshAnalysis();
})();
