(() => {
  const statsKey = "forma-copilot-stats";
  const checksList = document.querySelector("#progress-check-list");
  const resumeList = document.querySelector("#resume-list");
  const resumeSearch = document.querySelector("#resume-search");
  const searchEmpty = document.querySelector("#resume-search-empty");
  const emptyState = document.querySelector("#resume-empty-state");
  const listStatus = document.querySelector("#resume-list-status");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const templateNames = {
    "modern-pro": "Modern Pro",
    timeless: "Timeless",
    plain: "Plain",
    blogger: "Blogger",
    pacific: "Pacific",
    "general-ats": "General ATS"
  };
  let resumes = [];

  function readLocalJson(key) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Unable to read ${key} from this browser.`, error);
      return null;
    }
  }

  function hasLocalDraft(storageCheck) {
    try {
      return storageCheck();
    } catch (error) {
      console.error("Unable to check browser draft storage.", error);
      return false;
    }
  }

  function readinessFor(content) {
    const data = content?.data || {};
    const entries = content?.entries || {};
    const experience = Array.isArray(entries.experience) ? entries.experience : [];
    const education = Array.isArray(entries.education) ? entries.education : [];
    const checks = [
      Boolean(data.name?.trim() && data.title?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || "")),
      experience.some((item) => item?.role?.trim() && item?.company?.trim()),
      education.some((item) => item?.degree?.trim() && item?.school?.trim()),
      Boolean(data.skills?.trim()),
      Boolean(data.summary?.trim()),
      experience.some((item) => /\d|%|\b(increased|improved|reduced|delivered|launched|led|built|created|achieved|saved|grew)\b/i.test(item?.description || ""))
    ];
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  }

  function renderProgress(content) {
    const data = content?.data || {};
    const entries = content?.entries || {};
    const experience = Array.isArray(entries.experience) ? entries.experience : [];
    const education = Array.isArray(entries.education) ? entries.education : [];
    const projects = Array.isArray(entries.projects) ? entries.projects : [];
    const certificates = Array.isArray(entries.certificates) ? entries.certificates : [];
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
    checksList.innerHTML = completionChecks.map((item) => `
      <li class="${item.complete ? "is-complete" : ""}">
        <span aria-hidden="true">${item.complete ? "✓" : "○"}</span>${escapeHtml(item.label)}
        <small>${item.complete ? "Complete" : "To do"}</small>
      </li>`).join("");
  }

  function renderResumeCards() {
    const query = resumeSearch.value.trim().toLowerCase();
    const filtered = resumes.filter((resume) => {
      const candidate = resume.content?.data?.name || "";
      const templateName = templateNames[resume.templateId] || resume.templateId;
      return `${resume.title} ${candidate} ${templateName}`.toLowerCase().includes(query);
    });
    resumeList.innerHTML = filtered.map((resume) => {
      const data = resume.content?.data || {};
      const candidate = data.name?.trim() || "Untitled resume";
      const title = resume.title || candidate;
      const templateName = templateNames[resume.templateId] || resume.templateId;
      const editUrl = `/resume-builder/${encodeURIComponent(resume.templateId)}?resume=${resume.id}`;
      return `
        <article class="resume-dashboard-card">
          <div class="resume-card-preview">
            <div class="resume-mini-paper">
              <div class="resume-mini-sidebar"><span></span><i></i><i></i><i></i><i></i></div>
              <div class="resume-mini-content"><strong>${escapeHtml(candidate)}</strong><small>${escapeHtml(data.title || "Add a professional title")}</small><b></b><i></i><i></i><i></i><b></b><i></i><i></i></div>
            </div>
            <span class="resume-default-badge">Account saved</span>
          </div>
          <div class="resume-card-copy">
            <div><h3>${escapeHtml(title)}</h3><span>${escapeHtml(data.title || "Resume")}</span></div>
            <small>${escapeHtml(templateName)} · Saved to your account</small>
            <div class="resume-card-meta">
              <span class="readiness-pill">${readinessFor(resume.content)}% readiness</span>
              <a href="${editUrl}">Edit resume →</a>
            </div>
            <div class="resume-card-meta">
              <button type="button" data-action="duplicate" data-resume-id="${resume.id}">Duplicate</button>
              <button type="button" data-action="delete" data-resume-id="${resume.id}">Delete</button>
            </div>
          </div>
        </article>`;
    }).join("");
    emptyState.hidden = resumes.length > 0;
    searchEmpty.hidden = resumes.length === 0 || filtered.length > 0;
    if (resumes.length === 0) {
      const currentDraftAvailable = hasLocalDraft(
        () => window.ResumeDraftStorage.hasCurrentDraft()
      );
      const legacyDraftAvailable = hasLocalDraft(
        () => window.ResumeDraftStorage.hasLegacyDraft()
      );
      emptyState.innerHTML = legacyDraftAvailable
        ? 'An unassigned browser draft is available. Open the editor and explicitly import it only if it belongs to your account.'
        : currentDraftAvailable
          ? 'A browser draft is available. Open the editor to explicitly save it to your account.'
          : "No account resumes yet. Create one to get started.";
    }
  }

  function renderDashboard() {
    const latest = resumes[0];
    const localDraft = readLocalJson(window.ResumeDraftStorage.draftKey);
    const progressContent = latest?.content || localDraft;
    const readiness = progressContent ? readinessFor(progressContent) : 0;
    const templateName = latest
      ? (templateNames[latest.templateId] || latest.templateId)
      : (localDraft?.templateName || "—");
    const stats = readLocalJson(statsKey) || { generations: 0 };
    document.querySelector("#stat-resumes").textContent = String(resumes.length);
    document.querySelector("#stat-generations").textContent =
      Number.isInteger(stats.generations) ? String(stats.generations) : "0";
    document.querySelector("#stat-readiness").textContent = progressContent ? `${readiness}%` : "—";
    document.querySelector("#stat-template").textContent = progressContent ? templateName : "—";
    document.querySelector("#dashboard-gauge").style.setProperty("--gauge-value", `${readiness}%`);
    document.querySelector("#dashboard-gauge-value").textContent = progressContent ? `${readiness}%` : "0%";
    renderProgress(progressContent || {});
    renderResumeCards();

    const activity = document.querySelector("#recent-activity-list");
    const recentItems = latest
      ? [{ icon: "▤", title: "Resume saved to your account", detail: latest.title }]
      : [{ icon: "✦", title: "Welcome to ResumePro", detail: "Create or import a resume to get started." }];
    if (Number.isInteger(stats.generations) && stats.generations > 0) {
      recentItems.unshift({
        icon: "✧",
        title: "Copilot suggestions created",
        detail: `${stats.generations} suggestion set${stats.generations === 1 ? "" : "s"} in this browser`
      });
    }
    activity.innerHTML = recentItems.map((item) => `
      <li><span class="activity-icon">${escapeHtml(item.icon)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div><time>Account</time></li>`).join("");
  }

  async function responseError(response) {
    try {
      const body = await response.json();
      return body.error || `Request failed (${response.status}).`;
    } catch (error) {
      console.error("Could not read the resume API error response.", error);
      return `Request failed (${response.status}).`;
    }
  }

  async function loadResumes() {
    listStatus.textContent = "Loading account resumes…";
    try {
      const response = await fetch("/api/resumes");
      if (!response.ok) throw new Error(await responseError(response));
      const result = await response.json();
      resumes = result.resumes;
      listStatus.textContent = "";
      renderDashboard();
    } catch (error) {
      listStatus.textContent = error.message || "Could not load account resumes.";
      console.error("Unable to load account resumes.", error);
    }
  }

  resumeSearch.addEventListener("input", renderResumeCards);
  resumeList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, resumeId } = button.dataset;
    if (action === "delete" && !window.confirm("Delete this resume from your account? This cannot be undone.")) {
      return;
    }
    button.disabled = true;
    try {
      const response = await fetch(
        action === "duplicate"
          ? `/api/resumes/${resumeId}/duplicate`
          : `/api/resumes/${resumeId}`,
        {
          method: action === "duplicate" ? "POST" : "DELETE",
          headers: { "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content }
        }
      );
      if (!response.ok) throw new Error(await responseError(response));
      await loadResumes();
    } catch (error) {
      listStatus.textContent = error.message || `Could not ${action} resume.`;
      console.error(`Unable to ${action} account resume.`, error);
      button.disabled = false;
    }
  });

  document.querySelector("#dashboard-search").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    resumeSearch.value = query;
    renderResumeCards();
    document.querySelectorAll(".quick-tools-grid a").forEach((link) => {
      link.hidden = Boolean(query) && !link.textContent.toLowerCase().includes(query);
    });
  });

  loadResumes();
})();
