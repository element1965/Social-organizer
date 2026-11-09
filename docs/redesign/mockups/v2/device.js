/* Device-aware entry for the site: the native way in first, Telegram second, the rest as text. */
function detectDevice() {
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  return "desktop";
}
const DEV_LABEL = { android: "Android", ios: "iPhone", desktop: "Компьютер" };

/* hero: the one action that fits the device, the browser as the alternative */
function heroCta(dev) {
  const a = dev === "android" ? `<span class="btn primary">${I.play}Установить из Google Play</span><span class="btn secondary">В браузере</span>`
    : dev === "ios" ? `<span class="btn primary">${I.apple}Скачать в App Store</span><span class="btn secondary">В браузере</span>`
    : `<span class="btn primary">Начать в браузере</span><span class="btn secondary">Как это работает</span>`;
  const tg = dev === "desktop" ? "" : `<p class="alt">${I.tg}Удобнее в Telegram? <u>Откройте там</u></p>`;
  return `<div class="cta">${a}</div>${tg}`;
}

/* sign-in buttons: native first, Telegram second, e-mail as text, the other native way as a small link */
function authButtons(dev, style) {
  const google = `<div class="auth google">${I.google}Продолжить с Google</div>`;
  const apple = `<div class="auth apple">${I.apple}Продолжить с Apple</div>`;
  const tg = `<div class="auth tg">${I.tg}Продолжить с Telegram</div>`;
  const order = dev === "android" ? [google, tg] : dev === "ios" ? [apple, google, tg] : [google, apple, tg];
  const more = dev === "android" ? `<p class="legal">Есть Apple ID? <u>Войти через Apple</u></p>` : "";
  return `<div class="auths"${style ? ` style="${style}"` : ""}>${order.join("")}</div><div class="mail">Войти по почте</div>${more}<p class="legal">Продолжая, вы принимаете <u>условия</u> и <u>политику</u>.</p>`;
}

/* store block: the device's store first and dark, the rest light; a QR for the phone on desktop */
function storeButtons(dev) {
  const play = (p) => `<span class="store ${p ? "" : "light"}">${I.play}Google Play</span>`;
  const app = (p) => `<span class="store ${p ? "" : "light"}">${I.apple}App Store</span>`;
  const tg = `<span class="store light">${I.tg}Открыть в Telegram</span>`;
  const web = (p) => `<span class="store ${p ? "" : "light"}">В браузере</span>`;
  if (dev === "android") return `<div class="stores">${play(true)}${web(false)}${tg}</div>`;
  if (dev === "ios") return `<div class="stores">${app(true)}${web(false)}${tg}</div>`;
  return `<div class="stores">${web(true)}${play(false)}${app(false)}${tg}</div><div class="qrcard">${qrMini()}<span><b>Приложение на телефон</b><span>Наведите камеру: откроется нужный магазин.</span></span></div>`;
}
function qrMini() { let o = ""; for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) { const f = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13); const edge = f && (x % 7 === 0 || y % 7 === 0 || x === 14 || x === 20 || y === 14 || y === 20); const core = (x > 1 && x < 5 && y > 1 && y < 5) || (x > 15 && x < 19 && y > 1 && y < 5) || (x > 1 && x < 5 && y > 15 && y < 19); if (edge || core || (!f && ((x * 3 + y * 5) % 4 === 0))) o += `<rect x="${x}" y="${y}" width="1" height="1"/>`; } return `<svg viewBox="0 0 21 21" fill="var(--ink)" class="qrmini">${o}</svg>`; }
