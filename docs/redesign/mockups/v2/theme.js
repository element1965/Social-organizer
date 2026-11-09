/* Theme switch for every mockup page: html.dark + localStorage "ds-dark". Pages with their own #theme button only get the class. */
(function () {
  const KEY = "ds-dark";
  let dark = matchMedia("(prefers-color-scheme: dark)").matches;
  try { const v = localStorage.getItem(KEY); if (v === "1" || v === "0") dark = v === "1"; } catch {}
  const label = (v) => (v ? "Светлая тема" : "Тёмная тема");
  const apply = (v) => {
    document.documentElement.classList.toggle("dark", v);
    const b = document.getElementById("themeBtn");
    if (b) b.textContent = label(v);
    document.dispatchEvent(new CustomEvent("themechange", { detail: v }));
  };
  apply(dark);
  const toggle = () => { const v = !document.documentElement.classList.contains("dark"); try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {} apply(v); };
  document.addEventListener("click", (e) => { if (e.target.closest("[data-theme-toggle]")) toggle(); });
  addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("theme")) return;
    const b = document.createElement("button");
    b.id = "themeBtn"; b.type = "button";
    b.textContent = label(document.documentElement.classList.contains("dark"));
    b.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:99;height:40px;padding:0 14px;border:0;border-radius:12px;background:var(--ink);color:var(--canvas);font:700 14px/1 var(--font, Manrope, sans-serif);cursor:pointer;box-shadow:var(--shadow-float)";
    b.onclick = toggle;
    document.body.appendChild(b);
  });
})();
