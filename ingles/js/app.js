// Inglês Passo a Passo – interface, exercícios e comunicação com a API PHP.
"use strict";

const { levels: LEVELS, passRatio: PASS_RATIO, extraExercises: EXTRA_EXERCISES, achievements: ACHIEVEMENTS } = window.COURSE;

const $app = document.getElementById("app");
const $stats = document.getElementById("stats");

// ---------- Utilidades ----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sem armazenamento */ } },
  del(key) { try { localStorage.removeItem(key); } catch (e) { /* sem armazenamento */ } }
};

const prefs = Object.assign({ sound: true, freeMode: false }, store.get("ingles-prefs", {}));
const savePrefs = () => store.set("ingles-prefs", prefs);

function esc(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = list => list[Math.floor(Math.random() * list.length)];
const dayString = offset => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA"); // AAAA-MM-DD no fuso local
};

// Texto “limpo” para falar ou comparar: “went (go)” → “went”, “child / children” → “child”.
const cleanEnglish = text => text.split("/")[0].replace(/\(.*?\)/g, "").trim();
const normalize = text => text.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

// ---------- Som, voz e efeitos ----------
let audioCtx = null;
function tone(freqs, duration = 0.12, type = "sine") {
  if (!prefs.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const start = audioCtx.currentTime + i * duration;
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    });
  } catch (e) { /* áudio indisponível */ }
}
const sfx = {
  tap: () => tone([520], 0.05, "triangle"),
  ok: () => tone([660, 880], 0.1),
  bad: () => tone([240, 190], 0.15, "triangle"),
  win: () => tone([523, 659, 784, 1047], 0.12)
};

const canSpeak = "speechSynthesis" in window;
function speak(text, slow = false) {
  if (!canSpeak) return toast("Seu navegador não tem áudio de pronúncia. 😕");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(cleanEnglish(text));
  u.lang = "en-US";
  u.rate = slow ? 0.6 : 0.95;
  const voice = speechSynthesis.getVoices().find(v => v.lang === "en-US") || speechSynthesis.getVoices().find(v => v.lang.startsWith("en"));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
function practiceSpeaking(target, btn) {
  if (!Recognition) return toast("Seu navegador não reconhece voz. Tente no Chrome. 🎤");
  const rec = new Recognition();
  rec.lang = "en-US";
  rec.maxAlternatives = 3;
  btn.classList.add("recording");
  toast("🎤 Pode falar...");
  rec.onresult = e => {
    const wanted = normalize(target).split(" ");
    let best = { score: 0, heard: "" };
    for (const alt of e.results[0]) {
      const heard = normalize(alt.transcript).split(" ");
      const score = wanted.filter(w => heard.includes(w)).length / wanted.length;
      if (score > best.score) best = { score, heard: alt.transcript };
    }
    const pct = Math.round(best.score * 100);
    if (pct >= 80) { sfx.ok(); toast(`🌟 Excelente pronúncia! ${pct}% de acerto`, "ok"); }
    else if (pct >= 50) toast(`👍 Quase! ${pct}%. Ouvi: “${esc(best.heard)}”`);
    else { sfx.bad(); toast(`🔁 Tente de novo. Ouvi: “${esc(best.heard || "nada")}”`, "bad"); }
  };
  rec.onerror = () => toast("Não consegui ouvir. Verifique a permissão do microfone.", "bad");
  rec.onend = () => btn.classList.remove("recording");
  rec.start();
}

function toast(html, type = "") {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = html;
  box.appendChild(el);
  setTimeout(() => el.classList.add("out"), 3200);
  setTimeout(() => el.remove(), 3700);
}

function confetti() {
  const canvas = document.getElementById("confetti");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d");
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];
  const parts = Array.from({ length: 160 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    vx: -2 + Math.random() * 4,
    vy: 2 + Math.random() * 4,
    rot: Math.random() * Math.PI,
    vr: -0.2 + Math.random() * 0.4,
    color: pick(colors)
  }));
  const end = performance.now() + 3500;
  (function frame(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (now < end) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  })(performance.now());
}

// ---------- Curso ----------
const ALL_LESSONS = LEVELS.flatMap((level, levelIndex) =>
  level.lessons.map((lesson, lessonIndex) => ({ level, levelIndex, lesson, lessonIndex })));

const lessonTotal = lesson => lesson.quiz.length + EXTRA_EXERCISES;
const findLesson = id => ALL_LESSONS.find(f => f.lesson.id === id) || null;

function isPassedIn(progress, lesson) {
  const p = progress[lesson.id];
  return Boolean(p) && p.best / p.total >= PASS_RATIO;
}

