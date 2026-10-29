(() => {
  const userId = document.body.dataset.userId;
  if (!/^\d+$/.test(userId || "")) {
    throw new Error("Resume storage requires a valid signed-in account identifier.");
  }

  const draftKey = `forma-resume-draft-${userId}`;
  const legacyDraftKey = "forma-resume-draft";
  const activeAccountKey = "forma-active-account";

  try {
    localStorage.setItem(activeAccountKey, userId);
  } catch (error) {
    console.error("Unable to record the active account for this browser.", error);
  }

  window.addEventListener("storage", (event) => {
    if (event.key === activeAccountKey && event.newValue && event.newValue !== userId) {
      window.location.reload();
    }
  });

  function readDraft() {
    const saved = localStorage.getItem(draftKey);
    return saved ? JSON.parse(saved) : null;
  }

  function saveDraft(draft) {
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }

  function clearDraft() {
    localStorage.removeItem(draftKey);
  }

  function hasCurrentDraft() {
    return localStorage.getItem(draftKey) !== null;
  }

  function hasLegacyDraft() {
    return localStorage.getItem(legacyDraftKey) !== null;
  }

  function importLegacyDraft() {
    if (hasCurrentDraft()) {
      throw new Error("A draft already exists for this account.");
    }
    const saved = localStorage.getItem(legacyDraftKey);
    if (saved === null) return false;
    const draft = JSON.parse(saved);
    if (
      !draft ||
      typeof draft !== "object" ||
      !draft.data ||
      typeof draft.data !== "object" ||
      Array.isArray(draft.data) ||
      !draft.entries ||
      typeof draft.entries !== "object" ||
      Array.isArray(draft.entries)
    ) {
      throw new Error("The unassigned legacy draft has an invalid format.");
    }
    localStorage.setItem(draftKey, saved);
    localStorage.removeItem(legacyDraftKey);
    return true;
  }

  function buildExportData({ profile, preferences, jobApplications, exportedAt }) {
    return {
      profile,
      preferences,
      jobApplications,
      resumeDraft: readDraft(),
      exportedAt
    };
  }

  window.ResumeDraftStorage = Object.freeze({
    draftKey,
    readDraft,
    saveDraft,
    clearDraft,
    hasCurrentDraft,
    hasLegacyDraft,
    importLegacyDraft,
    buildExportData
  });
})();
