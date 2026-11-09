/* Shared pieces for the v2 static screen mockups. */
const MARK = "../mark.png";
const I = {
  circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12.4" r="2.2" fill="currentColor" stroke="none"/><circle cx="5.6" cy="7.4" r="1.6" fill="currentColor" stroke="none"/><circle cx="18.4" cy="7.6" r="1.6" fill="currentColor" stroke="none"/><circle cx="16.6" cy="17.6" r="1.6" fill="currentColor" stroke="none"/><path d="M7 8.4 10.3 11.2M13.9 11.3 17 8.6M13.3 13.9l2.3 2.7"/></svg>`,
  hand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5.5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8.2a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5.1-2.9L3.2 13a1.5 1.5 0 0 1 2.5-1.6L8 14.5"/></svg>`,
  add: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="2.7"/><path d="M3.6 18.4c.8-2.6 2.7-4 5.4-4s4.6 1.4 5.4 4M17.2 6.2v5.2M14.6 8.8h5.2"/></svg>`,
  person: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="8" r="3"/><path d="M5.2 18.6c1.05-3 3.4-4.5 6.8-4.5s5.75 1.5 6.8 4.5"/></svg>`,
  fwd: `<svg class="fwd" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>`,
  out: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12.5 4 4 8-9"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.2V16H6.5A2.5 2.5 0 0 1 4 13.5z"/></svg>`,
  pen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m13.5 8.5 3 3"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`
};
const status = () => `<div class="status"><span>9:41</span><span class="sys"><i class="s"></i><i></i></span></div>`;
const home = () => `<div class="home"></div>`;
const tabs = (on) => `<nav class="tabs"><span class="tab ${on === "circle" ? "on" : ""}">${I.circle}Круг</span><span class="tab ${on === "ask" ? "on" : ""}"><span class="askmark">${I.hand}</span>Просьба</span><span class="tab ${on === "add" ? "on" : ""}">${I.add}Добавить</span><span class="tab ${on === "me" ? "on" : ""}">${I.person}Профиль</span></nav>`;
const nav = (back, title, trail, trailCls) => `<div class="nav"><span class="back">${I.back}${back}</span>${title ? `<span class="title">${title}</span>` : ""}${trail ? `<span class="trail ${trailCls || ""}">${trail}</span>` : ""}</div>`;
const row = (ava, name, sub, right) => `<div class="r"><span class="ava">${ava}</span><span class="t"><b>${name}</b>${sub ? `<span>${sub}</span>` : ""}</span>${right || ""}</div>`;
const path = (names) => `<div class="path">${names.map((n, i) => `<span class="${i === 0 ? "me" : i === names.length - 1 ? "end" : ""}"><i></i>${n}</span>${i < names.length - 1 ? "<em></em>" : ""}`).join("")}</div>`;
const meter = (mine, others, goal, opts = {}) => {
  const m = Math.min(100, mine / goal * 100), o = Math.min(100 - m, others / goal * 100);
  const mineKey = mine > 0 ? `<span><i style="background:var(--ink)"></i>Вы ${mine} $</span>` : "";
  const restLabel = mine > 0 ? "Другие" : "Собрано";
  return `<div class="meter"><i class="mine" style="width:${m}%"></i><i class="rest" style="width:${o}%"></i></div><div class="meterkey">${mineKey}<span><i style="background:var(--teal)"></i>${restLabel} ${others} $</span><b>Цель ${goal} $</b></div>`;
};
const stages = (step) => `<div class="stages">${["Сумма", "Обсуждение", "Закрыт"].map((n, i) => `<div class="${i < step ? "on" : ""}"><i></i><span>${n}</span></div>`).join("")}</div>`;
function section(id, phone, title, html) {
  return `<section class="variant" id="${id}">${phone}<h2>${title}</h2>${html}</section>`;
}