// ---------- Backends: servidor PHP e modo offline ----------
class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const serverBackend = {
  mode: "server",
  token: store.get("ingles-token", null),
  async call(action, body) {
    let res;
    try {
      res = await fetch(`api.php?action=${action}`, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", ...(this.token ? { "X-Token": this.token } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) { throw new ApiError("Sem conexão com o servidor.", 0); }
    let data;
    try { data = await res.json(); } catch (e) { throw new ApiError("Servidor PHP indisponível.", 0); }
    if (!res.ok) throw new ApiError(data.error || "Erro no servidor.", res.status);
    return data;
  },
  async register(name) {
    const data = await this.call("register", { name });
    this.token = data.token;
    store.set("ingles-token", data.token);
    return data;
  },
  me() { return this.call("me"); },
  complete(lessonId, score) { return this.call("complete", { lessonId, score }); },
  ranking() { return this.call("ranking"); },
  reset() { return this.call("reset", {}); },
  logout() { this.token = null; store.del("ingles-token"); }
};

// Mesmas regras de api.php, guardadas só neste navegador (quando o PHP não está disponível).
const localBackend = {
  mode: "local",
  data: store.get("ingles-local", null),
  save() { store.set("ingles-local", this.data); },
  state() {
    const u = this.data.user;
    const streak = u.lastDay && u.lastDay < dayString(-1) ? 0 : u.streak;
    return {
      user: { name: u.name, xp: u.xp, streak, bestStreak: u.bestStreak, studiedToday: u.lastDay === dayString(0) },
      progress: { ...this.data.progress },
      achievements: [...this.data.achievements]
    };
  },
  async register(name) {
    name = name.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 24) throw new ApiError("O nome deve ter entre 2 e 24 caracteres.", 422);
    this.data = { user: { name, xp: 0, streak: 0, bestStreak: 0, lastDay: null }, progress: {}, achievements: [] };
    this.save();
    return this.state();
  },
  async me() {
    if (!this.data) throw new ApiError("Sem conta.", 401);
    return this.state();
  },
  async complete(lessonId, rawScore) {
    const { lesson, level } = findLesson(lessonId);
    const d = this.data;
    const total = lessonTotal(lesson);
    const score = Math.max(0, Math.min(total, rawScore));
    const passed = score / total >= PASS_RATIO;
    const wasPassed = isPassedIn(d.progress, lesson);
    const xp = score * 10 + (score === total ? 20 : 0) + (passed && !wasPassed ? 50 : 0);

    const u = d.user;
    if (u.lastDay !== dayString(0)) u.streak = u.lastDay === dayString(-1) ? u.streak + 1 : 1;
    u.bestStreak = Math.max(u.bestStreak, u.streak);
    u.lastDay = dayString(0);
    u.xp += xp;
    const prev = d.progress[lessonId];
    d.progress[lessonId] = { best: Math.max(prev ? prev.best : 0, score), total };

    const fresh = [];
    const award = code => { if (!d.achievements.includes(code)) { d.achievements.push(code); fresh.push(code); } };
    if (passed) award("first_lesson");
    if (score === total) award("perfect");
    if (u.streak >= 3) award("streak_3");
    if (u.streak >= 7) award("streak_7");
    if (u.xp >= 500) award("xp_500");
    if (u.xp >= 2000) award("xp_2000");
    if (level.lessons.every(l => isPassedIn(d.progress, l))) award(`level_${level.id}`);
    this.save();
    return { ...this.state(), result: { score, total, passed, xp, newAchievements: fresh } };
  },
  async ranking() { throw new ApiError("O ranking precisa do servidor PHP.", 0); },
  async reset() {
    this.data = { user: { ...this.data.user, xp: 0, streak: 0, lastDay: null }, progress: {}, achievements: [] };
    this.save();
    return this.state();
  },
  logout() { this.data = null; store.del("ingles-local"); }
};

let backend = serverBackend;
let S = null; // { user, progress, achievements }

function apply(data) {
  const oldXp = S ? S.user.xp : null;
  S = { user: data.user, progress: data.progress, achievements: data.achievements };
  renderStats(oldXp !== null && oldXp !== S.user.xp);
}

// ---------- Regras de desbloqueio ----------
const isPassed = lesson => isPassedIn(S.progress, lesson);
const levelProgress = level => ({ done: level.lessons.filter(isPassed).length, total: level.lessons.length });

function isUnlocked({ levelIndex, lessonIndex }) {
  if (prefs.freeMode) return true;
  const level = LEVELS[levelIndex];
  if (lessonIndex > 0) return isPassed(level.lessons[lessonIndex - 1]);
  return levelIndex === 0 || LEVELS[levelIndex - 1].lessons.every(isPassed);
}

const nextLesson = () => ALL_LESSONS.find(f => isUnlocked(f) && !isPassed(f.lesson)) || null;

function unlockHint(f) {
  if (f.lessonIndex > 0) return `Conclua “${f.level.lessons[f.lessonIndex - 1].title}” primeiro.`;
  return `Conclua o nível ${LEVELS[f.levelIndex - 1].code} para liberar.`;
}

// ---------- Cabeçalho ----------
function renderStats(bump) {
  if (!S) { $stats.innerHTML = ""; return; }
  const u = S.user;
  $stats.innerHTML = `
    <a href="#/perfil" class="stat streak ${u.studiedToday ? "on" : ""}" title="Dias seguidos estudando">🔥 <b>${u.streak}</b></a>
    <a href="#/perfil" class="stat xp ${bump ? "bump" : ""}" title="Pontos de experiência">⚡ <b>${u.xp}</b></a>
    <a href="#/perfil" class="avatar" title="${esc(u.name)}">${esc(u.name.charAt(0).toUpperCase())}</a>`;
}

// ---------- Boas-vindas ----------
function renderOnboarding(note = "") {
  document.body.classList.add("onboarding");
  $app.innerHTML = `
    <section class="welcome">
      <div class="mascot" aria-hidden="true">🦉</div>
      <h1>Aprenda inglês do zero à fluência</h1>
      <p class="lead">6 níveis, ${ALL_LESSONS.length} lições, exercícios interativos, áudio e reconhecimento de voz. Tudo explicado em português.</p>
      <ul class="pills">
        ${LEVELS.map(l => `<li style="--c:${l.color}">${l.icon} ${l.code}</li>`).join("")}
      </ul>
      ${note ? `<p class="notice">${note}</p>` : ""}
      <form id="join" class="card join">
        <label for="name">Como você quer ser chamado?</label>
        <input id="name" name="name" maxlength="24" autocomplete="nickname" placeholder="Seu nome" required>
        <p class="form-error" id="err" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">Começar agora</button>
        <button class="link" type="button" id="haveCode">Já tenho um código de acesso</button>
      </form>
      <form id="restore" class="card join" hidden>
        <label for="code">Cole seu código de acesso</label>
        <input id="code" maxlength="32" autocomplete="off" placeholder="ex.: 3f9a..." required>
        <p class="form-error" id="err2" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">Entrar</button>
        <button class="link" type="button" id="back">Voltar</button>
      </form>
    </section>`;

  const join = document.getElementById("join");
  const restore = document.getElementById("restore");
  const showError = (id, msg) => { const el = document.getElementById(id); el.textContent = msg; el.hidden = false; };

  join.addEventListener("submit", async e => {
    e.preventDefault();
    const name = document.getElementById("name").value;
    const btn = join.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      backend = serverBackend;
      apply(await serverBackend.register(name));
    } catch (err) {
      if (err.status === 422) { btn.disabled = false; return showError("err", err.message); }
      try {
        backend = localBackend;
        apply(await localBackend.register(name));
        toast("Modo offline: seu progresso fica salvo só neste navegador.");
      } catch (err2) { btn.disabled = false; return showError("err", err2.message); }
    }
    document.body.classList.remove("onboarding");
    toast(`Bem-vindo(a), ${esc(S.user.name)}! 🎉`, "ok");
    location.hash = "#/";
    route();
  });

