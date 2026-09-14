(() => {
  const KEY = "itpass-memora-v1";
  const TERMS = window.ITPASS_TERMS;
  const byId = Object.fromEntries(TERMS.map((t) => [t.id, t]));

  const defaultState = () => ({
    created: Date.now(),
    streak: 0,
    lastStudyDay: null,
    fields: { テクノロジ: true, マネジメント: true, ストラテジ: true },
    cards: {},
    today: { date: dayKey(), answered: 0, known: 0, weak: 0 },
    history: [],
  });

  function dayKey(d = new Date()) {
    const t = new Date(d.getTime() + 9 * 3600 * 1000); // JST
    return t.toISOString().slice(0, 10);
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (!s) return defaultState();
      const today = dayKey();
      if (s.today?.date !== today) {
        if (s.lastStudyDay) {
          const prev = new Date(s.lastStudyDay + "T00:00:00+09:00");
          const now = new Date(today + "T00:00:00+09:00");
          const diff = (now - prev) / 86400000;
          if (diff === 1) s.streak = (s.streak || 0) + 0; // increment on first session
          else if (diff > 1) s.streak = 0;
        }
        s.today = { date: today, answered: 0, known: 0, weak: 0 };
      }
      s.fields ||= { テクノロジ: true, マネジメント: true, ストラテジ: true };
      s.cards ||= {};
      return s;
    } catch {
      return defaultState();
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  let state = load();
  let session = null;

  const $ = (id) => document.getElementById(id);

  function cardState(id) {
    if (!state.cards[id]) {
      state.cards[id] = {
        seen: 0,
        knowStreak: 0,
        fail: 0,
        status: "new", // new | learning | weak | mastered
        last: 0,
        lastResult: null,
      };
    }
    return state.cards[id];
  }

  function enabledTerms() {
    return TERMS.filter((t) => state.fields[t.field]);
  }

  function counts() {
    const list = enabledTerms();
    let mastered = 0, weak = 0, seen = 0;
    for (const t of list) {
      const c = state.cards[t.id];
      if (!c) continue;
      if (c.seen) seen++;
      if (c.status === "mastered") mastered++;
      if (c.status === "weak") weak++;
    }
    return { total: list.length, mastered, weak, seen };
  }

  function reviewQueue() {
    const today = Date.now();
    return enabledTerms()
      .filter((t) => {
        const c = state.cards[t.id];
        if (!c || !c.seen) return false;
        if (c.status === "weak") return true;
        if (c.status === "learning") return today - c.last > 6 * 3600 * 1000;
        if (c.lastResult === "mid") return true;
        return false;
      })
      .sort((a, b) => (state.cards[a.id].last || 0) - (state.cards[b.id].last || 0));
  }

  function skimQueue() {
    return enabledTerms()
      .filter((t) => {
        const c = state.cards[t.id];
        return !c || c.status === "new" || c.seen === 0;
      })
      .sort((a, b) => b.importance - a.importance);
  }

  function weakQueue() {
    return enabledTerms()
      .filter((t) => state.cards[t.id]?.status === "weak" || (state.cards[t.id]?.fail || 0) > 0 && state.cards[t.id]?.status !== "mastered")
      .sort((a, b) => (state.cards[b.id]?.fail || 0) - (state.cards[a.id]?.fail || 0));
  }

  function drillQueue() {
    const weak = weakQueue();
    if (weak.length) return weak;
    return enabledTerms()
      .filter((t) => state.cards[t.id]?.status === "learning")
      .sort((a, b) => a.importance - b.importance);
  }

  function renderHome() {
    const c = counts();
    const pct = c.total ? Math.round((c.mastered / c.total) * 1000) / 10 : 0;
    $("stat-mastered").textContent = c.mastered;
    $("stat-weak").textContent = c.weak;
    $("stat-streak").textContent = state.streak;
    $("prog-num").textContent = `${pct}%`;
    $("prog-bar").style.width = `${Math.min(100, pct)}%`;
    $("prog-sub").textContent = `${c.seen} / ${c.total} 語に接触`;
    $("today-ans").textContent = state.today.answered;
    $("review-n").textContent = reviewQueue().length;
    $("skim-n").textContent = skimQueue().length;
    $("weak-n").textContent = weakQueue().length;
    $("drill-n").textContent = drillQueue().length;
    $("mode-review").classList.toggle("disabled", reviewQueue().length === 0);
    $("mode-weak").classList.toggle("disabled", weakQueue().length === 0);
    $("mode-drill").classList.toggle("disabled", drillQueue().length < 1);
    document.querySelectorAll(".chip").forEach((el) => {
      el.classList.toggle("on", !!state.fields[el.dataset.field]);
    });
  }

  function show(name) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(name).classList.add("active");
  }

  function startMode(mode) {
    let queue = [];
    let title = "";
    if (mode === "review") { queue = reviewQueue(); title = "前回の復習"; }
    if (mode === "skim") { queue = skimQueue(); title = "スキミング"; }
    if (mode === "weak") { queue = weakQueue(); title = "苦手な用語"; }
    if (mode === "drill") { queue = drillQueue(); title = "徹底暗記"; }
    if (!queue.length) return;
    queue = queue.slice(0, mode === "skim" ? 20 : 15);
    session = { mode, title, queue, i: 0, known: 0, weak: 0, revealed: false };
    $("study-title").textContent = title;
    show("screen-study");
    paintCard(true);
  }

  function paintCard(resetPos) {
    const item = session.queue[session.i];
    if (!item) return finishSession();
    session.revealed = false;
    $("counter").textContent = `${session.i + 1} / ${session.queue.length}`;
    $("track-bar").style.width = `${(session.i / session.queue.length) * 100}%`;
    $("badge").textContent = item.field;
    $("badge").className = "badge " + item.field;
    $("imp").textContent = `重要度 ${item.importance}%`;
    $("term").textContent = item.term;
    $("reading").textContent = item.reading || "";
    $("cat").textContent = item.category;
    $("def").textContent = item.def;
    $("tip").textContent = item.tip || "";
    $("answer").classList.remove("show");
    $("guide").textContent = "カードをタップして意味を表示";
    $("actions").classList.add("hidden");
    const pair = item.pair && byId[item.pair];
    if (pair) {
      $("pair-btn").style.display = "block";
      $("pair-btn").textContent = `まぎらわしい：「${pair.term}」と比べる`;
    } else {
      $("pair-btn").style.display = "none";
    }
    const card = $("card");
    card.classList.remove("fly-left", "fly-right");
    if (resetPos) {
      card.style.transform = "";
      card.style.opacity = "";
    }
  }

  function reveal() {
    if (session.revealed) return;
    session.revealed = true;
    $("answer").classList.add("show");
    $("guide").textContent = "左＝苦手　　右＝覚えた";
    $("actions").classList.remove("hidden");
  }

  function grade(ok) {
    const item = session.queue[session.i];
    const c = cardState(item.id);
    c.seen += 1;
    c.last = Date.now();
    state.today.answered += 1;
    if (ok) {
      c.knowStreak += 1;
      c.lastResult = "good";
      session.known += 1;
      state.today.known += 1;
      if (c.knowStreak >= 2 && c.fail === 0) c.status = "mastered";
      else if (c.knowStreak >= 2) c.status = "learning";
      else c.status = c.status === "weak" ? "learning" : (c.status === "new" ? "learning" : c.status);
      if (c.knowStreak >= 3) c.status = "mastered";
    } else {
      c.fail += 1;
      c.knowStreak = 0;
      c.lastResult = "weak";
      c.status = "weak";
      session.weak += 1;
      state.today.weak += 1;
    }
    if (state.lastStudyDay !== dayKey()) {
      if (state.lastStudyDay) {
        const prev = new Date(state.lastStudyDay + "T00:00:00+09:00");
        const now = new Date(dayKey() + "T00:00:00+09:00");
        const diff = (now - prev) / 86400000;
        state.streak = diff === 1 ? (state.streak || 0) + 1 : 1;
      } else {
        state.streak = Math.max(1, state.streak || 1);
      }
      state.lastStudyDay = dayKey();
    }
    save();
    fly(ok ? "right" : "left");
  }

  function fly(dir) {
    const card = $("card");
    card.classList.add(dir === "right" ? "fly-right" : "fly-left");
    setTimeout(() => {
      session.i += 1;
      if (session.mode === "drill" && session.queue[session.i - 1]) {
        const prev = session.queue[session.i - 1];
        const c = state.cards[prev.id];
        if (c && c.lastResult === "weak") {
          const insertAt = Math.min(session.i + 4, session.queue.length);
          session.queue.splice(insertAt, 0, prev);
        }
      }
      if (session.i >= session.queue.length) finishSession();
      else paintCard(true);
    }, 200);
  }

  function finishSession() {
    $("done-known").textContent = session.known;
    $("done-weak").textContent = session.weak;
    $("done-total").textContent = session.queue.length;
    show("screen-done");
    renderHome();
  }

  function openCompare() {
    const item = session.queue[session.i];
    const other = byId[item.pair];
    if (!other) return;
    $("cmp-a-t").textContent = item.term;
    $("cmp-a-d").textContent = item.def;
    $("cmp-b-t").textContent = other.term;
    $("cmp-b-d").textContent = other.def;
    $("overlay").classList.add("show");
  }

  function renderList(kind) {
    const wrap = $("list-body");
    wrap.innerHTML = "";
    let list = [];
    if (kind === "weak") list = weakQueue();
    if (kind === "all") list = enabledTerms().sort((a, b) => b.importance - a.importance);
    if (kind === "mastered") list = enabledTerms().filter((t) => state.cards[t.id]?.status === "mastered");
    $("list-title").textContent = kind === "weak" ? "苦手リスト" : kind === "mastered" ? "覚えた用語" : "用語一覧";
    if (!list.length) {
      wrap.innerHTML = `<p class="hint" style="padding-top:40px">まだありません</p>`;
      return;
    }
    list.forEach((t) => {
      const c = state.cards[t.id];
      const el = document.createElement("div");
      el.className = "list-item";
      el.innerHTML = `<div><div class="t">${t.term}</div><div class="s">${t.field} · ${t.category}</div></div>
        <div>${c?.status === "weak" ? '<span class="tag">苦手</span>' : c?.status === "mastered" ? "✓" : ""}</div>`;
      el.onclick = () => {
        session = { mode: "skim", title: t.term, queue: [t], i: 0, known: 0, weak: 0, revealed: false };
        $("study-title").textContent = "用語カード";
        show("screen-study");
        paintCard(true);
      };
      wrap.appendChild(el);
    });
  }

  // swipe
  let sx = 0, sy = 0, dragging = false;
  function bindSwipe() {
    const el = $("card");
    const onStart = (x, y) => { dragging = true; sx = x; sy = y; el.style.transition = "none"; };
    const onMove = (x, y) => {
      if (!dragging) return;
      const dx = x - sx, dy = y - sy;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      $("hint-left").style.opacity = dx < -30 ? Math.min(1, (-dx - 30) / 80) : 0;
      $("hint-right").style.opacity = dx > 30 ? Math.min(1, (dx - 30) / 80) : 0;
    };
    const onEnd = (x) => {
      if (!dragging) return;
      dragging = false;
      el.style.transition = "";
      $("hint-left").style.opacity = 0;
      $("hint-right").style.opacity = 0;
      const dx = x - sx;
      if (!session.revealed) {
        if (Math.abs(dx) < 40) {
          el.style.transform = "";
          reveal();
        } else {
          reveal();
          el.style.transform = "";
        }
        return;
      }
      if (dx > 80) grade(true);
      else if (dx < -80) grade(false);
      else el.style.transform = "";
    };
    el.addEventListener("touchstart", (e) => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    el.addEventListener("touchmove", (e) => onMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    el.addEventListener("touchend", (e) => onEnd((e.changedTouches[0] || {}).clientX || sx));
    el.addEventListener("mousedown", (e) => onStart(e.clientX, e.clientY));
    window.addEventListener("mousemove", (e) => dragging && onMove(e.clientX, e.clientY));
    window.addEventListener("mouseup", (e) => dragging && onEnd(e.clientX));
    el.addEventListener("click", (e) => {
      if (Math.abs(e.clientX - sx) > 12) return;
      if (!session.revealed) reveal();
    });
  }

  function bind() {
    $("mode-review").onclick = () => startMode("review");
    $("mode-skim").onclick = () => startMode("skim");
    $("mode-weak").onclick = () => startMode("weak");
    $("mode-drill").onclick = () => startMode("drill");
    $("btn-back").onclick = () => { show("screen-home"); renderHome(); };
    $("btn-weak").onclick = () => grade(false);
    $("btn-good").onclick = () => grade(true);
    $("pair-btn").onclick = (e) => { e.stopPropagation(); openCompare(); };
    $("overlay").onclick = (e) => { if (e.target.id === "overlay") $("overlay").classList.remove("show"); };
    $("btn-close-cmp").onclick = () => $("overlay").classList.remove("show");
    $("btn-done-home").onclick = () => { show("screen-home"); renderHome(); };
    $("btn-settings").onclick = () => show("screen-settings");
    $("btn-set-back").onclick = () => { show("screen-home"); renderHome(); };
    $("btn-list-back").onclick = () => { show("screen-home"); renderHome(); };
    $("open-weak").onclick = () => { renderList("weak"); show("screen-list"); };
    $("open-all").onclick = () => { renderList("all"); show("screen-list"); };
    $("open-mastered").onclick = () => { renderList("mastered"); show("screen-list"); };
    $("reset-data").onclick = () => {
      if (confirm("学習データをすべて消しますか？")) {
        state = defaultState();
        save();
        renderHome();
        show("screen-home");
      }
    };
    document.querySelectorAll(".chip").forEach((el) => {
      el.onclick = () => {
        const f = el.dataset.field;
        const onCount = Object.values(state.fields).filter(Boolean).length;
        if (state.fields[f] && onCount === 1) return;
        state.fields[f] = !state.fields[f];
        save();
        renderHome();
      };
    });
    bindSwipe();
  }

  bind();
  renderHome();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
