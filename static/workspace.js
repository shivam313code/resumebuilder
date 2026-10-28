(() => {
  const draftKey = "forma-resume-draft";
  const statsKey = "forma-copilot-stats";
  const checksList = document.querySelector("#progress-check-list");
  const resumeList = document.querySelector("#resume-list");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);

  function readLocalJson(key) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Unable to read ${key} from this browser.`, error);
      return null;
    }
  }

  const draft = readLocalJson(draftKey);
  const stats = readLocalJson(statsKey) || { generations: 0 };
  const data = draft?.data && typeof draft.data === "object" ? draft.data : {};
  const entries = draft?.entries && typeof draft.entries === "object" ? draft.entries : {};
  const experience = Array.isArray(entries.experience) ? entries.experience : [];
  const education = Array.isArray(entries.education) ? entries.education : [];
  const projects = Array.isArray(entries.projects) ? entries.projects : [];
  const certificates = Array.isArray(entries.certificates) ? entries.certificates : [];
  const hasDraft = Boolean(draft && draft.data && draft.entries);
  const completionChecks = [
    { label: "Personal information", complete: Boolean(data.name?.trim() && data.title?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || "")) },
    { label: "Work experience", complete: experience.some((item) => item?.role?.trim() && item?.company?.trim()) },
    { label: "Education", complete: education.some((item) => item?.degree?.trim() && item?.school?.trim()) },
    { label: "Skills", complete: Boolean(data.skills?.trim()) },
    { label: "Professional summary", complete: Boolean(data.summary?.trim()) },
    { label: "Outcome details", complete: experience.some((item) => /\d|%|\b(increased|improved|reduced|delivered|launched|led|built|created|achieved|saved|grew)\b/i.test(item?.description || "")) },
    { label: "Projects", complete: projects.some((item) => item?.name?.trim()) },
    { label: "Certifications", complete: certificates.some((item) => item?.name?.trim()) }
  ];
  const scoredChecks = completionChecks.slice(0, 6);
  const readiness = hasDraft
    ? Math.round(scoredChecks.filter((item) => item.complete).length / scoredChecks.length * 100)
    : 0;
  const resumeName = data.name?.trim() || "Untitled resume";
  const resumeTitle = data.title?.trim() || "Add a professional title";
  const templateName = draft?.templateName || "Modern Pro";
  const resumeSearch = document.querySelector("#resume-search");
  const searchEmpty = document.querySelector("#resume-search-empty");
  const emptyState = document.querySelector("#resume-empty-state");

  document.querySelector("#stat-resumes").textContent = hasDraft ? "1" : "0";
  document.querySelector("#stat-generations").textContent =
    Number.isInteger(stats.generations) ? String(stats.generations) : "0";
  document.querySelector("#stat-readiness").textContent = hasDraft ? `${readiness}%` : "—";
  document.querySelector("#stat-template").textContent = hasDraft ? templateName : "—";
  document.querySelector("#dashboard-gauge").style.setProperty("--gauge-value", `${readiness}%`);
  document.querySelector("#dashboard-gauge-value").textContent = hasDraft ? `${readiness}%` : "0%";

  checksList.innerHTML = completionChecks.map((item) => `
    <li class="${item.complete ? "is-complete" : ""}">
      <span aria-hidden="true">${item.complete ? "✓" : "○"}</span>${escapeHtml(item.label)}
      <small>${item.complete ? "Complete" : "To do"}</small>
    </li>`).join("");

  function renderResumeCard() {
    if (!hasDraft) {
      resumeList.innerHTML = "";
      emptyState.hidden = false;
      searchEmpty.hidden = true;
      return;
    }
    emptyState.hidden = true;
    const query = resumeSearch.value.trim().toLowerCase();
    const matches = `${resumeName} ${resumeTitle} ${templateName}`.toLowerCase().includes(query);
    resumeList.innerHTML = matches ? `
      <article class="resume-dashboard-card" data-resume-search="${escapeHtml(`${resumeName} ${resumeTitle} ${templateName}`.toLowerCase())}">
        <div class="resume-card-preview">
          <div class="resume-mini-paper">
            <div class="resume-mini-sidebar"><span></span><i></i><i></i><i></i><i></i></div>
            <div class="resume-mini-content"><strong>${escapeHtml(resumeName)}</strong><small>${escapeHtml(resumeTitle)}</small><b></b><i></i><i></i><i></i><b></b><i></i><i></i></div>
          </div>
          <span class="resume-default-badge">Saved draft</span>
        </div>
        <div class="resume-card-copy"><div><h3>${escapeHtml(resumeName)}</h3><span>${escapeHtml(resumeTitle)}</span></div>
          <small>${escapeHtml(templateName)} · Saved in this browser</small>
          <div class="resume-card-meta"><span class="readiness-pill">${readiness}% readiness</span><a href="/resume-builder/modern-pro">Edit resume →</a></div>
        </div>
      </article>
      <a class="resume-create-card" href="/resume-builder/modern-pro"><span>＋</span><strong>Create another resume</strong><small>Start from the Modern Pro editor</small></a>` : "";
    searchEmpty.hidden = Boolean(matches);
  }

  resumeSearch.addEventListener("input", renderResumeCard);
  renderResumeCard();

  const activity = document.querySelector("#recent-activity-list");
  const recentItems = hasDraft
    ? [{ icon: "▤", title: "Resume draft available", detail: `${resumeName} · ${templateName}` }]
    : [{ icon: "✦", title: "Welcome to ResumePro", detail: "Create a resume to see your activity here." }];
  if (Number.isInteger(stats.generations) && stats.generations > 0) {
    recentItems.unshift({
      icon: "✧",
      title: "Copilot suggestions created",
      detail: `${stats.generations} suggestion set${stats.generations === 1 ? "" : "s"} in this browser`
    });
  }
  activity.innerHTML = recentItems.map((item) => `
    <li><span class="activity-icon">${escapeHtml(item.icon)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div><time>Local</time></li>`).join("");

  document.querySelector("#dashboard-search").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    resumeSearch.value = query;
    renderResumeCard();
    document.querySelectorAll(".quick-tools-grid a").forEach((link) => {
      link.hidden = Boolean(query) && !link.textContent.toLowerCase().includes(query);
    });
  });
})();