  document.getElementById("haveCode").addEventListener("click", () => { join.hidden = true; restore.hidden = false; });
  document.getElementById("back").addEventListener("click", () => { join.hidden = false; restore.hidden = true; });
  restore.addEventListener("submit", async e => {
    e.preventDefault();
    const code = document.getElementById("code").value.trim().toLowerCase();
    serverBackend.token = code;
    try {
      const data = await serverBackend.me();
      store.set("ingles-token", code);
      backend = serverBackend;
      apply(data);
      document.body.classList.remove("onboarding");
      toast(`Que bom te ver de volta, ${esc(S.user.name)}! 👋`, "ok");
      route();
    } catch (err) {
      serverBackend.token = null;
      showError("err2", err.status === 401 ? "Código não encontrado." : err.message);
    }
  });
  document.getElementById("name").focus();
}

// ---------- Trilha (página inicial) ----------
function progressRing(pct, color) {
  const r = 34, c = 2 * Math.PI * r;
  return `
    <svg class="ring" viewBox="0 0 80 80" role="img" aria-label="${pct}% do curso concluído">
      <circle cx="40" cy="40" r="${r}" class="ring-bg"/>
      <circle cx="40" cy="40" r="${r}" class="ring-fg" stroke="${color}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"/>
      <text x="40" y="46" text-anchor="middle">${pct}%</text>
    </svg>`;
}

function renderHome() {
  const next = nextLesson();
  const done = ALL_LESSONS.filter(f => isPassed(f.lesson)).length;
  const pct = Math.round((done / ALL_LESSONS.length) * 100);
  const offsets = [0, 64, 0, -64];
  let n = 0;

  const units = LEVELS.map((level, levelIndex) => {
    const { done: lvDone, total } = levelProgress(level);
    const nodes = level.lessons.map((lesson, lessonIndex) => {
      const f = { level, levelIndex, lesson, lessonIndex };
      const status = isPassed(lesson) ? "done" : isUnlocked(f) ? "open" : "locked";
      const current = next && next.lesson.id === lesson.id;
      const best = S.progress[lesson.id];
      return `
        <div class="node-wrap" style="--x:${offsets[n++ % offsets.length]}px">
          ${current ? `<span class="bubble">${done ? "CONTINUAR" : "COMEÇAR"}</span>` : ""}
          <a class="node ${status} ${current ? "current" : ""}" href="#/licao/${lesson.id}" data-lesson="${lesson.id}"
             aria-label="${esc(lesson.title)}${status === "locked" ? " (bloqueada)" : ""}">
            <span>${status === "locked" ? "🔒" : status === "done" ? "✓" : lesson.icon}</span>
          </a>
          <span class="node-label">${esc(lesson.title)}${best ? `<small>${best.best}/${best.total}</small>` : ""}</span>
        </div>`;
    }).join("");

    const unitLocked = !isUnlocked({ levelIndex, lessonIndex: 0 });
    return `
      <section class="unit ${unitLocked ? "locked" : ""}" style="--c:${level.color}">
        <header class="unit-head">
          <div class="unit-icon">${level.icon}</div>
          <div class="unit-text">
            <span class="unit-code">Nível ${level.code}</span>
            <h2>${esc(level.name)}</h2>
            <p>${esc(level.description)}</p>
          </div>
          <div class="unit-meter" title="${lvDone} de ${total} lições">${lvDone === total ? "🏆" : `${lvDone}/${total}`}</div>
        </header>
        <div class="trail">${nodes}</div>
      </section>`;
  }).join("");

  const color = next ? next.level.color : "#f59e0b";
  $app.innerHTML = `
    <section class="hello card">
      <div class="hello-text">
        <h1>Olá, ${esc(S.user.name)}! 👋</h1>
        <p>${S.user.studiedToday ? "Você já estudou hoje. Sequência garantida! 🔥" : S.user.streak ? `Faça uma lição hoje para manter seus <b>${S.user.streak} dias</b> de sequência.` : "Faça uma lição hoje e comece sua sequência de estudos. 🔥"}</p>
        ${next ? `<a class="btn btn-primary" style="--c:${color}" href="#/licao/${next.lesson.id}">${next.lesson.icon} ${done ? "Continuar" : "Começar"}: ${esc(next.lesson.title)}</a>`
               : `<p><b>🎓 Parabéns! Você concluiu o curso inteiro.</b></p>`}
      </div>
      ${progressRing(pct, color)}
    </section>
    ${units}`;

  $app.querySelectorAll(".node.locked").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    sfx.bad();
    a.classList.remove("shake");
    void a.offsetWidth;
    a.classList.add("shake");
    toast(`🔒 ${esc(unlockHint(findLesson(a.dataset.lesson)))}`);
  }));

  const current = $app.querySelector(".node.current");
  if (current && done > 0) current.scrollIntoView({ block: "center", behavior: "smooth" });
}

