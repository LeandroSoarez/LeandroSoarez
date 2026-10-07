// Inglês Passo a Passo – navegação, progresso e exercícios.
const STORAGE_KEY = "ingles-progresso-v1";
const PASS_RATIO = 0.7; // acerto mínimo para concluir uma lição

const app = document.getElementById("app");
const overall = document.getElementById("overall");

// ---------- Progresso ----------
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") return { scores: {}, freeMode: false, ...saved };
  } catch (e) { /* armazenamento indisponível */ }
  return { scores: {}, freeMode: false };
}

let state = loadState();

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignora */ }
}

function isLessonDone(lesson) {
  const best = state.scores[lesson.id];
  return best !== undefined && best / lesson.quiz.length >= PASS_RATIO;
}

function levelProgress(level) {
  const done = level.lessons.filter(isLessonDone).length;
  return { done, total: level.lessons.length };
}

function isLevelUnlocked(index) {
  if (index === 0 || state.freeMode) return true;
  const prev = levelProgress(LEVELS[index - 1]);
  return prev.done === prev.total;
}

function findLesson(lessonId) {
  for (let i = 0; i < LEVELS.length; i++) {
    const idx = LEVELS[i].lessons.findIndex(l => l.id === lessonId);
    if (idx !== -1) return { level: LEVELS[i], levelIndex: i, lesson: LEVELS[i].lessons[idx], lessonIndex: idx };
  }
  return null;
}

function updateOverall() {
  const all = LEVELS.flatMap(l => l.lessons);
  const done = all.filter(isLessonDone).length;
  overall.textContent = `${done}/${all.length} lições concluídas`;
}

// ---------- Utilidades ----------
function esc(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    alert("Seu navegador não suporta áudio de pronúncia.");
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.split("/")[0].replace(/\(.*?\)/g, "").trim());
  u.lang = "en-US";
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

function speakButton(text) {
  return `<button class="speak" type="button" data-speak="${esc(text)}" aria-label="Ouvir pronúncia de ${esc(text)}">🔊</button>`;
}

app.addEventListener("click", e => {
  const btn = e.target.closest("[data-speak]");
  if (btn) speak(btn.dataset.speak);
});

// ---------- Telas ----------
function renderHome() {
  const items = LEVELS.map((level, i) => {
    const { done, total } = levelProgress(level);
    const unlocked = isLevelUnlocked(i);
    const complete = done === total;
    const pct = Math.round((done / total) * 100);
    const status = !unlocked
      ? `<span class="tag">🔒 Conclua o ${LEVELS[i - 1].code}</span>`
      : complete ? `<span class="tag ok">✓ Concluído</span>` : `<span class="tag">${done}/${total} lições</span>`;
    const tag = unlocked ? "a" : "div";
    const href = unlocked ? ` href="#/nivel/${level.id}"` : ` aria-disabled="true"`;
    return `
      <li>
        <${tag} class="level ${complete ? "done" : ""} ${unlocked ? "" : "locked"}"${href}>
          <span class="badge">${level.code}</span>
          <div class="level-body">
            <h3>${esc(level.name)}</h3>
            <p>${esc(level.description)}</p>
            <div class="bar" aria-label="${pct}% concluído"><span style="width:${pct}%"></span></div>
          </div>
          ${status}
        </${tag}>
      </li>`;
  }).join("");

  app.innerHTML = `
    <h1>Aprenda inglês nível por nível</h1>
    <p class="lead">Comece no <b>A1</b> e avance até o <b>C2</b>. Cada lição tem explicação em português, vocabulário com áudio e exercícios. Acerte pelo menos ${Math.round(PASS_RATIO * 100)}% para concluir a lição; conclua todas as lições de um nível para liberar o próximo.</p>
    <ol class="path">${items}</ol>
    <div class="settings">
      <label><input type="checkbox" id="freeMode" ${state.freeMode ? "checked" : ""}> Modo livre (liberar todos os níveis)</label>
      <button type="button" id="reset">Apagar meu progresso</button>
    </div>`;

  document.getElementById("freeMode").addEventListener("change", e => {
    state.freeMode = e.target.checked;
    saveState();
    renderHome();
  });
  document.getElementById("reset").addEventListener("click", () => {
    if (confirm("Apagar todo o progresso salvo?")) {
      state = { scores: {}, freeMode: false };
      saveState();
      route();
    }
  });
}

