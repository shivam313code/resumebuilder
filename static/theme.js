(() => {
  const storageKey = "resumepro-theme";
  const root = document.documentElement;
  let theme = "dark";

  try {
    theme = localStorage.getItem(storageKey) === "light" ? "light" : "dark";
  } catch (_error) {
    // Keep the site usable when browser storage is unavailable.
  }

  const applyTheme = (nextTheme, persist = false) => {
    theme = nextTheme;
    root.dataset.theme = theme;
    root.classList.toggle("rp-light-theme", theme === "light");
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "light" ? "#f5f6ff" : "#10121b"
    );

    const toggle = document.querySelector("button.rp-theme-toggle");
    if (toggle) {
      const isLight = theme === "light";
      toggle.setAttribute("aria-pressed", String(isLight));
      toggle.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
    }

    if (persist) {
      try {
        localStorage.setItem(storageKey, theme);
      } catch (_error) {
        // The current page still changes theme if storage is unavailable.
      }
    }
  };

  applyTheme(theme);

  document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.querySelector("button.rp-theme-toggle");
    toggle?.addEventListener("click", () => {
      applyTheme(theme === "dark" ? "light" : "dark", true);
    });
  });
})();