// ---------- Lição ----------
function speakButtons(text) {
  return `
    <button class="icon-btn" type="button" data-speak="${esc(text)}" aria-label="Ouvir">🔊</button>
    ${Recognition ? `<button class="icon-btn mic" type="button" data-mic="${esc(text)}" aria-label="Praticar pronúncia">🎤</button>` : ""}`;
}

function renderLesson(id, tab) {
  const f = findLesson(id);
  if (!f) return renderNotFound();
  if (!isUnlocked(f)) {
    toast(`🔒 ${esc(unlockHint(f))}`);
    location.replace("#/");
    return;
  }
  const { level, lesson, lessonIndex } = f;
  const active = tab === "vocabulario" ? "vocabulario" : "teoria";
  const best = S.progress[lesson.id];
  const total = lessonTotal(lesson);

  let panel;
  if (active === "teoria") {
    panel = `
      <article class="card prose">${lesson.theory}</article>
      <h2 class="section-title">💬 Exemplos <small>ouça e repita${Recognition ? " · toque no 🎤 para treinar a pronúncia" : ""}</small></h2>
      <div class="card examples">
        ${lesson.examples.map(([en, pt]) => `
          <div class="example">
            <div class="example-text"><div class="en">${esc(en)}</div><div class="pt">${esc(pt)}</div></div>
            <div class="example-actions">${speakButtons(en)}</div>
          </div>`).join("")}
      </div>`;
  } else {
    panel = `
      <p class="hint">Toque em um cartão para ver a tradução.</p>
      <div class="flip-grid">
        ${lesson.vocab.map(([en, pt]) => `
          <button class="flip" type="button" aria-label="${esc(en)}: ${esc(pt)}">
            <span class="flip-inner">
              <span class="flip-face front"><b>${esc(en)}</b><span class="icon-btn small" data-speak="${esc(en)}" role="button" aria-label="Ouvir">🔊</span></span>
              <span class="flip-face back">${esc(pt)}</span>
            </span>
          </button>`).join("")}
      </div>`;
  }

  $app.innerHTML = `
    <a class="back" href="#/">← Trilha</a>
    <section class="lesson-hero" style="--c:${level.color}">
      <div class="lesson-icon">${lesson.icon}</div>
      <div>
        <span class="unit-code">Nível ${level.code} · Lição ${lessonIndex + 1} de ${level.lessons.length}</span>
        <h1>${esc(lesson.title)}</h1>
        ${best ? `<span class="chip">${isPassed(lesson) ? "✓ Concluída" : "Em andamento"} · melhor: ${best.best}/${best.total}</span>` : `<span class="chip">Nova lição</span>`}
      </div>
    </section>
    <div class="tabs" role="tablist">
      <a role="tab" class="tab" href="#/licao/${lesson.id}" aria-selected="${active === "teoria"}">📖 Explicação</a>
      <a role="tab" class="tab" href="#/licao/${lesson.id}/vocabulario" aria-selected="${active === "vocabulario"}">🗂️ Vocabulário</a>
    </div>
    ${panel}
    <div class="cta-bar">
      <a class="btn btn-primary btn-block" style="--c:${level.color}" href="#/praticar/${lesson.id}">✏️ Praticar · ${total} exercícios</a>
    </div>`;

  $app.querySelectorAll(".flip").forEach(card => card.addEventListener("click", e => {
    if (e.target.closest("[data-speak]")) return;
    sfx.tap();
    card.classList.toggle("flipped");
  }));
}