function renderLevel(levelId) {
  const index = LEVELS.findIndex(l => l.id === levelId);
  if (index === -1) return renderHome();
  const level = LEVELS[index];
  if (!isLevelUnlocked(index)) {
    app.innerHTML = `
      <a class="back" href="#/">← Todos os níveis</a>
      <h1>🔒 Nível ${level.code} bloqueado</h1>
      <p class="lead">Conclua todas as lições do nível ${LEVELS[index - 1].code} para liberar este nível, ou ative o modo livre na página inicial.</p>`;
    return;
  }

  const lessons = level.lessons.map((lesson, i) => {
    const best = state.scores[lesson.id];
    const tag = isLessonDone(lesson)
      ? `<span class="tag ok">✓ ${best}/${lesson.quiz.length}</span>`
      : best !== undefined ? `<span class="tag">Melhor: ${best}/${lesson.quiz.length}</span>` : `<span class="tag">Nova</span>`;
    return `
      <li>
        <a class="lesson-item" href="#/licao/${lesson.id}">
          <div><div class="num">Lição ${i + 1}</div><strong>${esc(lesson.title)}</strong></div>
          ${tag}
        </a>
      </li>`;
  }).join("");

  const next = LEVELS[index + 1];
  const { done, total } = levelProgress(level);
  const nextLink = next && done === total
    ? `<p style="margin-top:24px"><a class="btn" href="#/nivel/${next.id}">Ir para o nível ${next.code} →</a></p>`
    : "";

  app.innerHTML = `
    <a class="back" href="#/">← Todos os níveis</a>
    <h1>${level.code} · ${esc(level.name)}</h1>
    <p class="lead">${esc(level.description)}</p>
    <ol class="lesson-list">${lessons}</ol>
    ${nextLink}`;
}

function renderLesson(lessonId, tab) {
  const found = findLesson(lessonId);
  if (!found) return renderHome();
  const { level, levelIndex, lesson, lessonIndex } = found;
  if (!isLevelUnlocked(levelIndex)) return renderLevel(level.id);

  const tabs = [
    ["teoria", "📖 Explicação"],
    ["vocabulario", "🗂️ Vocabulário"],
    ["exercicios", "✏️ Exercícios"]
  ];
  const active = tabs.some(t => t[0] === tab) ? tab : "teoria";

  app.innerHTML = `
    <a class="back" href="#/nivel/${level.id}">← ${level.code} · ${esc(level.name)}</a>
    <h1>${esc(lesson.title)}</h1>
    <p class="lead">Lição ${lessonIndex + 1} de ${level.lessons.length}</p>
    <div class="tabs" role="tablist">
      ${tabs.map(([id, label]) => `<button class="tab" role="tab" aria-selected="${id === active}" data-tab="${id}">${label}</button>`).join("")}
    </div>
    <section id="panel"></section>`;

  app.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => { location.hash = `#/licao/${lesson.id}/${btn.dataset.tab}`; });
  });

  const panel = document.getElementById("panel");
  if (active === "teoria") renderTheory(panel, lesson);
  else if (active === "vocabulario") renderVocab(panel, lesson);
  else renderQuiz(panel, found);
}

function renderTheory(panel, lesson) {
  const examples = lesson.examples.map(([en, pt]) => `
    <div class="example">
      ${speakButton(en)}
      <div><div>${esc(en)}</div><div class="pt">${esc(pt)}</div></div>
    </div>`).join("");

  panel.innerHTML = `
    <div class="card"><div class="table-wrap">${lesson.theory}</div></div>
    <h2>Exemplos</h2>
    <div class="card">${examples}</div>
    <p style="margin-top:24px"><a class="btn" href="#/licao/${lesson.id}/vocabulario">Próximo: vocabulário →</a></p>`;
}

function renderVocab(panel, lesson) {
  const cards = lesson.vocab.map(([en, pt]) => `
    <div class="vocab">
      <div><div class="en">${esc(en)}</div><div class="pt">${esc(pt)}</div></div>
      ${speakButton(en)}
    </div>`).join("");

  panel.innerHTML = `
    <div class="vocab-grid">${cards}</div>
    <h2>Pratique com flashcards</h2>
    <div class="card flash" id="flash" tabindex="0" role="button"></div>
    <div class="row">
      <button class="btn ghost" type="button" id="prev">← Anterior</button>
      <button class="btn ghost" type="button" id="hear">🔊 Ouvir</button>
      <button class="btn ghost" type="button" id="next">Próximo →</button>
    </div>
    <p style="margin-top:24px"><a class="btn" href="#/licao/${lesson.id}/exercicios">Próximo: exercícios →</a></p>`;

  let i = 0;
  let flipped = false;
  const flash = document.getElementById("flash");
  const show = () => {
    const [en, pt] = lesson.vocab[i];
    flash.innerHTML = flipped
      ? `<div>${esc(pt)}<small>${i + 1}/${lesson.vocab.length} · toque para ver em inglês</small></div>`
      : `<div>${esc(en)}<small>${i + 1}/${lesson.vocab.length} · toque para ver a tradução</small></div>`;
  };
  const flip = () => { flipped = !flipped; show(); };
  flash.addEventListener("click", flip);
  flash.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
  document.getElementById("next").addEventListener("click", () => { i = (i + 1) % lesson.vocab.length; flipped = false; show(); });
  document.getElementById("prev").addEventListener("click", () => { i = (i - 1 + lesson.vocab.length) % lesson.vocab.length; flipped = false; show(); });
  document.getElementById("hear").addEventListener("click", () => speak(lesson.vocab[i][0]));
  show();
}

