(() => {
  const KEY = "itpass-kakomon-v1";
  const BANK = window.ITPASS_KAKOMON || [];
  const $ = (id) => document.getElementById(id);

  const defaultK = () => ({
    years: { r8: true, r7: true, r6: true },
    fields: { ストラテジ: true, マネジメント: true, テクノロジ: true },
    unit: "すべて",
    cards: {},
  });

  function loadK() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      return s ? { ...defaultK(), ...s, years: { ...defaultK().years, ...(s.years || {}) }, fields: { ...defaultK().fields, ...(s.fields || {}) }, cards: s.cards || {} } : defaultK();
    } catch {
      return defaultK();
    }
  }
  function saveK() { localStorage.setItem(KEY, JSON.stringify(kst)); }
  let kst = loadK();
  let kq = null;

  function show(name) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(name).classList.add("active");
  }

  function card(id) {
    if (!kst.cards[id]) kst.cards[id] = { seen: 0, fail: 0, ok: 0, status: "new", last: 0, lastResult: null };
    return kst.cards[id];
  }

  function filtered() {
    return BANK.filter((q) => kst.years[q.yearKey] && kst.fields[q.field] && (kst.unit === "すべて" || q.unit === kst.unit));
  }

  function weakList() {
    return filtered().filter((q) => kst.cards[q.id]?.status === "weak");
  }
  function reviewList() {
    return filtered().filter((q) => {
      const c = kst.cards[q.id];
      return c && c.seen && (c.status === "weak" || c.lastResult === "weak" || c.status === "learning");
    });
  }

  function shuffle(a) {
    const x = a.slice();
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
    }
    return x;
  }

  function renderKHome() {
    if (!BANK.length) {
      $("k-unit-n").textContent = "—";
      return;
    }
    const all = filtered();
    const seen = all.filter((q) => kst.cards[q.id]?.seen).length;
    const weak = weakList().length;
    const answered = all.filter((q) => kst.cards[q.id]?.seen);
    const ok = answered.reduce((s, q) => s + (kst.cards[q.id]?.ok || 0), 0);
    const tries = answered.reduce((s, q) => s + (kst.cards[q.id]?.seen || 0), 0);
    $("k-done").textContent = seen;
    $("k-weak").textContent = weak;
    $("k-acc").textContent = tries ? Math.round((ok / tries) * 100) + "%" : "—";
    $("k-unit-n").textContent = all.length;
    $("k-year-n").textContent = all.length;
    $("k-rev-n").textContent = reviewList().length;
    $("k-weak-n").textContent = weak;
    $("k-mode-review").classList.toggle("disabled", reviewList().length === 0);
    $("k-mode-weak").classList.toggle("disabled", weak === 0);

    document.querySelectorAll("#k-years .chip").forEach((el) => el.classList.toggle("on", !!kst.years[el.dataset.year]));
    document.querySelectorAll("#k-fields .chip").forEach((el) => el.classList.toggle("on", !!kst.fields[el.dataset.kfield]));

    const units = ["すべて", ...Array.from(new Set(BANK.filter((q) => kst.fields[q.field]).map((q) => q.unit))).sort()];
    const box = $("k-units");
    box.innerHTML = "";
    units.forEach((u) => {
      const b = document.createElement("button");
      b.className = "chip" + (kst.unit === u ? " on" : "");
      b.textContent = u;
      b.onclick = () => { kst.unit = u; saveK(); renderKHome(); };
      box.appendChild(b);
    });
  }

  function startK(mode) {
    let pool = [];
    let title = "過去問";
    if (mode === "unit") { pool = filtered(); title = kst.unit === "すべて" ? "単元別出題" : kst.unit; }
    if (mode === "year") { pool = filtered(); title = "年度別出題"; }
    if (mode === "review") { pool = reviewList(); title = "復習問題"; }
    if (mode === "weak") { pool = weakList(); title = "苦手問題"; }
    if (!pool.length) return;
    pool = shuffle(pool).slice(0, 10);
    kq = { pool, i: 0, ok: 0, ng: 0, locked: false, title };
    $("kquiz-title").textContent = title;
    show("screen-kquiz");
    paintK();
  }

  function paintK() {
    const q = kq.pool[kq.i];
    kq.locked = false;
    $("kquiz-counter").textContent = `${kq.i + 1} / ${kq.pool.length}`;
    $("kquiz-track").style.width = `${(kq.i / kq.pool.length) * 100}%`;
    $("kquiz-badge").textContent = q.field;
    $("kquiz-badge").className = "badge " + q.field;
    $("kquiz-meta").textContent = `${q.yearLabel} 問${q.q} · ${q.unit}`;
    $("kquiz-img").src = q.img;
    $("kquiz-explain").textContent = "";
    $("kquiz-source").textContent = q.source;
    $("kquiz-next").style.display = "none";
    $("kquiz-next").textContent = kq.i + 1 >= kq.pool.length ? "結果を見る" : "次へ";
    const box = $("kquiz-choices");
    box.innerHTML = "";
    ["ア", "イ", "ウ", "エ"].forEach((lab) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.textContent = lab;
      b.onclick = () => answerK(lab);
      box.appendChild(b);
    });
  }

  function answerK(lab) {
    if (kq.locked) return;
    kq.locked = true;
    const q = kq.pool[kq.i];
    const c = card(q.id);
    c.seen += 1;
    c.last = Date.now();
    const correct = q.answer;
    document.querySelectorAll("#kquiz-choices .choice").forEach((el) => {
      el.disabled = true;
      if (el.textContent === correct) el.classList.add("ok");
      if (el.textContent === lab && lab !== correct) el.classList.add("ng");
    });
    if (lab === correct) {
      kq.ok += 1;
      c.ok += 1;
      c.lastResult = "good";
      if (c.status === "weak") c.status = "learning";
      else if ((c.ok >= 2 && c.fail === 0) || c.ok >= 3) c.status = "mastered";
      else c.status = "learning";
      $("kquiz-explain").textContent = "正解 " + correct;
    } else {
      kq.ng += 1;
      c.fail += 1;
      c.lastResult = "weak";
      c.status = "weak";
      $("kquiz-explain").textContent = "正解は " + (correct || "（解答データなし）");
    }
    saveK();
    $("kquiz-next").style.display = "block";
  }

  function nextK() {
    kq.i += 1;
    if (kq.i >= kq.pool.length) {
      $("done-known").textContent = kq.ok;
      $("done-weak").textContent = kq.ng;
      $("done-total").textContent = kq.pool.length;
      show("screen-done");
      renderKHome();
      return;
    }
    paintK();
  }

  $("tab-vocab").onclick = () => {
    $("tab-vocab").classList.add("on");
    $("tab-kakomon").classList.remove("on");
    $("panel-vocab").hidden = false;
    $("panel-kakomon").hidden = true;
  };
  $("tab-kakomon").onclick = () => {
    $("tab-kakomon").classList.add("on");
    $("tab-vocab").classList.remove("on");
    $("panel-vocab").hidden = true;
    $("panel-kakomon").hidden = false;
    renderKHome();
  };
  document.querySelectorAll("#k-years .chip").forEach((el) => {
    el.onclick = () => {
      const y = el.dataset.year;
      const on = Object.values(kst.years).filter(Boolean).length;
      if (kst.years[y] && on === 1) return;
      kst.years[y] = !kst.years[y];
      saveK();
      renderKHome();
    };
  });
  document.querySelectorAll("#k-fields .chip").forEach((el) => {
    el.onclick = () => {
      const f = el.dataset.kfield;
      const on = Object.values(kst.fields).filter(Boolean).length;
      if (kst.fields[f] && on === 1) return;
      kst.fields[f] = !kst.fields[f];
      kst.unit = "すべて";
      saveK();
      renderKHome();
    };
  });
  $("k-mode-unit").onclick = () => startK("unit");
  $("k-mode-year").onclick = () => startK("year");
  $("k-mode-review").onclick = () => startK("review");
  $("k-mode-weak").onclick = () => startK("weak");
  $("btn-k-back").onclick = () => { show("screen-home"); $("tab-kakomon").click(); };
  $("kquiz-next").onclick = () => nextK();

  const doneHome = $("btn-done-home");
  if (doneHome) {
    const prev = doneHome.onclick;
    doneHome.onclick = () => {
      show("screen-home");
      if ($("panel-kakomon") && !$("panel-kakomon").hidden) renderKHome();
    };
  }

  renderKHome();
})();
