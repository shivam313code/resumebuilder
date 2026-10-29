(() => {
  const userId = document.body.dataset.userId;
  const storageKey = `forma-settings-${userId}`;
  const resumeStorage = window.ResumeDraftStorage;
  const profileForm = document.querySelector("#profile-form");
  const profileFeedback = document.querySelector("#settings-feedback");
  const preferencesFeedback = document.querySelector("#preferences-feedback");
  const privacyFeedback = document.querySelector("#privacy-feedback");
  const defaults = {
    profile: { name: document.body.dataset.profileName, title: "", phone: "", location: "", linkedin: "", bio: "", github: "", portfolio: "", photo: "", visible: false },
    preferences: { theme: "light", template: "modern-pro", font: "modern", tone: "professional", notifications: { interviews: true, followups: true, resumeTips: true } }
  };
  let settings = defaults;

  function showMessage(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("is-error", isError);
  }

  function readSettings() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== "object") throw new Error("Saved settings have an invalid format.");
      settings = {
        profile: { ...defaults.profile, ...(parsed.profile || {}) },
        preferences: {
          ...defaults.preferences,
          ...(parsed.preferences || {}),
          notifications: { ...defaults.preferences.notifications, ...(parsed.preferences?.notifications || {}) }
        }
      };
    } catch (error) {
      console.error("Unable to read local profile settings.", error);
      showMessage(profileFeedback, "Saved settings could not be read. You can update and save them again.", true);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
      document.body.dataset.theme = settings.preferences.theme;
      window.dispatchEvent(new CustomEvent("workspace-preferences-updated", { detail: settings.preferences }));
      return true;
    } catch (error) {
      console.error("Unable to save local profile settings.", error);
      return false;
    }
  }

  function populateForm() {
    const fields = {
      "profile-name": settings.profile.name,
      "profile-title": settings.profile.title,
      "profile-phone": settings.profile.phone,
      "profile-location": settings.profile.location,
      "profile-linkedin": settings.profile.linkedin,
      "profile-bio": settings.profile.bio,
      "profile-github": settings.profile.github,
      "profile-portfolio": settings.profile.portfolio
    };
    for (const [id, value] of Object.entries(fields)) document.getElementById(id).value = value || "";
    document.querySelector("#pref-theme").value = settings.preferences.theme;
    document.querySelector("#pref-template").value = settings.preferences.template;
    document.querySelector("#pref-font").value = settings.preferences.font;
    document.querySelector("#pref-tone").value = settings.preferences.tone;
    document.querySelector("#notify-interviews").checked = settings.preferences.notifications.interviews;
    document.querySelector("#notify-followups").checked = settings.preferences.notifications.followups;
    document.querySelector("#notify-resume-tips").checked = settings.preferences.notifications.resumeTips;
    document.querySelector("#profile-visibility").checked = settings.profile.visible;
    updatePhoto(settings.profile.photo);
    updateTemplateLink();
    updateBioCount();
  }

  function updatePhoto(photo) {
    const image = document.querySelector("#settings-avatar-preview");
    const fallback = document.querySelector("#settings-avatar-fallback");
    if (photo) {
      image.src = photo;
      image.hidden = false;
      fallback.hidden = true;
    } else {
      image.removeAttribute("src");
      image.hidden = true;
      fallback.hidden = false;
    }
  }

  function updateTemplateLink() {
    const template = document.querySelector("#pref-template").value;
    document.querySelector("#open-default-template").href = `/resume-builder/${encodeURIComponent(template)}`;
  }

  function syncProfileSummary() {
    const name = document.querySelector("#profile-name").value.trim();
    const title = document.querySelector("#profile-title").value.trim();
    document.querySelector("#settings-profile-display-name").textContent = name || "Your name";
    document.querySelector("#settings-profile-title").textContent = title || "Add a professional title";
    document.querySelector("#settings-top-name").textContent = name || "ResumePro account";
    document.querySelector("#settings-top-avatar").textContent = (name || "?").slice(0, 1).toUpperCase();
    document.querySelector("#settings-avatar-fallback").textContent = (name || "?").slice(0, 1).toUpperCase();
    updateBioCount();
    renderCompletion();
  }

  function renderCompletion() {
    let draft = null;
    try {
      draft = resumeStorage.readDraft();
    } catch (error) {
      console.error("Unable to read the local resume draft for profile completion.", error);
    }
    const profile = settings.profile;
    const data = draft?.data || {};
    const entries = draft?.entries || {};
    const checks = [
      { label: "Personal information", complete: Boolean(profile.name && profile.phone && profile.location) },
      { label: "Professional summary", complete: Boolean(data.summary?.trim() || profile.bio.trim()) },
      { label: "Work experience", complete: Array.isArray(entries.experience) && entries.experience.some((entry) => entry?.role?.trim() && entry?.company?.trim()) },
      { label: "Education", complete: Array.isArray(entries.education) && entries.education.some((entry) => entry?.degree?.trim() && entry?.school?.trim()) },
      { label: "Skills", complete: Boolean(data.skills?.trim()) },
      { label: "Certifications", complete: Array.isArray(entries.certificates) && entries.certificates.some((entry) => entry?.name?.trim()) },
      { label: "Projects", complete: Array.isArray(entries.projects) && entries.projects.some((entry) => entry?.name?.trim()) }
    ];
    const percentage = Math.round(checks.filter((item) => item.complete).length / checks.length * 100);
    document.querySelector("#settings-completion-value").textContent = `${percentage}%`;
    document.querySelector("#settings-completion-gauge").style.setProperty("--completion-value", `${percentage}%`);
    document.querySelector("#settings-completion-list").innerHTML = checks.map((item) =>
      `<li class="${item.complete ? "is-complete" : ""}"><span>${item.complete ? "✓" : "○"}</span>${item.label}</li>`
    ).join("");
  }

  function updateBioCount() {
    document.querySelector("#profile-bio-count").textContent = String(document.querySelector("#profile-bio").value.length);
  }

  function setProfileValues() {
    settings.profile = {
      ...settings.profile,
      name: document.querySelector("#profile-name").value.trim(),
      title: document.querySelector("#profile-title").value.trim(),
      phone: document.querySelector("#profile-phone").value.trim(),
      location: document.querySelector("#profile-location").value.trim(),
      linkedin: document.querySelector("#profile-linkedin").value.trim(),
      bio: document.querySelector("#profile-bio").value.trim(),
      github: document.querySelector("#profile-github").value.trim(),
      portfolio: document.querySelector("#profile-portfolio").value.trim(),
      visible: document.querySelector("#profile-visibility").checked
    };
  }

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setProfileValues();
    if (!profileForm.reportValidity()) return;
    showMessage(profileFeedback, "Saving profile…");
    try {
      const response = await fetch("/account/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
        },
        body: JSON.stringify({ name: settings.profile.name })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Your profile could not be saved.");
      settings.profile.name = result.name;
      if (!saveSettings()) throw new Error("Your profile was updated, but this browser could not save the additional profile details.");
      syncProfileSummary();
      showMessage(profileFeedback, "Profile saved to your account and this browser.");
    } catch (error) {
      console.error("Unable to save profile settings.", error);
      showMessage(profileFeedback, error.message || "Could not save your profile. Check your connection and try again.", true);
    }
  });

  document.querySelector("#profile-bio").addEventListener("input", updateBioCount);
  document.querySelector("#profile-name").addEventListener("input", syncProfileSummary);
  document.querySelector("#profile-title").addEventListener("input", syncProfileSummary);

  document.querySelector("#pref-theme").addEventListener("change", () => {
    settings.preferences.theme = document.querySelector("#pref-theme").value;
    if (saveSettings()) showMessage(preferencesFeedback, "Theme preference saved.");
    else showMessage(preferencesFeedback, "Could not save the theme preference in this browser.", true);
  });

  for (const id of ["#pref-template", "#pref-font"]) {
    document.querySelector(id).addEventListener("change", () => {
      settings.preferences.template = document.querySelector("#pref-template").value;
      settings.preferences.font = document.querySelector("#pref-font").value;
      updateTemplateLink();
      const saved = saveSettings();
      showMessage(preferencesFeedback, saved ? "Editor preferences saved." : "Could not save preferences in this browser.", !saved);
    });
  }

  document.querySelector("#save-content-settings").addEventListener("click", () => {
    settings.preferences.tone = document.querySelector("#pref-tone").value;
    const saved = saveSettings();
    showMessage(preferencesFeedback, saved ? "Writing preference saved." : "Could not save preferences in this browser.", !saved);
  });

  const notificationFields = {
    "#notify-interviews": "interviews",
    "#notify-followups": "followups",
    "#notify-resume-tips": "resumeTips"
  };
  for (const [selector, key] of Object.entries(notificationFields)) {
    document.querySelector(selector).addEventListener("change", (event) => {
      settings.preferences.notifications[key] = event.target.checked;
      const saved = saveSettings();
      showMessage(preferencesFeedback, saved ? "Reminder preference saved on this device." : "Could not save preferences in this browser.", !saved);
    });
  }

  document.querySelector("#profile-visibility").addEventListener("change", (event) => {
    settings.profile.visible = event.target.checked;
    const message = event.target.checked
      ? "Preference saved. Your profile is not published or visible to recruiters by this app."
      : "Profile visibility preference saved.";
    const saved = saveSettings();
    showMessage(profileFeedback, saved ? message : "Could not save this preference in your browser.", !saved);
  });

  document.querySelector("#settings-avatar-file").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 1_000_000) {
      showMessage(profileFeedback, "Choose a PNG, JPEG, or WebP image smaller than 1 MB.", true);
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      settings.profile.photo = String(reader.result);
      if (!saveSettings()) {
        showMessage(profileFeedback, "Could not save this photo in your browser. Try a smaller image.", true);
        return;
      }
      updatePhoto(settings.profile.photo);
      showMessage(profileFeedback, "Profile photo saved on this device.");
    });
    reader.addEventListener("error", () => showMessage(profileFeedback, "The selected photo could not be read.", true));
    reader.readAsDataURL(file);
  });

  document.querySelector(".settings-password-form").addEventListener("submit", (event) => {
    const newPassword = event.currentTarget.elements.new_password;
    const confirmation = event.currentTarget.elements.confirm_password;
    confirmation.setCustomValidity(newPassword.value === confirmation.value ? "" : "The new passwords do not match.");
    if (!event.currentTarget.reportValidity()) event.preventDefault();
  });

  document.querySelector("#export-local-data").addEventListener("click", () => {
    try {
      const data = resumeStorage.buildExportData({
        profile: settings.profile,
        preferences: settings.preferences,
        jobApplications: JSON.parse(localStorage.getItem(`forma-job-tracker-${userId}`) || "[]"),
        exportedAt: new Date().toISOString()
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "resumepro-local-data.json";
      link.click();
      URL.revokeObjectURL(url);
      showMessage(privacyFeedback, "A copy of this account's profile, preferences, applications, and resume was downloaded.");
    } catch (error) {
      console.error("Unable to export local ResumePro data.", error);
      showMessage(privacyFeedback, "Could not export local data. Check that the saved data is valid and try again.", true);
    }
  });

  document.querySelector("#clear-local-data").addEventListener("click", () => {
    if (!window.confirm("Clear this account's saved profile, preferences, resume draft, and job applications from this browser? This cannot be undone. Your account, any unassigned legacy draft, and active share links will not be deleted.")) return;
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(`forma-job-tracker-${userId}`);
      resumeStorage.clearDraft();
      settings = defaults;
      populateForm();
      document.body.dataset.theme = defaults.preferences.theme;
      window.dispatchEvent(new CustomEvent("workspace-preferences-updated", { detail: defaults.preferences }));
      renderCompletion();
      showMessage(privacyFeedback, "This account's local profile, preferences, resume draft, and job applications were cleared.");
    } catch (error) {
      console.error("Unable to clear local ResumePro data.", error);
      showMessage(privacyFeedback, "Could not clear local data in this browser.", true);
    }
  });

  document.querySelector("#settings-search").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll(".settings-menu a").forEach((link) => {
      link.hidden = Boolean(query) && !link.textContent.toLowerCase().includes(query);
    });
  });
  const legacyDraftNotice = document.querySelector("#legacy-draft-notice");
  const importLegacyDraftButton = document.querySelector("#import-legacy-draft");
  try {
    const legacyDraftExists = resumeStorage.hasLegacyDraft();
    legacyDraftNotice.hidden = !legacyDraftExists;
    importLegacyDraftButton.hidden = !legacyDraftExists || resumeStorage.hasCurrentDraft();
  } catch (error) {
    console.error("Unable to check for an unassigned legacy resume draft.", error);
  }
  importLegacyDraftButton.addEventListener("click", () => {
    if (!window.confirm("This older draft has no account information and will be assigned to the signed-in account. Import it only if you are certain it belongs to you. Continue?")) return;
    try {
      if (!resumeStorage.importLegacyDraft()) {
        showMessage(privacyFeedback, "No unassigned legacy draft was found.", true);
        return;
      }
      legacyDraftNotice.hidden = true;
      importLegacyDraftButton.hidden = true;
      renderCompletion();
      showMessage(privacyFeedback, "The unassigned draft was imported into this account.");
    } catch (error) {
      console.error("Unable to import the unassigned legacy resume draft.", error);
      showMessage(privacyFeedback, error.message || "Could not import the unassigned draft.", true);
    }
  });
  document.querySelectorAll(".settings-menu a[href^='#']").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".settings-menu a").forEach((item) => item.classList.toggle("active", item === link));
    });
  });

  readSettings();
  settings.profile.name = document.body.dataset.profileName;
  populateForm();
  const draft = (() => {
    try {
      return resumeStorage.readDraft();
    } catch (error) {
      console.error("Unable to read the resume draft for profile defaults.", error);
      return null;
    }
  })();
  if (draft?.data && !settings.profile.title) {
    settings.profile.title = String(draft.data.title || "");
    document.querySelector("#profile-title").value = settings.profile.title;
    syncProfileSummary();
  }
  renderCompletion();
})();