function renderQuiz(panel, found) {
  const { level, levelIndex, lesson, lessonIndex } = found;
  const answers = new Array(lesson.quiz.length).fill(null);

  panel.innerHTML = lesson.quiz.map((item, qi) => `
    <div class="card question" data-q="${qi}">
      <p>${qi + 1}. ${esc(item.q)}</p>
      <div class="options">
        ${item.options.map((opt, oi) => `<button class="option" type="button" data-o="${oi}">${esc(opt)}</button>`).join("")}
      </div>
      <div class="explain" hidden></div>
    </div>`).join("") + `<div id="result"></div>`;

  panel.querySelectorAll(".question").forEach(qEl => {
    const qi = Number(qEl.dataset.q);
    const item = lesson.quiz[qi];
    qEl.querySelectorAll(".option").forEach(btn => {
      btn.addEventListener("click", () => {
        if (answers[qi] !== null) return;
        const oi = Number(btn.dataset.o);
        answers[qi] = oi;
        qEl.querySelectorAll(".option").forEach(b => {
          b.disabled = true;
          if (Number(b.dataset.o) === item.answer) b.classList.add("correct");
        });
        if (oi !== item.answer) btn.classList.add("wrong");
        const explain = qEl.querySelector(".explain");
        explain.textContent = (oi === item.answer ? "✅ Correto! " : "❌ Não foi dessa vez. ") + item.explain;
        explain.hidden = false;
        if (answers.every(a => a !== null)) finish();
      });
    });
  });

  function finish() {
    const score = answers.filter((a, i) => a === lesson.quiz[i].answer).length;
    const total = lesson.quiz.length;
    const prevBest = state.scores[lesson.id] ?? -1;
    if (score > prevBest) {
      state.scores[lesson.id] = score;
      saveState();
      updateOverall();
    }
    const passed = score / total >= PASS_RATIO;

    let nextHref = null;
    let nextLabel = "";
    if (passed) {
      if (lessonIndex + 1 < level.lessons.length) {
        nextHref = `#/licao/${level.lessons[lessonIndex + 1].id}`;
        nextLabel = "Próxima lição →";
      } else if (LEVELS[levelIndex + 1] && isLevelUnlocked(levelIndex + 1)) {
        nextHref = `#/nivel/${LEVELS[levelIndex + 1].id}`;
        nextLabel = `Ir para o nível ${LEVELS[levelIndex + 1].code} →`;
      } else {
        nextHref = `#/nivel/${level.id}`;
        nextLabel = "Voltar ao nível";
      }
    }

    const result = document.getElementById("result");
    result.className = `result ${passed ? "pass" : "fail"}`;
    result.innerHTML = `
      <p>${passed ? "🎉 Lição concluída!" : "Quase lá!"} Você acertou ${score} de ${total}.</p>
      ${passed ? "" : `<p style="font-weight:400">Você precisa de pelo menos ${Math.ceil(total * PASS_RATIO)} acertos. Revise a explicação e tente de novo.</p>`}
      <div class="row">
        <button class="btn ghost" type="button" id="retry">Refazer exercícios</button>
        ${nextHref ? `<a class="btn" href="${nextHref}">${nextLabel}</a>` : `<a class="btn" href="#/licao/${lesson.id}/teoria">Revisar explicação</a>`}
      </div>`;
    document.getElementById("retry").addEventListener("click", () => renderQuiz(panel, found));
    result.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// ---------- Rotas ----------
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "nivel" && parts[1]) renderLevel(parts[1]);
  else if (parts[0] === "licao" && parts[1]) renderLesson(parts[1], parts[2]);
  else renderHome();
  updateOverall();
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
route();
