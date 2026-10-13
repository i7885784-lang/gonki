import "./style.css";
import QRCode from "qrcode";
import { Network } from "./network";
import { Voice } from "./voice";
import type { Game } from "./game";
import { GameAudio } from "./audio";
import { RallyMap } from "./map";
import { at, LENGTH, notes, checkpoints } from "../shared/track";
import { elapsed, roleName, type RoomState } from "../shared/protocol";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const distance = (m: number) =>
  m >= 1000
    ? `${(m / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км`
    : `${Math.max(0, Math.round(m))} м`;
const time = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(
      2,
      "0",
    )}:${((ms % 60000) / 1000).toFixed(1).padStart(4, "0").replace(".", ",")}`;
const net = new Network(),
  voice = new Voice(net),
  sound = new GameAudio();
let game: Game | undefined,
  gamePromise: Promise<Game> | undefined,
  state: RoomState | undefined;
let lastRecovery = -1,
  lastEpoch = -1,
  seq = 0,
  sentAt = 0,
  frameAt = performance.now(),
  lastCount = 0,
  noteOffset = 0,
  manualNote: number | null = null,
  toastTimer = 0;
const phaseNames = {
  lobby: "Сбор экипажа",
  ready: "Экипаж готов",
  countdown: "На старте",
  racing: "На спецучастке",
  paused: "Заезд приостановлен",
  finished: "Финиш",
};
document.querySelector("#app")!.innerHTML = `
<header class="topbar"><a class="brand" href="/" aria-label="Ралли вместе — главная"><span class="brand-mark">→</span><span>РАЛЛИ <b>ВМЕСТЕ</b></span></a><div class="top-meta"><span class="live-dot"></span><span id="connection">Кооперативное ралли для двоих</span></div><button id="settings-button" class="icon-button" aria-label="Настройки и управление">⚙</button></header>
<main id="home" class="home"><section class="intro"><div class="eyebrow">ОДНА МАШИНА · ДВА ЧЕЛОВЕКА</div><h1>Дорогу видишь ты.<br>Поворот знает<br><em>напарник.</em></h1><p class="lead">Лес, гравий и незнакомый перевал.<br>Доверьтесь друг другу — и доберитесь до финиша.</p><div class="create-box"><div class="small-label">ВЫБЕРИТЕ СВОЮ РОЛЬ</div><div class="role-select"><button class="role-choice selected" data-role="driver"><span>◉</span><strong>Водитель</strong><small>Руль, педали, дорога</small></button><button class="role-choice" data-role="codriver"><span>⌘</span><strong>Штурман</strong><small>Карта, повороты, голос</small></button></div><button id="create" class="primary wide">Создать экипаж <span>→</span></button></div><form id="join-form" class="join-form"><label for="code">Уже есть приглашение?</label><div><input id="code" maxlength="8" placeholder="Код комнаты" autocomplete="off" autocapitalize="characters" aria-label="Код комнаты"><button class="secondary" type="submit">Присоединиться →</button></div></form><p id="home-error" class="error" role="alert"></p></section>
<section class="stage-card"><div class="stage-art"><svg viewBox="0 0 600 530" aria-hidden="true"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#a7beb3"/><stop offset="1" stop-color="#d8ddc3"/></linearGradient></defs><path fill="url(#sky)" d="M0 0H600V530H0z"/><circle cx="457" cy="93" r="39" fill="#f1e5bf"/><path d="M-60 327 103 112 194 225 329 65 493 285 575 164 665 320V530H0" fill="#779689"/><path d="m210 214 119-149 78 106-64-23-24-29-29 54-37-2Z" fill="#c7d0ba"/><path d="m-50 424 230-225 193 134 143-105 137 211V530H0" fill="#456c5a"/><path d="M-20 530C-60 380 421 445 399 345S243 336 290 273" fill="none" stroke="#d8c6a2" stroke-width="33"/><path d="M-20 530C-60 380 421 445 399 345S243 336 290 273" fill="none" stroke="#b7a27d" stroke-width="2" stroke-dasharray="6 9"/><g fill="#234b3d"><path d="m74 246-48 117h32l-39 66h99l-39-66h29Z"/><path d="m484 269-51 123h33l-42 72h114l-42-72h33Z"/><path d="m173 310-30 76h20l-26 44h72l-26-44h20Z"/><path d="m556 361-40 98h27l-34 59h92l-34-59h27Z"/></g><g transform="translate(258 422) rotate(-10)"><rect x="-21" y="-7" width="48" height="22" rx="5" fill="#283c32"/><rect x="-16" y="-17" width="39" height="32" rx="6" fill="#ef7447"/><rect x="-9" y="-8" width="25" height="12" rx="2" fill="#d6dccb"/><rect x="-2" y="-17" width="5" height="33" fill="#f6e8c8"/></g></svg><div class="stage-tag">СУ 01 / ЛЕС → ГОРЫ</div><div class="art-caption">Сосновый<br>перевал</div></div><div class="stage-specs"><div><strong>${distance(LENGTH)}</strong><span>Дистанция</span></div><div><strong>93 м</strong><span>Набор высоты</span></div><div><strong>Гравий</strong><span>Покрытие</span></div></div><div class="stage-footer"><span>→ 3–5 минут заезда</span><span>Общий финиш. Общая победа.</span></div></section></main>
<section id="session" hidden><div class="session-heading"><div><span class="eyebrow" id="session-code"></span><h2 id="phase-label">Сбор экипажа</h2></div><div class="session-actions"><span id="my-role" class="badge"></span><button id="leave" class="text-button">Выйти</button></div></div>
<div id="lobby" class="lobby-grid"><section class="panel"><div class="panel-heading"><span class="eyebrow">01 / ЭКИПАЖ</span><span>Два места. Одна цель.</span></div><div id="players"></div><p class="muted">Оба участника отмечают готовность. Микрофон включается отдельно и не обязателен для старта.</p><div class="button-row"><button id="ready" class="primary">Я готов</button><button id="start" class="secondary" disabled>На старт →</button></div><button id="swap" class="text-button">Предложить смену ролей</button><p id="loading" class="muted"></p></section><section class="panel invite"><span class="eyebrow">02 / ПРИГЛАСИТЕ НАПАРНИКА</span><div class="invite-content"><canvas id="qr" aria-label="QR-код приглашения"></canvas><div><p>Откройте ссылку на другом устройстве или в другом браузере.</p><strong id="room-code" class="room-code"></strong><button id="copy" class="secondary">Скопировать ссылку →</button></div></div><input id="invite-link" readonly aria-label="Ссылка приглашения"><small id="invite-hint" class="muted"></small></section></div>
<div id="race" hidden><div id="driver" class="driver-view" hidden><canvas id="road" aria-label="Дорога перед автомобилем"></canvas><div class="driver-top"><span class="badge">СУ 01 · СОСНОВЫЙ ПЕРЕВАЛ</span><span id="checkpoint" class="badge"></span></div><div id="quick-prompt" class="quick-prompt" aria-live="assertive"></div><div class="driver-bottom"><div class="speed"><strong id="speed">0</strong><span>км/ч</span></div><div class="telemetry"><div id="steering" class="steering">⊕</div><div><small>ГАЗ</small><meter id="throttle" min="0" max="1"></meter></div><div><small>ТОРМОЗ</small><meter id="brake" min="0" max="1"></meter></div></div><div class="race-clock"><small>ВРЕМЯ СУ</small><strong id="driver-time">00:00,0</strong></div></div><div class="driver-tools"><button id="camera" class="glass">Камера · C</button><button id="recover" class="glass">На трассу · R · +5 с</button><button id="pause" class="glass">Пауза · Esc</button></div><div class="touch-drive"><button data-touch="left" aria-label="Руль влево">←</button><button data-touch="right" aria-label="Руль вправо">→</button><button data-touch="brake">Тормоз</button><button data-touch="throttle">Газ</button></div><div id="reset-hint" class="reset-hint" hidden>Съехали с трассы? Нажмите R — вернём к контрольной точке.</div></div>
<div id="codriver" class="codriver-grid" hidden><section class="map-panel"><div class="map-top"><span class="eyebrow">МАРШРУТ ЭКИПАЖА</span><span id="stale" class="badge">Ожидаем координаты</span></div><canvas id="map" aria-label="Карта маршрута с положением машины"></canvas><div class="map-controls"><button id="overview" class="secondary">Весь маршрут</button><button id="follow" class="secondary">К машине</button><button id="north" class="secondary">Север ↑</button><button id="zoom-out" class="secondary" aria-label="Уменьшить карту">−</button><button id="zoom-in" class="secondary" aria-label="Увеличить карту">+</button></div></section><aside class="notes-panel"><div class="navigator-stats"><div><small>СКОРОСТЬ</small><strong id="nav-speed">0 <i>км/ч</i></strong></div><div><small>ВРЕМЯ СУ</small><strong id="nav-time">00:00,0</strong></div></div><div class="notes-heading"><span class="eyebrow">ЧИТАЙТЕ ДОРОГУ</span><span id="note-mode">Автоматически</span></div><div id="notes"></div><div class="note-controls"><button id="note-prev" class="secondary" aria-label="Предыдущая заметка">←</button><button id="note-auto" class="secondary">К текущей</button><button id="note-next" class="secondary" aria-label="Следующая заметка">→</button></div><p class="note-key">1 — очень круто · 6 — полого и быстро.<br>Расстояние — до начала элемента.</p><div class="quick-calls"><button data-call="Тормози">Тормози</button><button data-call="Лево">← Лево</button><button data-call="Право">Право →</button></div><div class="nav-progress"><span id="progress-text"></span><progress id="progress" max="${LENGTH}" value="0"></progress></div><button id="nav-pause" class="text-button">Приостановить заезд</button></aside></div></div>
<section class="voice-bar"><div class="voice-info"><span class="voice-icon">◉</span><div><strong>Связь экипажа</strong><small id="voice-status">Микрофон выключен</small></div><meter id="voice-meter" min="0" max="1" value="0" aria-label="Уровень микрофона"></meter></div><div class="voice-actions"><button id="voice-enable" class="secondary">Включить микрофон</button><button id="mute" class="secondary" disabled>Выключить звук микрофона</button><button id="listen" class="text-button" hidden>Слышать напарника</button></div></section><p class="voice-disclaimer">Голос не записывается. При проблемах связи используйте быстрые команды штурмана.</p></section>
<div id="race-overlay" class="overlay" hidden><section class="overlay-card"><span class="eyebrow">РАЛЛИ ВМЕСТЕ</span><h2 id="overlay-title"></h2><div id="overlay-body"></div><div id="overlay-actions" class="button-row"></div></section></div>
<dialog id="settings"><div class="dialog-header"><h2>Настройки и управление</h2><button id="close-settings" class="secondary">Закрыть ×</button></div><div class="settings-grid"><section><h3>За рулём</h3><p>W / ↑ — газ · S / ↓ — тормоз.<br>A, D / ←, → — руль.<br>Пробел — ручной тормоз.<br>R — на контрольную точку (+5 с).<br>C — камера · Esc — пауза.</p><p>Для заднего хода остановитесь и удерживайте тормоз 0,7 секунды.</p><p>Геймпад: левый стик — руль; RT — газ; LT — тормоз; A — ручник; Y — камера. Планшет: кнопки на экране.</p></section><section><h3>Звук и изображение</h3><label>Звук игры<input id="game-volume" type="range" min="0" max="1" step=".05" value=".25"></label><label>Голос напарника<input id="voice-volume" type="range" min="0" max="1" step=".05" value="1"></label><label class="checkbox"><input id="reduced" type="checkbox" checked> Уменьшить тряску камеры</label><p>Водитель видит дорогу, штурман — маршрут и ближайшие повороты. Говорите коротко и заранее.</p><p>Для микрофона нужен HTTPS. Без TURN голос может не работать между некоторыми сетями; сама игра продолжит работать.</p></section></div></dialog><div id="toast" class="toast" role="status" hidden></div><footer class="page-footer"><span>РАЛЛИ ВМЕСТЕ / ПРОТОТИП 0.1</span><span>Не быстрее всех. Вместе до конца.</span></footer>`;
let selectedRole = "driver";
const map = new RallyMap($<HTMLCanvasElement>("map"));
function toast(message: string) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ($("toast").hidden = true), 4500);
}
function send(
  type: "pause" | "start" | "resume" | "lobby" | "restart" | "swap",
) {
  net.send({ type });
}
async function enter(role?: string, code?: string) {
  $("home-error").textContent = "";
  $<HTMLButtonElement>("create").disabled = true;
  try {
    await sound.start();
    await net.enter(role, code);
    $("home").hidden = true;
    $("session").hidden = false;
    $("session-code").textContent = `ЭКИПАЖ ${net.code} / СУ 01`;
    $("room-code").textContent = net.code;
    const url = `${location.origin}/?room=${net.code}`;
    $<HTMLInputElement>("invite-link").value = url;
    await QRCode.toCanvas($<HTMLCanvasElement>("qr"), url, {
      width: 140,
      margin: 1,
      color: { dark: "#243e32", light: "#f8f6ed" },
    });
    $("invite-hint").textContent = ["localhost", "127.0.0.1"].includes(
      location.hostname,
    )
      ? "Адрес localhost работает только на этом компьютере. Для планшета откройте игру по сетевому адресу компьютера."
      : "Приглашение действует до закрытия комнаты, не более 4 часов.";
  } catch (e) {
    $("home-error").textContent = (e as Error).message;
  } finally {
    $<HTMLButtonElement>("create").disabled = false;
  }
}
document.querySelectorAll<HTMLButtonElement>("[data-role]").forEach(
  (b) =>
    (b.onclick = () => {
      selectedRole = b.dataset.role!;
      document
        .querySelectorAll("[data-role]")
        .forEach((el) => el.classList.toggle("selected", el === b));
    }),
);
$("create").onclick = () => void enter(selectedRole);
$("join-form").onsubmit = (e) => {
  e.preventDefault();
  const code = $<HTMLInputElement>("code").value.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
    $("home-error").textContent =
      "Введите 8 латинских букв или цифр из приглашения.";
    return;
  }
  void enter(undefined, code);
};
$("copy").onclick = async () => {
  const input = $<HTMLInputElement>("invite-link");
  try {
    await navigator.clipboard.writeText(input.value);
    toast("Приглашение скопировано");
  } catch {
    input.focus();
    input.select();
    toast("Скопируйте выделенную ссылку вручную");
  }
};
$("ready").onclick = () => {
  void sound.start();
  const me = state?.players.find((p) => p.id === net.you);
  net.send({ type: "ready", value: !me?.ready });
};
$("start").onclick = () => send("start");
$("swap").onclick = () => send("swap");
$("pause").onclick = $("nav-pause").onclick = () => send("pause");
$("recover").onclick = () =>
  net.send({ type: "reset", id: crypto.randomUUID() });
$("camera").onclick = () => {
  if (game) game.chase = !game.chase;
};
$("voice-enable").onclick = () => void voice.enable();
$("mute").onclick = () => voice.mute();
$("listen").onclick = () =>
  void voice.audio
    .play()
    .then(() => {
      $("listen").hidden = true;
    })
    .catch(() => toast("Браузер пока не разрешает звук"));
voice.onChange = () => {
  $("voice-status").textContent = voice.status;
  $("voice-enable").textContent = voice.enabled
    ? "Повторить голос"
    : "Включить микрофон";
  $<HTMLButtonElement>("mute").disabled = !voice.enabled;
  $("mute").textContent = voice.muted
    ? "Включить звук микрофона"
    : "Выключить звук микрофона";
  $("listen").hidden = !voice.status.includes("Слышать");
};
$("overview").onclick = () => map.overview();
$("follow").onclick = () => map.returnToCar();
$("north").onclick = () => {
  map.headingUp = !map.headingUp;
  $("north").textContent = map.headingUp ? "По курсу ↑" : "Север ↑";
};
$("zoom-in").onclick = () => (map.zoom = Math.min(12, map.zoom * 1.4));
$("zoom-out").onclick = () => (map.zoom = Math.max(0.7, map.zoom / 1.4));
$("note-prev").onclick = () => {
  manualNote = Math.max(0, (manualNote ?? noteOffset) - 1);
};
$("note-next").onclick = () => {
  manualNote = Math.min(notes.length - 1, (manualNote ?? noteOffset) + 1);
};
$("note-auto").onclick = () => (manualNote = null);
document.querySelectorAll<HTMLButtonElement>("[data-call]").forEach(
  (b) =>
    (b.onclick = () => {
      net.send({
        type: "call",
        call: b.dataset.call as "Тормози" | "Лево" | "Право",
      });
      toast(`Передано: ${b.dataset.call}`);
    }),
);
document.querySelectorAll<HTMLButtonElement>("[data-touch]").forEach((b) => {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    if (!game) return;
    const key = b.dataset.touch;
    if (key === "left") game.touch.steer = -1;
    else if (key === "right") game.touch.steer = 1;
    else if (key === "throttle") game.touch.throttle = 1;
    else game.touch.brake = 1;
  };
  b.onpointerup = b.onpointercancel = () => {
    if (!game) return;
    const key = b.dataset.touch;
    if (key === "left" || key === "right") game.touch.steer = 0;
    else if (key === "throttle") game.touch.throttle = 0;
    else game.touch.brake = 0;
  };
});
$("settings-button").onclick = () => {
  game?.clear();
  if (state?.phase === "racing" || state?.phase === "countdown") send("pause");
  $<HTMLDialogElement>("settings").showModal();
};
$("close-settings").onclick = () => $<HTMLDialogElement>("settings").close();
$("game-volume").oninput = (e) =>
  (sound.volume = +(e.target as HTMLInputElement).value);
$("voice-volume").oninput = (e) =>
  (voice.audio.volume = +(e.target as HTMLInputElement).value);
$("reduced").onchange = (e) => {
  if (game) game.reduced = (e.target as HTMLInputElement).checked;
};
$("leave").onclick = () => {
  voice.stop();
  net.leave();
  sound.stop();
  game?.dispose();
  location.href = location.pathname;
};
async function ensureGame() {
  if (game) return game;
  gamePromise ??= import("./game").then(({ Game }) =>
    Game.create($<HTMLCanvasElement>("road")),
  );
  $("loading").textContent = "Готовим машину и спецучасток…";
  try {
    game = await gamePromise;
    game.onReset = () => net.send({ type: "reset", id: crypto.randomUUID() });
    game.onPause = () => send("pause");
    game.onCollision = () => sound.collision();
    $("loading").textContent =
      "Машина готова. Управление: W A S D или геймпад.";
    return game;
  } catch {
    $("loading").textContent =
      "Не удалось запустить 3D. Нужен браузер с WebGL 2.";
    throw Error("Не удалось загрузить машину");
  }
}
function renderOverlay() {
  if (!state) return;
  const s = state,
    me = s.players.find((p) => p.id === net.you),
    host = net.you === s.host;
  const open =
    ["paused", "finished", "countdown"].includes(s.phase) ||
    (!net.connected && !!state);
  $("race-overlay").hidden = !open;
  if (!open) return;
  $("overlay-actions").replaceChildren();
  $("overlay-body").replaceChildren();
  if (!net.connected) {
    $("overlay-title").textContent = "Восстанавливаем связь…";
    $("overlay-body").textContent =
      "Машина остановлена. После подключения оба участника подтверждают продолжение.";
    return;
  }
  if (s.phase === "countdown") {
    $("overlay-title").textContent = "Приготовьтесь";
    $("overlay-body").innerHTML =
      '<strong id="countdown-number" class="countdown-number"></strong><p>Водитель, слушайте штурмана.</p>';
    return;
  }
  if (s.phase === "paused") {
    $("overlay-title").textContent = "Пауза. Дождёмся друг друга.";
    $("overlay-body").textContent =
      s.players.length < 2 || s.players.some((p) => !p.connected)
        ? "Напарник отключился. Ждём до 2 минут, затем возвращаемся в лобби."
        : "Связь восстановлена. Для продолжения нужно подтверждение обоих участников.";
    const b = document.createElement("button");
    b.className = "primary";
    b.textContent = me?.resume ? "Ждём напарника" : "Продолжить заезд";
    b.disabled =
      !!me?.resume ||
      s.players.length !== 2 ||
      s.players.some((p) => !p.connected);
    b.onclick = () => send("resume");
    $("overlay-actions").appendChild(b);
  }
  if (s.phase === "finished") {
    $("overlay-title").textContent = "Вы прошли перевал.";
    $("overlay-body").innerHTML =
      `<p>Одна дорога. Отличная команда.</p><strong class="result-time">${time(s.result ?? 0)}</strong><div class="result-details"><span>Время на трассе <b>${time(s.elapsed)}</b></span><span>Возвраты: ${s.resets} <b>+${s.penalty / 1000} с</b></span><span>Лучшее в комнате <b>${time(s.best ?? 0)}</b></span></div>`;
    if (host) {
      const b = document.createElement("button");
      b.className = "primary";
      b.textContent = "Ещё один заезд";
      b.onclick = () => send("restart");
      $("overlay-actions").appendChild(b);
    } else {
      const p = document.createElement("p");
      p.textContent = "Организатор может начать новый заезд.";
      $("overlay-actions").appendChild(p);
    }
  }
  if (host) {
    const b = document.createElement("button");
    b.className = "secondary";
    b.textContent = "В лобби";
    b.onclick = () => send("lobby");
    $("overlay-actions").appendChild(b);
  }
}
net.onState = async (s) => {
  const old = state;
  state = s;
  const me = s.players.find((p) => p.id === net.you);
  if (!me) return;
  const isDriver = me.role === "driver";
  $("my-role").textContent = roleName(me.role);
  $("phase-label").textContent = phaseNames[s.phase];
  const lobby = ["lobby", "ready"].includes(s.phase);
  $("lobby").hidden = !lobby;
  $("race").hidden = lobby;
  $("driver").hidden = !isDriver;
  $("codriver").hidden = isDriver;
  $("players").innerHTML = ["driver", "codriver"]
    .map((role) => {
      const p = s.players.find((p) => p.role === role);
      return `<div class="player"><div class="player-icon">${role === "driver" ? "◉" : "⌘"}</div><div><strong>${roleName(role as "driver" | "codriver")}${p?.id === net.you ? " · вы" : ""}</strong><small>${p ? (p.connected ? "В комнате" : "Нет связи") : "Ждём напарника"}</small></div><span class="player-state ${p?.ready ? "is-ready" : ""}">${p?.ready ? "Готов" : p ? "Не готов" : "Свободно"}</span></div>`;
    })
    .join("");
  $("ready").textContent = me.ready ? "Отменить готовность" : "Я готов";
  $<HTMLButtonElement>("start").disabled = !(
    s.phase === "ready" && s.host === net.you
  );
  $("start").hidden = s.host !== net.you;
  $("swap").textContent = s.swap
    ? s.swap === net.you
      ? "Ждём согласия на смену ролей"
      : "Согласиться на смену ролей"
    : "Предложить смену ролей";
  $<HTMLButtonElement>("swap").disabled = s.players.length < 2;
  if (s.epoch !== old?.epoch && !s.snapshot) {
    map.latest = undefined;
    map.previous = undefined;
    map.received = 0;
  }
  if (s.snapshot) map.update(s.snapshot);
  if (s.players.some((p) => p.id !== net.you && !p.connected))
    voice.disconnected();
  if (s.phase === "finished" && old?.phase !== "finished") sound.beep(true);
  if (
    old?.players.find((p) => p.id === net.you)?.role !== me.role &&
    voice.enabled
  ) {
    voice.closePeer();
    net.send({ type: "voice-ready" });
    void voice.negotiate();
  }
  renderOverlay();
  if (isDriver) {
    $<HTMLButtonElement>("ready").disabled = !game;
    let g: Game;
    try {
      g = await ensureGame();
    } catch {
      toast("Не удалось загрузить 3D. Проверьте поддержку WebGL 2.");
      return;
    }
    if (state !== s) return;
    $<HTMLButtonElement>("ready").disabled = false;
    if (
      lastRecovery !== s.recovery ||
      lastEpoch !== s.epoch ||
      old?.phase === "paused" ||
      (!old && s.snapshot)
    ) {
      g.physics.reset(s.progress, s.snapshot?.p, s.snapshot?.q);
      g.cameraReady = false;
      seq = s.snapshot?.seq ?? 0;
      lastRecovery = s.recovery;
      lastEpoch = s.epoch;
    }
    g.setActive(s.phase === "racing" && net.connected && !document.hidden);
  } else game?.setActive(false);
};
net.onSnapshot = (s) => map.update(s);
net.onError = toast;
net.onConnection = (connected) => {
  $("connection").textContent = connected
    ? "Экипаж на связи"
    : "Связь потеряна · подключаемся…";
  document.querySelector(".live-dot")?.classList.toggle("offline", !connected);
  if (!connected) {
    game?.setActive(false);
    voice.disconnected();
    renderOverlay();
  } else if (voice.enabled) net.send({ type: "voice-ready" });
};
net.onMessage = (m) => {
  if (m.type === "call") {
    $("quick-prompt").textContent = m.call;
    window.setTimeout(() => ($("quick-prompt").textContent = ""), 2300);
  }
  if (m.type === "signal") void voice.signal(m.data);
  if (m.type === "voice-ready") void voice.peer();
  if (m.type === "voice-stop") voice.disconnected();
};
document.addEventListener("visibilitychange", () => {
  game?.clear();
  if (
    document.hidden &&
    (state?.phase === "racing" || state?.phase === "countdown")
  ) {
    game?.setActive(false);
    send("pause");
  }
});
window.addEventListener("pagehide", () => {
  voice.stop();
  sound.stop();
  game?.clear();
});
function loop(now: number) {
  const dt = (now - frameAt) / 1000;
  frameAt = now;
  const s = state;
  if (s) {
    const isDriver = s.players.find((p) => p.id === net.you)?.role === "driver";
    if (dt > 0.5 && game?.active) {
      game.setActive(false);
      send("pause");
    }
    if (isDriver && game && !$("driver").hidden) {
      game.frame(dt);
      const speed = game.physics.speed;
      $("speed").textContent = Math.round(Math.abs(speed) * 3.6).toString();
      $("driver-time").textContent = time(elapsed(s, net.now()));
      $("checkpoint").textContent =
        `КТ ${s.checkpoint} / ${checkpoints.length}`;
      $<HTMLMeterElement>("throttle").value = game.input.throttle;
      $<HTMLMeterElement>("brake").value = game.input.brake;
      $("steering").style.transform = `rotate(${game.input.steer * 100}deg)`;
      $("reset-hint").hidden = !game.physics.offroad;
      sound.update(
        speed,
        game.input.throttle,
        game.input.handbrake ? 1 : 0,
        game.active,
      );
      if (game.active && now - sentAt > 66.6) {
        const p = game.physics.body.translation(),
          q = game.physics.body.rotation();
        net.send({ type: "snapshot", seq: ++seq, epoch: s.epoch, p, q, speed });
        sentAt = now;
      }
    }
    if (!isDriver && !$("race").hidden) {
      map.draw();
      const snap = map.latest,
        progress = snap?.progress ?? s.progress;
      $("nav-speed").innerHTML =
        `${Math.round(Math.abs(snap?.speed ?? 0) * 3.6)} <i>км/ч</i>`;
      $("nav-time").textContent = time(elapsed(s, net.now()));
      $("stale").textContent =
        map.latest && now - map.received < 1800
          ? "● Позиция обновляется"
          : "Позиция устарела";
      $("stale").classList.toggle("warning", now - map.received > 1800);
      noteOffset = notes.findIndex((n) => n.s >= progress - 10);
      if (noteOffset < 0) noteOffset = notes.length;
      const index = manualNote ?? noteOffset;
      $("note-mode").textContent =
        manualNote === null ? "Автоматически" : "Ручной просмотр";
      const html =
        notes
          .slice(index, index + 3)
          .map(
            (n, i) =>
              `<article class="note ${i === 0 ? "next" : ""}"><span class="note-arrow">${n.kind === "left" ? "←" : n.kind === "right" ? "→" : "⌃"}</span><div><small>${i === 0 ? "БЛИЖАЙШИЙ ЭЛЕМЕНТ" : "ЗАТЕМ"} · ${distance(n.s - progress)}</small><strong>${n.text}</strong></div></article>`,
          )
          .join("") ||
        '<article class="note next"><strong>Финишная прямая →</strong></article>';
      if ($("notes").innerHTML !== html) $("notes").innerHTML = html;
      $("progress-text").textContent =
        `Пройдено ${distance(progress)} · осталось ${distance(LENGTH - progress)}`;
      $<HTMLProgressElement>("progress").value = progress;
    }
    if (s.phase === "countdown") {
      const n = Math.max(0, Math.ceil((s.startAt - net.now()) / 1000));
      const el = $("countdown-number");
      if (el) el.textContent = n ? String(n) : "Поехали!";
      if (n !== lastCount) {
        sound.beep(n === 0);
        lastCount = n;
      }
    }
    $<HTMLMeterElement>("voice-meter").value = voice.meter();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
const invited = new URLSearchParams(location.search).get("room")?.toUpperCase();
if (invited) {
  $<HTMLInputElement>("code").value = invited;
  void enter(undefined, invited);
}
