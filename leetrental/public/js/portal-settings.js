// public/js/portal-settings.js
(() => {
  // ---- Persistence keys ----
  const KEY_SCALE = "font_scale_v1";
  const KEY_THEME = "theme_v1"; // "light" | "dark" | "system"

  // ---- Font scale helpers (scales your CSS vars) ----
  const MIN = 0.8, MAX = 1.6, STEP = 0.1;
  const readPxVar = (name) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const num = parseFloat(raw.replace("px",""));
    return Number.isFinite(num) ? num : null;
  };
  const ORIGINALS = {
    "--text-xs": readPxVar("--text-xs") ?? 12,
    "--text-sm": readPxVar("--text-sm") ?? 14,
    "--text-base": readPxVar("--text-base") ?? 14,
  };
  let scale = parseFloat(localStorage.getItem(KEY_SCALE) || "1") || 1;

  const applyScale = () => {
    const s = Math.max(MIN, Math.min(MAX, scale));
    for (const [name, px] of Object.entries(ORIGINALS)) {
      document.documentElement.style.setProperty(name, `${Math.round(px * s * 100)/100}px`);
    }
    document.documentElement.setAttribute("data-font-scale", String(s));
  };
  const setScale = (v) => { scale = v; localStorage.setItem(KEY_SCALE, String(scale)); applyScale(); };
  const incScale = () => setScale(parseFloat((scale + STEP).toFixed(2)));
  const decScale = () => setScale(parseFloat((scale - STEP).toFixed(2)));
  const resetScale = () => setScale(1);

  // ---- Theme helpers ----
  const applyTheme = (mode) => {
    // mode: "light" | "dark" | "system"
    const sysDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const effective = mode === "system" ? (sysDark ? "dark" : "light") : mode;
    document.documentElement.dataset.theme = effective; // e.g., [data-theme="dark"]
    document.documentElement.classList.toggle("dark", effective === "dark"); // if your CSS uses .dark
  };
  const saveTheme = (mode) => { localStorage.setItem(KEY_THEME, mode); applyTheme(mode); };

  // ---- UI: settings button + panel ----
  const createLauncher = () => {
    if (document.getElementById("portal-settings-launcher")) return;

    const btn = document.createElement("button");
    btn.id = "portal-settings-launcher";
    btn.className = "portal-settings-launcher";
    btn.type = "button";
    btn.title = "Settings";
    btn.setAttribute("aria-label", "Settings");
    btn.innerHTML = `
      <span class="psl-icon">⚙️</span>
      <span class="psl-text">Settings</span>
    `;

    // Prefer sidebar bottom-left; fallback to fixed bottom-left
    const sidebar =
      document.querySelector(".website-sidebar") ||      // portal left sidebar (website)
      document.querySelector(".layout-side-section") ||  // classic portal
      document.querySelector(".desk-sidebar");           // if Desk is reused

    if (sidebar) {
      // Place in a holder stuck to bottom
      let holder = sidebar.querySelector(".portal-settings-holder");
      if (!holder) {
        holder = document.createElement("div");
        holder.className = "portal-settings-holder";
        sidebar.appendChild(holder);
      }
      holder.appendChild(btn);
    } else {
      document.body.appendChild(btn);
    }

    btn.addEventListener("click", togglePanel);
  };

  const createPanel = () => {
    if (document.getElementById("portal-settings-panel")) return;

    const panel = document.createElement("div");
    panel.id = "portal-settings-panel";
    panel.className = "portal-settings-panel hidden";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.innerHTML = `
      <div class="psp-header">
        <div class="psp-title">Settings</div>
        <button type="button" class="psp-close" aria-label="Close">✕</button>
      </div>

      <div class="psp-section">
        <div class="psp-label">Font size</div>
        <div class="psp-row">
          <button type="button" class="psp-btn" id="psp-dec">A−</button>
          <button type="button" class="psp-btn" id="psp-reset">A</button>
          <button type="button" class="psp-btn" id="psp-inc">A+</button>
          <div class="psp-hint" id="psp-font-hint"></div>
        </div>
      </div>

      <div class="psp-section">
        <div class="psp-label">Theme</div>
        <div class="psp-row psp-theme">
          <label><input type="radio" name="theme" value="light"> Light</label>
          <label><input type="radio" name="theme" value="dark"> Dark</label>
          <label><input type="radio" name="theme" value="system"> System</label>
        </div>
      </div>

      <div class="psp-section">
        <div class="psp-label">Account</div>
        <div class="psp-links">
          <a href="/me" class="psp-link">My Account</a>
          <a id="fullscreen-button" class="psp-link">Fullscreen</a>
          <a href="/update-password" class="psp-link">Change Password</a>
          <a href="/app?cmd=frappe.auth.logout" class="psp-link">Logout</a>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const fullscreenButton = document.getElementById('fullscreen-button');
const myElement = document.querySelector('body');

fullscreenButton.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    myElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

myElement.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement === myElement) {
    console.log('Element is now full screen');
  } else {
    console.log('Element is no longer full screen');
  }
});
    // Wire actions
    panel.querySelector(".psp-close").onclick = togglePanel;
    panel.querySelector("#psp-dec").onclick = () => { decScale(); updateFontHint(); };
    panel.querySelector("#psp-inc").onclick = () => { incScale(); updateFontHint(); };
    panel.querySelector("#psp-reset").onclick = () => { resetScale(); updateFontHint(); };

    const themeSaved = localStorage.getItem(KEY_THEME) || "system";
    panel.querySelectorAll('input[name="theme"]').forEach(el => {
      el.checked = el.value === themeSaved;
      el.addEventListener("change", (e) => saveTheme(e.target.value));
    });

    updateFontHint();
  };

  const updateFontHint = () => {
    const el = document.getElementById("psp-font-hint");
    if (el) el.textContent = `${Math.round((scale || 1) * 100)}%`;
  };

  const togglePanel = () => {
    const panel = document.getElementById("portal-settings-panel");
    panel?.classList.toggle("hidden");
  };

  // ---- Init on load / route changes ----
  const init = () => {
    // Apply saved settings
    applyScale();
    applyTheme(localStorage.getItem(KEY_THEME) || "system");

    createLauncher();
    createPanel();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  window.addEventListener("hashchange", init);
  if (window.frappe?.router?.on) frappe.router.on("change", init);

  // Optional: keyboard shortcuts work everywhere
  document.addEventListener("keydown", (e) => {
    const meta = e.ctrlKey || e.metaKey;
    if (!meta) return;
    if (e.key === "+" || e.key === "=") { e.preventDefault(); incScale(); updateFontHint(); }
    if (e.key === "-") { e.preventDefault(); decScale(); updateFontHint(); }
    if (e.key === "0") { e.preventDefault(); resetScale(); updateFontHint(); }
  });

  // React to system theme changes when in "system"
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", () => {
      const mode = localStorage.getItem(KEY_THEME) || "system";
      if (mode === "system") applyTheme("system");
    });
  }
})();
