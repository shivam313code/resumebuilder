(() => {
  const userId = document.body.dataset.userId;
  if (!userId) return;
  try {
    const saved = localStorage.getItem(`forma-settings-${userId}`);
    const preferences = saved ? JSON.parse(saved).preferences : null;
    if (preferences && ["light", "dark", "system"].includes(preferences.theme)) {
      document.body.dataset.theme = preferences.theme;
    }
  } catch (error) {
    console.error("Unable to load workspace preferences.", error);
  }
})();
