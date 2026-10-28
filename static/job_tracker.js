(() => {
  const userId = document.body.dataset.userId;
  const storageKey = `forma-job-tracker-${userId}`;
  const dialog = document.querySelector("#job-dialog");
  const form = document.querySelector("#job-form");
  const tableBody = document.querySelector("#job-table-body");
  const feedback = document.querySelector("#job-feedback");
  const statuses = ["Applied", "Under Review", "Interview", "Offer", "Rejected"];
  const statusColors = {
    Applied: "#7542db",
    "Under Review": "#e9a931",
    Interview: "#3289df",
    Offer: "#1db18e",
    Rejected: "#e65367"
  };
  const statusIcons = { Applied: "↗", "Under Review": "◷", Interview: "▦", Offer: "✓", Rejected: "×" };
  const state = { applications: [], activeTab: "all", selectedDate: "", visibleMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), analyticsPeriod: "all", showAllEvents: false };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function showFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
  }

  function readApplications() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error("Saved job applications have an invalid format.");
      return parsed.filter((job) =>
        job && typeof job.id === "string" && typeof job.title === "string" &&
        typeof job.company === "string" && statuses.includes(job.status)
      );
    } catch (error) {
      console.error("Unable to read saved job applications.", error);
      showFeedback("Saved applications could not be read. Export or clear local data in Settings before adding new jobs.", true);
      return [];
    }
  }

  function saveApplications() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.applications));
      showFeedback("Application changes saved in this browser.");
      return true;
    } catch (error) {
      console.error("Unable to save job applications in this browser.", error);
      showFeedback("Could not save your application. Check available browser storage and try again.", true);
      return false;
    }
  }

  function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
    if (!value) return "—";
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return "—";
    return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, day));
  }

  function dateValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function matchesFilters(job) {
    const search = `${document.querySelector("#job-search").value} ${document.querySelector("#job-global-search").value}`.trim().toLowerCase();
    const statusFilter = document.querySelector("#job-status-filter").value;
    const matchesSearch = `${job.title} ${job.company} ${job.location} ${job.nextStep} ${job.notes}`.toLowerCase().includes(search);
    const matchesTab = state.activeTab === "all" || job.status === state.activeTab;
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    const matchesDate = !state.selectedDate || job.appliedDate === state.selectedDate || job.nextDate === state.selectedDate;
    return matchesSearch && matchesTab && matchesStatus && matchesDate;
  }

  function sortedApplications(applications) {
    const sort = document.querySelector("#job-sort").value;
    return [...applications].sort((a, b) => {
      if (sort === "oldest") return a.appliedDate.localeCompare(b.appliedDate);
      if (sort === "company") return a.company.localeCompare(b.company);
      if (sort === "next-step") return (a.nextDate || "9999-12-31").localeCompare(b.nextDate || "9999-12-31");
      return b.appliedDate.localeCompare(a.appliedDate);
    });
  }

  function renderTable() {
    const matching = sortedApplications(state.applications.filter(matchesFilters));
    tableBody.innerHTML = matching.map((job) => {
      const safeUrl = /^https?:\/\//i.test(job.url || "") ? job.url : "";
      const title = safeUrl
        ? `<a class="job-title-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.title)}</a>`
        : `<strong>${escapeHtml(job.title)}</strong>`;
      const statusOptions = statuses.map((status) =>
        `<option value="${status}" ${status === job.status ? "selected" : ""}>${status}</option>`
      ).join("");
      return `<tr data-job-id="${escapeHtml(job.id)}">
        <td><div class="job-title-cell">${title}<small>${escapeHtml(job.location || "Location not added")} <span>·</span> ${escapeHtml(job.workType || "Work type not set")}</small></div></td>
        <td><span class="company-mark">${escapeHtml(job.company.slice(0, 1).toUpperCase())}</span><strong>${escapeHtml(job.company)}</strong></td>
        <td><label class="job-status-label status-${job.status.toLowerCase().replaceAll(" ", "-")}" aria-label="Status for ${escapeHtml(job.title)}"><select data-action="status" data-job-id="${escapeHtml(job.id)}" aria-label="Change status for ${escapeHtml(job.title)}">${statusOptions}</select></label></td>
        <td>${escapeHtml(formatDate(job.appliedDate))}</td>
        <td><div class="job-next-step"><span>${job.nextStep ? escapeHtml(job.nextStep) : "No next step"}</span><small>${job.nextDate ? escapeHtml(formatDate(job.nextDate)) : "Add a reminder date"}</small></div></td>
        <td><div class="job-row-actions"><button type="button" data-action="edit" data-job-id="${escapeHtml(job.id)}" aria-label="Edit ${escapeHtml(job.title)}">✎</button><button type="button" data-action="delete" data-job-id="${escapeHtml(job.id)}" aria-label="Delete ${escapeHtml(job.title)}">⋯</button></div></td>
      </tr>`;
    }).join("");
    const hasApplications = state.applications.length > 0;
    document.querySelector("#job-empty-state").hidden = hasApplications;
    document.querySelector("#job-no-results").hidden = !hasApplications || matching.length > 0;
    document.querySelector(".job-table-scroll").hidden = matching.length === 0;
    document.querySelector(".job-status-tabs").hidden = !hasApplications;
    document.querySelector("#job-application-count").textContent = state.selectedDate
      ? `${matching.length} application${matching.length === 1 ? "" : "s"} for ${formatDate(state.selectedDate)} · Clear date filter to view all`
      : `${state.applications.length} saved application${state.applications.length === 1 ? "" : "s"} in this browser`;
    renderStats();
  }

  function percent(count, total) {
    return total ? `${Math.round(count / total * 100)}% of total` : "0% of total";
  }

  function renderStats() {
    const countStatus = (status) => state.applications.filter((job) => job.status === status).length;
    const total = state.applications.length;
    const interviewCount = countStatus("Interview");
    const stats = {
      "#job-stat-total": total,
      "#job-stat-review": countStatus("Under Review"),
      "#job-stat-interviews": interviewCount,
      "#job-stat-offers": countStatus("Offer"),
      "#job-stat-rejected": countStatus("Rejected"),
      "#job-stat-review-share": percent(countStatus("Under Review"), total),
      "#job-stat-interview-share": percent(interviewCount, total),
      "#job-stat-offer-share": percent(countStatus("Offer"), total),
      "#job-stat-rejected-share": percent(countStatus("Rejected"), total),
      "#job-tab-all": total,
      "#job-tab-applied": countStatus("Applied"),
      "#job-tab-review": countStatus("Under Review"),
      "#job-tab-interview": interviewCount,
      "#job-tab-offer": countStatus("Offer"),
      "#job-tab-rejected": countStatus("Rejected")
    };
    for (const [selector, value] of Object.entries(stats)) document.querySelector(selector).textContent = String(value);
    const thisMonth = state.applications.filter((job) => job.appliedDate.startsWith(dateValue(new Date()).slice(0, 7))).length;
    document.querySelector("#job-stat-month").textContent = thisMonth ? `${thisMonth} applied this month` : "Start tracking today";
    renderAnalytics();
  }

  function renderAnalytics() {
    const period = state.analyticsPeriod;
    const start = new Date();
    start.setDate(start.getDate() - Number(period === "all" ? 0 : period));
    const filtered = state.applications.filter((job) => period === "all" || new Date(`${job.appliedDate}T00:00:00`) >= start);
    const counts = Object.fromEntries(statuses.map((status) => [status, filtered.filter((job) => job.status === status).length]));
    const total = filtered.length;
    let current = 0;
    const slices = statuses.map((status) => {
      const from = current;
      current += total ? counts[status] / total * 100 : 0;
      return `${statusColors[status]} ${from}% ${current}%`;
    });
    document.querySelector("#job-donut").style.background = total
      ? `conic-gradient(${slices.join(", ")})`
      : "conic-gradient(#e9ebf4 0% 100%)";
    document.querySelector("#job-donut-total").textContent = String(total);
    document.querySelector("#job-analytics-legend").innerHTML = statuses.map((status) =>
      `<li><span><i style="--legend-color:${statusColors[status]}"></i>${status}</span><strong>${counts[status]} <small>${percent(counts[status], total).split(" ")[0]}</small></strong></li>`
    ).join("");
  }

  function renderUpcomingEvents() {
    const today = dateValue(new Date());
    const allUpcoming = state.applications
      .filter((job) => job.nextDate && job.nextDate >= today && job.nextStep)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    const upcoming = state.showAllEvents ? allUpcoming : allUpcoming.slice(0, 5);
    document.querySelector("#view-job-events").textContent = state.showAllEvents ? "Show Less" : "View All";
    document.querySelector("#view-job-events").hidden = allUpcoming.length <= 5;
    document.querySelector("#upcoming-job-events").innerHTML = upcoming.map((job) =>
      `<li><span class="upcoming-event-mark">${escapeHtml(job.company.slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(job.nextStep)}</strong><small>${escapeHtml(job.company)} · ${escapeHtml(job.title)}</small></div><time>${escapeHtml(formatDate(job.nextDate, { month: "short", day: "numeric" }))}</time><button type="button" data-edit-event="${escapeHtml(job.id)}" aria-label="Edit next step at ${escapeHtml(job.company)}">›</button></li>`
    ).join("");
    document.querySelector("#upcoming-events-empty").hidden = upcoming.length > 0;
  }

  function renderCalendar() {
    const year = state.visibleMonth.getFullYear();
    const month = state.visibleMonth.getMonth();
    document.querySelector("#calendar-month-label").textContent = state.visibleMonth.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const headings = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const items = headings.map((day) => `<span class="calendar-weekday">${day}</span>`);
    for (let blank = 0; blank < firstDay; blank += 1) items.push('<span class="calendar-blank"></span>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = dateValue(new Date(year, month, day));
      const applied = state.applications.some((job) => job.appliedDate === date);
      const interview = state.applications.some((job) => job.nextDate === date && job.status === "Interview");
      const next = state.applications.some((job) => job.nextDate === date);
      const isToday = date === dateValue(new Date());
      const classes = ["calendar-day", applied ? "has-applied" : "", interview ? "has-interview" : "", next && !interview ? "has-next-step" : "", isToday ? "is-today" : "", state.selectedDate === date ? "is-selected" : ""].filter(Boolean).join(" ");
      items.push(`<button type="button" class="${classes}" data-calendar-date="${date}" aria-label="${formatDate(date)}${applied || next ? ", has application activity" : ""}">${day}</button>`);
    }
    document.querySelector("#job-calendar").innerHTML = items.join("");
  }

  function render() {
    renderTable();
    renderUpcomingEvents();
    renderCalendar();
  }

  function openDialog(job = null) {
    form.reset();
    document.querySelector("#job-form-error").textContent = "";
    document.querySelector("#job-dialog-title").textContent = job ? "Edit Job Application" : "Add a Job Application";
    document.querySelector("#job-id").value = job?.id || "";
    document.querySelector("#job-title").value = job?.title || "";
    document.querySelector("#job-company").value = job?.company || "";
    document.querySelector("#job-location").value = job?.location || "";
    document.querySelector("#job-work-type").value = job?.workType || "On-site";
    document.querySelector("#job-status").value = job?.status || "Applied";
    document.querySelector("#job-applied-date").value = job?.appliedDate || dateValue(new Date());
    document.querySelector("#job-next-step").value = job?.nextStep || "";
    document.querySelector("#job-next-date").value = job?.nextDate || "";
    document.querySelector("#job-url").value = job?.url || "";
    document.querySelector("#job-notes").value = job?.notes || "";
    dialog.showModal();
  }

  function closeDialog() {
    dialog.close();
  }

  function updateStatus(id, status) {
    const job = state.applications.find((item) => item.id === id);
    if (!job || !statuses.includes(status)) return;
    job.status = status;
    job.updatedAt = new Date().toISOString();
    saveApplications();
    render();
  }

  document.querySelectorAll("[data-open-job-dialog]").forEach((button) => button.addEventListener("click", () => openDialog()));
  document.querySelector("#job-dialog-close").addEventListener("click", closeDialog);
  document.querySelector("#job-dialog-cancel").addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const id = document.querySelector("#job-id").value || crypto.randomUUID();
    const existing = state.applications.find((job) => job.id === id);
    const job = {
      id,
      title: document.querySelector("#job-title").value.trim(),
      company: document.querySelector("#job-company").value.trim(),
      location: document.querySelector("#job-location").value.trim(),
      workType: document.querySelector("#job-work-type").value,
      status: document.querySelector("#job-status").value,
      appliedDate: document.querySelector("#job-applied-date").value,
      nextStep: document.querySelector("#job-next-step").value.trim(),
      nextDate: document.querySelector("#job-next-date").value,
      url: document.querySelector("#job-url").value.trim(),
      notes: document.querySelector("#job-notes").value.trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.applications = existing
      ? state.applications.map((item) => item.id === id ? job : item)
      : [job, ...state.applications];
    if (!saveApplications()) return;
    closeDialog();
    render();
  });

  tableBody.addEventListener("change", (event) => {
    const select = event.target.closest('[data-action="status"]');
    if (select) updateStatus(select.dataset.jobId, select.value);
  });

  tableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const job = state.applications.find((item) => item.id === button.dataset.jobId);
    if (!job) return;
    if (button.dataset.action === "edit") openDialog(job);
    if (button.dataset.action === "delete" && window.confirm(`Delete the application for ${job.title} at ${job.company}?`)) {
      state.applications = state.applications.filter((item) => item.id !== job.id);
      if (saveApplications()) render();
    }
  });

  document.querySelector("#job-search").addEventListener("input", renderTable);
  document.querySelector("#job-global-search").addEventListener("input", (event) => {
    document.querySelector("#job-search").value = event.target.value;
    renderTable();
  });
  for (const selector of ["#job-status-filter", "#job-sort"]) {
    document.querySelector(selector).addEventListener("change", renderTable);
  }
  document.querySelector("#job-filter-toggle").addEventListener("click", (event) => {
    const panel = document.querySelector("#job-filter-panel");
    panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!panel.hidden));
  });

  document.querySelector(".job-status-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-job-tab]");
    if (!button) return;
    state.activeTab = button.dataset.jobTab;
    state.selectedDate = "";
    document.querySelectorAll("[data-job-tab]").forEach((tab) => tab.classList.toggle("active", tab === button));
    renderTable();
    renderCalendar();
  });

  document.querySelector("#analytics-period").addEventListener("change", (event) => {
    state.analyticsPeriod = event.target.value;
    renderAnalytics();
  });

  document.querySelector("#calendar-prev").addEventListener("click", () => {
    state.visibleMonth = new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  document.querySelector("#calendar-next").addEventListener("click", () => {
    state.visibleMonth = new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth() + 1, 1);
    renderCalendar();
  });
  document.querySelector("#job-calendar").addEventListener("click", (event) => {
    const day = event.target.closest("[data-calendar-date]");
    if (!day) return;
    state.selectedDate = state.selectedDate === day.dataset.calendarDate ? "" : day.dataset.calendarDate;
    renderTable();
    renderCalendar();
  });
  document.querySelector("#upcoming-job-events").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-event]");
    if (!button) return;
    const job = state.applications.find((item) => item.id === button.dataset.editEvent);
    if (job) openDialog(job);
  });
  document.querySelector("#view-job-events").addEventListener("click", () => {
    state.showAllEvents = !state.showAllEvents;
    renderUpcomingEvents();
  });

  state.applications = readApplications();
  render();
})();