// ---------- Sessão de exercícios ----------
function buildExercises(lesson) {
  const quiz = shuffle(lesson.quiz).map(q => {
    const order = shuffle(q.options.map((_, i) => i));
    return { type: "choice", prompt: q.q, options: order.map(i => q.options[i]), answer: order.indexOf(q.answer), explain: q.explain };
  });

  const vocab = shuffle(lesson.vocab);
  const simple = vocab.filter(([en]) => !/[/(]/.test(en));
  const typeItem = simple[0] || vocab[0];
  const rest = vocab.filter(v => v !== typeItem);
  const listenItem = rest[0];
  const listenOptions = shuffle([listenItem, ...rest.slice(1, 4)]).map(v => v[1]);

  const example = pick(lesson.examples);
  const words = example[0].split(/\s+/);
  const lower = words.map(w => w.toLowerCase());
  const pool = new Map(lesson.examples.filter(e => e !== example).flatMap(e => e[0].split(/\s+/)).map(w => [w.toLowerCase(), w]));
  const distractors = shuffle([...pool.values()]).filter(w => !lower.includes(w.toLowerCase())).slice(0, 2);

  const extras = [
    { type: "listen", word: listenItem[0], options: listenOptions, answer: listenOptions.indexOf(listenItem[1]), answerText: listenItem[1] },
    { type: "build", en: example[0], pt: example[1], tiles: shuffle([...words, ...distractors]) },
    { type: "match", pairs: vocab.slice(0, 4) },
    { type: "type", pt: typeItem[1], en: typeItem[0] }
  ];

  const list = [];
  quiz.forEach((q, i) => { list.push(q); if (extras[i]) list.push(extras[i]); });
  return list.concat(extras.slice(quiz.length));
}

let keyHandler = null;

function renderPractice(id) {
  const f = findLesson(id);
  if (!f) return renderNotFound();
  if (!isUnlocked(f)) { location.replace("#/"); return; }
  const { level, lesson } = f;

  document.body.classList.add("practice-mode");
  const items = buildExercises(lesson);
  let index = 0;
  let score = 0;
  let combo = 0;
  let current = null; // exercício em andamento
  let phase = "answer"; // answer → feedback

  $app.innerHTML = `
    <div class="practice" style="--c:${level.color}">
      <div class="practice-top">
        <button class="icon-btn" type="button" id="quit" aria-label="Sair da prática">✕</button>
        <div class="pbar"><span id="pbar"></span></div>
        <span class="combo" id="combo" aria-live="polite"></span>
      </div>
      <div class="stage" id="stage"></div>
      <div class="practice-foot" id="foot">
        <div class="foot-inner">
          <div class="feedback" id="feedback" aria-live="polite"></div>
          <button class="btn btn-primary" type="button" id="action" disabled>Verificar</button>
        </div>
      </div>
    </div>`;

  const $stage = document.getElementById("stage");
  const $foot = document.getElementById("foot");
  const $feedback = document.getElementById("feedback");
  const $action = document.getElementById("action");
  const $pbar = document.getElementById("pbar");
  const $combo = document.getElementById("combo");

  document.getElementById("quit").addEventListener("click", () => {
    if (index === 0 || confirm("Sair agora? O progresso desta prática será perdido.")) location.hash = `#/licao/${lesson.id}`;
  });

  const setReady = ready => { if (phase === "answer") $action.disabled = !ready; };

  function showItem() {
    phase = "answer";
    $pbar.style.width = `${(index / items.length) * 100}%`;
    $foot.className = "practice-foot";
    $feedback.innerHTML = "";
    $action.textContent = "Verificar";
    $action.disabled = true;
    $action.hidden = false;
    const item = items[index];
    current = EXERCISES[item.type](item, $stage, setReady, result => finishItem(result));
    $action.hidden = item.type === "match";
    $stage.classList.remove("enter");
    void $stage.offsetWidth;
    $stage.classList.add("enter");
  }

  function finishItem(result) {
    phase = "feedback";
    if (result.correct) {
      score++;
      combo++;
      sfx.ok();
    } else {
      combo = 0;
      sfx.bad();
    }
    $combo.textContent = combo >= 3 ? `🔥 ${combo} seguidas!` : "";
    $combo.classList.toggle("hot", combo >= 3);
    $foot.className = `practice-foot ${result.correct ? "good" : "wrong"}`;
    $feedback.innerHTML = `
      <strong>${result.correct ? pick(["Muito bem! 🎉", "Isso aí! ✨", "Perfeito! 💪", "Mandou bem! 🙌"]) : "Não foi dessa vez 😅"}</strong>
      ${result.answer ? `<div>Resposta: <b>${esc(result.answer)}</b> ${result.speak ? `<button class="icon-btn small" type="button" data-speak="${esc(result.speak)}" aria-label="Ouvir">🔊</button>` : ""}</div>` : ""}
      ${result.explain ? `<div class="explain">${esc(result.explain)}</div>` : ""}`;
    $action.hidden = false;
    $action.disabled = false;
    $action.textContent = "Continuar";
    $action.focus();
  }

  $action.addEventListener("click", () => {
    if (phase === "answer") {
      if (current && current.check) finishItem(current.check());
    } else if (++index < items.length) {
      showItem();
    } else {
      finishSession();
    }
  });

  keyHandler = e => {
    if (e.target.matches("input") && e.key !== "Enter") return;
    if (e.key === "Enter" && !$action.disabled && !$action.hidden) { e.preventDefault(); $action.click(); return; }
    if (phase === "answer" && /^[1-9]$/.test(e.key)) {
      const opt = $stage.querySelectorAll("[data-option]")[Number(e.key) - 1];
      if (opt) opt.click();
    }
  };
  document.addEventListener("keydown", keyHandler);

  async function finishSession() {
    $pbar.style.width = "100%";
    $foot.hidden = true;
    $stage.innerHTML = `<div class="loading">Salvando seu progresso...</div>`;
    let result;
    try {
      const data = await backend.complete(lesson.id, score);
      apply(data);
      result = data.result;
    } catch (err) {
      toast(`Não foi possível salvar: ${esc(err.message)}`, "bad");
      result = { score, total: items.length, passed: score / items.length >= PASS_RATIO, xp: 0, newAchievements: [] };
    }

    const perfect = result.score === result.total;
    if (result.passed) { sfx.win(); confetti(); }
    const after = findLesson(lesson.id);
    const following = ALL_LESSONS[ALL_LESSONS.indexOf(after) + 1];
    const canGoNext = result.passed && following && isUnlocked(following);

    $stage.innerHTML = `
      <div class="finish">
        <div class="finish-emoji">${perfect ? "🏆" : result.passed ? "🎉" : "💪"}</div>
        <h1>${perfect ? "Perfeito!" : result.passed ? "Lição concluída!" : "Quase lá!"}</h1>
        <p class="lead">${result.passed ? "Você está cada vez melhor." : `Você precisa de ${Math.ceil(result.total * PASS_RATIO)} acertos para concluir. Revise e tente de novo!`}</p>
        <div class="finish-stats">
          <div class="fstat"><span>🎯</span><b>${result.score}/${result.total}</b><small>acertos</small></div>
          <div class="fstat"><span>⚡</span><b class="count" data-to="${result.xp}">0</b><small>XP ganhos</small></div>
          <div class="fstat"><span>🔥</span><b>${S.user.streak}</b><small>dias seguidos</small></div>
        </div>
        ${result.newAchievements.map(code => {
          const [icon, title, desc] = ACHIEVEMENTS[code];
          return `<div class="new-badge"><span>${icon}</span><div><b>Nova conquista: ${esc(title)}</b><small>${esc(desc)}</small></div></div>`;
        }).join("")}
        <div class="finish-actions">
          ${canGoNext ? `<a class="btn btn-primary" href="#/licao/${following.lesson.id}">Próxima lição: ${esc(following.lesson.title)} →</a>` : ""}
          ${!result.passed ? `<a class="btn btn-primary" href="#/licao/${lesson.id}">📖 Revisar explicação</a>` : ""}
          <button class="btn btn-ghost" type="button" id="again">🔁 Praticar de novo</button>
          <a class="btn btn-ghost" href="#/">🗺️ Voltar à trilha</a>
        </div>
      </div>`;

    const counter = $stage.querySelector(".count");
    const target = Number(counter.dataset.to);
    const start = performance.now();
    (function tick(now) {
      const t = Math.min(1, (now - start) / 900);
      counter.textContent = `+${Math.round(target * t)}`;
      if (t < 1) requestAnimationFrame(tick);
    })(start);
    document.getElementById("again").addEventListener("click", () => renderPractice(lesson.id));
  }

  showItem();
}

function choiceList(options) {
  return `<div class="choices">${options.map((o, i) =>
    `<button class="choice" type="button" data-option="${i}"><kbd>${i + 1}</kbd>${esc(o)}</button>`).join("")}</div>`;
}

// Liga a seleção das alternativas; devolve uma função que corrige e diz se acertou.
function bindChoices(stage, item, setReady) {
  let selected = null;
  const buttons = stage.querySelectorAll(".choice");
  buttons.forEach(b => b.addEventListener("click", () => {
    if (b.disabled) return;
    sfx.tap();
    buttons.forEach(x => x.classList.remove("selected"));
    b.classList.add("selected");
    selected = Number(b.dataset.option);
    setReady(true);
  }));
  return () => {
    buttons.forEach(b => {
      b.disabled = true;
      b.classList.remove("selected");
      const i = Number(b.dataset.option);
      if (i === item.answer) b.classList.add("correct");
      else if (i === selected) b.classList.add("wrong");
    });
    return selected === item.answer;
  };
}

// Cada tipo de exercício desenha a tela e devolve { check() } (ou chama done() sozinho).
const EXERCISES = {
  choice(item, stage, setReady) {
    stage.innerHTML = `
      <p class="ex-kind">Escolha a resposta certa</p>
      <h2 class="ex-prompt">${esc(item.prompt)}</h2>
      ${choiceList(item.options)}`;
    const answered = bindChoices(stage, item, setReady);
    return { check: () => ({ correct: answered(), answer: item.options[item.answer], explain: item.explain }) };
  },

  listen(item, stage, setReady) {
    stage.innerHTML = `
      <p class="ex-kind">Ouça e escolha a tradução</p>
      <div class="listen-box">
        <button class="speaker" type="button" id="play" aria-label="Ouvir de novo">🔊</button>
        <button class="speaker slow" type="button" id="slow" aria-label="Ouvir devagar">🐢</button>
      </div>
      ${canSpeak ? "" : `<p class="hint">Áudio indisponível no seu navegador. A palavra é: <b>${esc(item.word)}</b></p>`}
      ${choiceList(item.options)}`;
    stage.querySelector("#play").addEventListener("click", () => speak(item.word));
    stage.querySelector("#slow").addEventListener("click", () => speak(item.word, true));
    setTimeout(() => speak(item.word), 350);
    const answered = bindChoices(stage, item, setReady);
    return { check: () => ({ correct: answered(), answer: `${item.word} = ${item.answerText}`, speak: item.word }) };
  },

  build(item, stage, setReady) {
    stage.innerHTML = `
      <p class="ex-kind">Monte a frase em inglês</p>
      <h2 class="ex-prompt">“${esc(item.pt)}”</h2>
      <div class="answer-line" id="line" aria-label="Sua resposta"></div>
      <div class="tiles" id="bank">
        ${item.tiles.map((t, i) => `<button class="tile" type="button" data-tile="${i}">${esc(t)}</button>`).join("")}
      </div>`;
    const line = stage.querySelector("#line");
    const bank = stage.querySelector("#bank");
    const chosen = [];

    const refresh = added => {
      line.innerHTML = chosen.map(i => `<button class="tile${i === added ? " in-line" : ""}" type="button" data-back="${i}">${esc(item.tiles[i])}</button>`).join("");
      bank.querySelectorAll(".tile").forEach(b => { b.classList.toggle("used", chosen.includes(Number(b.dataset.tile))); });
      setReady(chosen.length > 0);
    };
    bank.addEventListener("click", e => {
      const b = e.target.closest("[data-tile]");
      if (!b || b.classList.contains("used") || b.disabled) return;
      sfx.tap();
      chosen.push(Number(b.dataset.tile));
      refresh(Number(b.dataset.tile));
    });
    line.addEventListener("click", e => {
      const b = e.target.closest("[data-back]");
      if (!b || b.disabled) return;
      chosen.splice(chosen.indexOf(Number(b.dataset.back)), 1);
      refresh();
    });
    return {
      check() {
        stage.querySelectorAll(".tile").forEach(b => { b.disabled = true; });
        const built = chosen.map(i => item.tiles[i]).join(" ");
        return { correct: normalize(built) === normalize(item.en), answer: item.en, speak: item.en };
      }
    };
  },

  match(item, stage, setReady, done) {
    const left = shuffle(item.pairs.map((p, i) => ({ i, text: p[0] })));
    const right = shuffle(item.pairs.map((p, i) => ({ i, text: p[1] })));
    stage.innerHTML = `
      <p class="ex-kind">Ligue os pares</p>
      <h2 class="ex-prompt">Toque em uma palavra e depois na tradução</h2>
      <div class="match">
        <div class="match-col">${left.map(p => `<button class="pair" type="button" data-side="en" data-i="${p.i}">${esc(p.text)}</button>`).join("")}</div>
        <div class="match-col">${right.map(p => `<button class="pair" type="button" data-side="pt" data-i="${p.i}">${esc(p.text)}</button>`).join("")}</div>
      </div>`;
    let mistakes = 0;
    let matched = 0;
    let selected = null;
    stage.querySelectorAll(".pair").forEach(b => b.addEventListener("click", () => {
      if (b.disabled) return;
      if (b.dataset.side === "en") speak(item.pairs[Number(b.dataset.i)][0]);
      if (!selected || selected.dataset.side === b.dataset.side) {
        if (selected) selected.classList.remove("selected");
        selected = b;
        b.classList.add("selected");
        return;
      }
      const a = selected;
      selected = null;
      a.classList.remove("selected");
      if (a.dataset.i === b.dataset.i) {
        sfx.tap();
        [a, b].forEach(x => { x.disabled = true; x.classList.add("matched"); });
        if (++matched === item.pairs.length) {
          done({ correct: mistakes <= 1, explain: mistakes ? `Você errou ${mistakes} ${mistakes === 1 ? "par" : "pares"}.` : "Todos os pares de primeira!" });
        }
      } else {
        mistakes++;
        sfx.bad();
        [a, b].forEach(x => { x.classList.add("miss"); setTimeout(() => x.classList.remove("miss"), 450); });
      }
    }));
    setReady(false);
    return null;
  },

  type(item, stage, setReady) {
    stage.innerHTML = `
      <p class="ex-kind">Escreva em inglês</p>
      <h2 class="ex-prompt">“${esc(item.pt)}”</h2>
      <input class="type-input" id="typed" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Digite aqui...">`;
    const input = stage.querySelector("#typed");
    input.addEventListener("input", () => setReady(input.value.trim().length > 0));
    setTimeout(() => input.focus(), 50);
    return {
      check() {
        input.disabled = true;
        const typed = normalize(input.value);
        const accepted = item.en.split("/").map(s => normalize(s.replace(/\(.*?\)/g, ""))).concat(normalize(item.en));
        const exact = accepted.includes(typed);
        const close = !exact && accepted.some(a => a.length > 4 && levenshtein(a, typed) <= 1);
        input.classList.add(exact || close ? "correct" : "wrong");
        return {
          correct: exact || close,
          answer: item.en,
          speak: item.en,
          explain: close ? "Quase perfeito! Atenção à grafia." : ""
        };
      }
    };
  }
};

// ---------- Conquistas ----------
function renderAchievements() {
  const earned = new Set(S.achievements);
  const cards = Object.entries(ACHIEVEMENTS).map(([code, [icon, title, desc]]) => `
    <div class="badge-card ${earned.has(code) ? "earned" : ""}">
      <div class="badge-icon">${earned.has(code) ? icon : "🔒"}</div>
      <b>${esc(title)}</b>
      <small>${esc(desc)}</small>
    </div>`).join("");
  $app.innerHTML = `
    <h1 class="page-title">🏅 Conquistas</h1>
    <p class="lead">Você desbloqueou <b>${earned.size}</b> de ${Object.keys(ACHIEVEMENTS).length}.</p>
    <div class="badge-grid">${cards}</div>`;
}

// ---------- Ranking ----------
async function renderRanking() {
  $app.innerHTML = `<h1 class="page-title">🏆 Ranking</h1><p class="lead">Quem mais juntou XP estudando.</p><div id="rank" class="card"><div class="loading">Carregando...</div></div>`;
  const box = document.getElementById("rank");
  try {
    const { ranking } = await serverBackend.call("ranking");
    if (!ranking.length) { box.innerHTML = `<p class="empty">Ninguém pontuou ainda. Seja o primeiro! 🚀</p>`; return; }
    box.innerHTML = `<ol class="rank-list">${ranking.map((r, i) => {
      const me = r.me;
      return `
        <li class="${me ? "me" : ""}">
          <span class="pos">${["🥇", "🥈", "🥉"][i] || i + 1}</span>
          <span class="avatar">${esc(r.name.charAt(0).toUpperCase())}</span>
          <span class="rname">${esc(r.name)}${me ? `<small>você</small>` : ""}</span>
          ${r.streak ? `<span class="rstreak">🔥 ${r.streak}</span>` : ""}
          <span class="rxp">${r.xp} XP</span>
        </li>`;
    }).join("")}</ol>`;
  } catch (err) {
    box.innerHTML = `<p class="empty">📡 O ranking só funciona quando o site está rodando no servidor PHP.</p>`;
  }
}

// ---------- Perfil ----------
function renderProfile() {
  const u = S.user;
  const done = ALL_LESSONS.filter(f => isPassed(f.lesson)).length;
  $app.innerHTML = `
    <section class="profile card">
      <div class="avatar big">${esc(u.name.charAt(0).toUpperCase())}</div>
      <h1>${esc(u.name)}</h1>
      <span class="chip">${backend.mode === "server" ? "☁️ Conta salva no servidor" : "📱 Modo offline (só neste navegador)"}</span>
    </section>
    <div class="stat-grid">
      <div class="stat-card"><span>⚡</span><b>${u.xp}</b><small>XP total</small></div>
      <div class="stat-card"><span>🔥</span><b>${u.streak}</b><small>dias seguidos</small></div>
      <div class="stat-card"><span>📅</span><b>${u.bestStreak}</b><small>melhor sequência</small></div>
      <div class="stat-card"><span>📚</span><b>${done}/${ALL_LESSONS.length}</b><small>lições</small></div>
    </div>
    <h2 class="section-title">⚙️ Preferências</h2>
    <div class="card settings">
      <label class="switch"><input type="checkbox" id="sound" ${prefs.sound ? "checked" : ""}><span></span>Efeitos sonoros</label>
      <label class="switch"><input type="checkbox" id="free" ${prefs.freeMode ? "checked" : ""}><span></span>Modo livre (liberar todas as lições)</label>
    </div>
    ${backend.mode === "server" ? `
      <h2 class="section-title">🔑 Código de acesso</h2>
      <div class="card">
        <p class="hint">Use este código para entrar na sua conta em outro aparelho. Não compartilhe.</p>
        <div class="code-row"><code id="token">${esc(serverBackend.token)}</code><button class="btn btn-ghost" type="button" id="copy">Copiar</button></div>
      </div>` : ""}
    <h2 class="section-title">⚠️ Zona de perigo</h2>
    <div class="card danger">
      <button class="btn btn-ghost" type="button" id="reset">Zerar meu progresso</button>
      <button class="btn btn-ghost" type="button" id="logout">Sair deste aparelho</button>
    </div>`;

  document.getElementById("sound").addEventListener("change", e => { prefs.sound = e.target.checked; savePrefs(); sfx.tap(); });
  document.getElementById("free").addEventListener("change", e => { prefs.freeMode = e.target.checked; savePrefs(); toast(prefs.freeMode ? "🔓 Todas as lições liberadas." : "🔒 Trilha em ordem novamente."); });
  const copy = document.getElementById("copy");
  if (copy) copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(serverBackend.token); toast("Código copiado! 📋", "ok"); }
    catch (e) { toast("Selecione e copie o código manualmente."); }
  });
  document.getElementById("reset").addEventListener("click", async () => {
    if (!confirm("Zerar XP, sequência, conquistas e lições concluídas?")) return;
    try { apply(await backend.reset()); toast("Progresso zerado."); renderProfile(); }
    catch (err) { toast(esc(err.message), "bad"); }
  });
  document.getElementById("logout").addEventListener("click", () => {
    const msg = backend.mode === "server"
      ? "Sair deste aparelho? Guarde seu código de acesso para entrar de novo."
      : "Sair? No modo offline seu progresso será apagado deste navegador.";
    if (!confirm(msg)) return;
    backend.logout();
    S = null;
    renderStats();
    location.hash = "#/";
    route();
  });
}

function renderNotFound() {
  $app.innerHTML = `<div class="finish"><div class="finish-emoji">🧭</div><h1>Página não encontrada</h1><a class="btn btn-primary" href="#/">Voltar à trilha</a></div>`;
}

// ---------- Rotas ----------
function route() {
  if (keyHandler) { document.removeEventListener("keydown", keyHandler); keyHandler = null; }
  if (canSpeak) speechSynthesis.cancel();
  document.body.classList.remove("practice-mode");
  if (!S) return renderOnboarding();
  document.body.classList.remove("onboarding");

  const [page, id, tab] = location.hash.replace(/^#\/?/, "").split("/");
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === (page || "home")));
  window.scrollTo(0, 0);

  if (page === "licao" && id) renderLesson(id, tab);
  else if (page === "praticar" && id) renderPractice(id);
  else if (page === "conquistas") renderAchievements();
  else if (page === "ranking") renderRanking();
  else if (page === "perfil") renderProfile();
  else if (!page) renderHome();
  else renderNotFound();
}

// Botões de áudio e microfone em qualquer tela.
document.addEventListener("click", e => {
  const s = e.target.closest("[data-speak]");
  if (s) { e.stopPropagation(); speak(s.dataset.speak); return; }
  const m = e.target.closest("[data-mic]");
  if (m) practiceSpeaking(m.dataset.mic, m);
});

window.addEventListener("hashchange", route);

(async function init() {
  if (canSpeak) speechSynthesis.getVoices(); // pré-carrega as vozes
  if (serverBackend.token) {
    try {
      backend = serverBackend;
      apply(await serverBackend.me());
      return route();
    } catch (err) {
      if (err.status === 401) serverBackend.logout();
      else if (!localBackend.data) return renderOnboarding("📡 Não consegui falar com o servidor agora. Você pode continuar no modo offline.");
    }
  }
  if (localBackend.data) {
    backend = localBackend;
    apply(await localBackend.me());
  }
  route();
})();
