(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var KEY_BANK = "aipquiz.bank.v1", KEY_STATE = "aipquiz.state.v1";

  /* ---------- 저장소 (실패해도 동작하도록 try/catch) ---------- */
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var bank = lsGet(KEY_BANK) || window.DEFAULT_BANK;
  var state = lsGet(KEY_STATE) || { lastId: null, mode: "all", history: {}, wrong: [] };
  state.history = state.history || {}; state.wrong = state.wrong || [];
  function save() { lsSet(KEY_STATE, state); }

  var cur = null;            // 현재 문제 객체
  var selected = new Set();  // 선택한 보기
  var locked = false;        // 정답 확인 후 잠금

  /* ---------- 유틸 ---------- */
  function qById(id) { return bank.questions.find(function (q) { return q.id === id; }); }
  function idsForMode(mode) {
    var all = bank.questions.map(function (q) { return q.id; }).sort(function (a, b) { return a - b; });
    if (mode === "unsolved") return all.filter(function (id) { return !state.history[id]; });
    if (mode === "wrong") return all.filter(function (id) { return state.wrong.indexOf(id) >= 0; });
    return all;
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sameSet(a, b) { if (a.size !== b.length) return false; return b.every(function (x) { return a.has(x); }); }

  /* ---------- 탭 ---------- */
  var views = ["quiz", "stats", "import"];
  function showView(v) {
    views.forEach(function (n) { $("view-" + n).hidden = n !== v; });
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) { b.classList.toggle("on", b.dataset.view === v); });
    if (v === "stats") renderStats();
  }
  $("tabs").addEventListener("click", function (e) { if (e.target.dataset.view) showView(e.target.dataset.view); });

  /* ---------- 문제 표시 ---------- */
  function goto(id) {
    var q = qById(id);
    if (!q) return renderEmpty();
    cur = q; selected = new Set(); locked = false;
    state.lastId = id; save();
    $("empty").hidden = true; $("card").hidden = false;
    $("qno").textContent = "No." + q.id;
    $("qtag").textContent = (q.select > 1 ? q.select + "개 선택" : "1개 선택") + (q.src ? " · " + q.src : "");
    var dup = $("qdup");
    if (q.dupOf && q.dupOf.length) { dup.hidden = false; dup.textContent = "같은 문제: No." + q.dupOf.join(", No."); } else dup.hidden = true;
    $("qtext").textContent = q.q;
    var ul = $("opts"); ul.innerHTML = ""; ul.className = "opts";
    q.options.forEach(function (o) {
      var li = el("li", "opt"); li.dataset.key = o.key;
      li.appendChild(el("span", "k", o.key));
      var t = el("span", "t"); t.appendChild(el("span", "", o.text)); li.appendChild(t);
      li.addEventListener("click", function () { toggle(o.key); });
      ul.appendChild(li);
    });
    $("result").hidden = true;
    $("check").disabled = true; $("check").textContent = "정답 확인";
    updateMeter();
    window.scrollTo({ top: 0 });
  }
  function toggle(k) {
    if (locked) return;
    if (cur.select <= 1) selected.clear();
    if (selected.has(k) && cur.select > 1) selected.delete(k); else selected.add(k);
    Array.prototype.forEach.call($("opts").children, function (li) { li.classList.toggle("sel", selected.has(li.dataset.key)); });
    $("check").disabled = selected.size === 0;
  }
  function reveal() {
    if (locked || selected.size === 0) return;
    locked = true;
    var ok = sameSet(selected, cur.answer);
    var h = state.history[cur.id] || { attempts: 0, correct: 0 };
    h.attempts++; if (ok) h.correct++; h.lastCorrect = ok; h.last = Date.now();
    state.history[cur.id] = h;
    var wi = state.wrong.indexOf(cur.id);
    if (!ok && wi < 0) state.wrong.push(cur.id);
    if (ok && wi >= 0) state.wrong.splice(wi, 1);
    save(); updateMeter();

    var ul = $("opts"); ul.classList.add("locked");
    Array.prototype.forEach.call(ul.children, function (li) {
      var k = li.dataset.key, isAns = cur.answer.indexOf(k) >= 0, isSel = selected.has(k);
      li.classList.remove("sel");
      var cls, label;
      if (isAns) { cls = "right"; label = isSel ? "✔ 정답인 이유" : "✔ 놓친 정답 (이게 정답이에요)"; }
      else if (isSel) { cls = "wrong"; label = "✘ 내가 고른 오답 · 틀린 이유"; }
      else { cls = "neutral"; label = "✘ 틀린 이유"; }
      li.classList.add(cls);
      var why = el("span", "why"); why.appendChild(el("b", "", label));
      var txt = (cur.explain && cur.explain[k]) || "(해설이 없습니다)";
      why.appendChild(document.createTextNode(txt.replace(/^정답\.\s*/, "")));
      li.querySelector(".t").appendChild(why);
    });
    var r = $("result"); r.hidden = false; r.className = "result " + (ok ? "ok" : "ng"); r.innerHTML = "";
    r.appendChild(el("h4", "", ok ? "정답입니다 🎉" : "오답입니다 — 정답: " + cur.answer.join(", ")));
    if (cur.summary) r.appendChild(el("p", "core", "💡 핵심: " + cur.summary));
    if (!ok) r.appendChild(el("p", "muted small", "이 문제는 ‘틀린 문제 다시 풀기’ 목록에 저장되었어요. 나중에 맞히면 자동으로 빠집니다."));
    if (cur.note) r.appendChild(el("div", "note", "⚠ " + cur.note));
    $("check").textContent = "다음 문제 →";
    $("check").disabled = false;
  }
  function step(dir) {
    var ids = idsForMode($("mode").value), i;
    if (dir > 0) { i = ids.findIndex(function (x) { return x > (cur ? cur.id : 0); }); if (i < 0) { return endOfList(); } return goto(ids[i]); }
    for (i = ids.length - 1; i >= 0; i--) if (ids[i] < (cur ? cur.id : 1e9)) return goto(ids[i]);
    renderToast("처음 문제입니다.");
  }
  function endOfList() {
    var m = $("mode").value;
    if (m === "wrong") renderEmpty(state.wrong.length ? "마지막 문제까지 왔어요. 남은 틀린 문제를 다시 보려면 모드를 다시 선택하세요." : "🎉 틀린 문제를 모두 해결했어요!");
    else renderEmpty("마지막 문제입니다. ‘진행 현황’에서 틀린 문제를 확인해 보세요.");
  }
  function renderToast(msg) { var b = $("resume"); b.hidden = false; b.innerHTML = ""; b.appendChild(el("span", "", msg)); setTimeout(function () { b.hidden = true; }, 2500); }
  function renderEmpty(msg) {
    $("card").hidden = true; $("empty").hidden = false;
    $("empty").textContent = msg || (($("mode").value === "wrong") ? "틀린 문제가 아직 없어요. 먼저 문제를 풀어보세요!" : "해당하는 문제가 없습니다.");
  }
  function updateMeter() {
    var total = bank.questions.length, done = Object.keys(state.history).filter(function (k) { return qById(+k); }).length;
    $("meter").innerHTML = ""; var b = document.createElement("b"); b.style.width = (done / total * 100) + "%"; $("meter").appendChild(b);
    $("meter").title = done + " / " + total + " 문제 풀이 · 틀린 문제 " + state.wrong.length + "개";
  }

  $("check").addEventListener("click", function () { if (locked) step(1); else reveal(); });
  $("next").addEventListener("click", function () { step(1); });
  $("prev").addEventListener("click", function () { step(-1); });
  $("btnReset").addEventListener("click", function () { if (cur && !locked) { selected.clear(); toggleRefresh(); } else if (cur) goto(cur.id); });
  function toggleRefresh() { Array.prototype.forEach.call($("opts").children, function (li) { li.classList.remove("sel"); }); $("check").disabled = true; }
  $("mode").addEventListener("change", function () {
    state.mode = $("mode").value; save();
    var ids = idsForMode(state.mode);
    if (!ids.length) return renderEmpty();
    var start = ids.find(function (x) { return x >= (state.lastId || 0); });
    goto(start != null ? start : ids[0]);
  });
  document.addEventListener("keydown", function (e) {
    if ($("view-quiz").hidden || $("card").hidden || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    var k = e.key.toUpperCase();
    if (!locked && cur) {
      var idx = "123456".indexOf(k), key = idx >= 0 ? cur.options[idx] && cur.options[idx].key : (/^[A-F]$/.test(k) ? k : null);
      if (key && cur.options.some(function (o) { return o.key === key; })) { toggle(key); return; }
    }
    if (e.key === "Enter") { e.preventDefault(); if (locked) step(1); else reveal(); }
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
  });

  /* ---------- 진행 현황 / 문제 목록 ---------- */
  function statusOf(id) { var h = state.history[id]; if (!h) return ""; return state.wrong.indexOf(id) >= 0 ? "ng" : "ok"; }
  function fillGrid(node, onPick) {
    node.innerHTML = "";
    bank.questions.slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (q) {
      var b = el("button", statusOf(q.id) + (cur && cur.id === q.id ? " cur" : ""), q.id);
      b.title = "No." + q.id; b.addEventListener("click", function () { onPick(q.id); });
      node.appendChild(b);
    });
  }
  function renderStats() {
    var total = bank.questions.length, hs = Object.keys(state.history).filter(function (k) { return qById(+k); });
    var attempts = 0, correct = 0; hs.forEach(function (k) { attempts += state.history[k].attempts; correct += state.history[k].correct; });
    var box = $("statsBox"); box.innerHTML = "";
    [["푼 문제", hs.length + " / " + total], ["틀린 문제(복습)", String(state.wrong.length)], ["누적 정답률", attempts ? Math.round(correct / attempts * 100) + "%" : "-"], ["문제집 버전", bank.version || "-"]].forEach(function (s) {
      var d = el("div", "stat"); d.appendChild(el("b", "", s[1])); d.appendChild(el("span", "", s[0])); box.appendChild(d);
    });
    fillGrid($("grid"), function (id) { $("mode").value = "all"; state.mode = "all"; showView("quiz"); goto(id); });
  }
  $("btnGrid").addEventListener("click", function () { fillGrid($("gridMini"), function (id) { $("drawer").hidden = true; $("mode").value = "all"; goto(id); }); $("drawer").hidden = false; });
  $("closeDrawer").addEventListener("click", function () { $("drawer").hidden = true; });
  $("drawer").addEventListener("click", function (e) { if (e.target === $("drawer")) $("drawer").hidden = true; });
  $("btnClear").addEventListener("click", function () {
    if (!confirm("풀이 기록과 틀린 문제 목록을 모두 지울까요? (문제집은 유지됩니다)")) return;
    state = { lastId: null, mode: "all", history: {}, wrong: [] }; save(); renderStats(); updateMeter(); init();
  });

  /* ---------- 문제집 검증 ---------- */
  function norm(s) { return String(s || "").replace(/\s*\(\d\s*개\s*선택\)\s*$/, "").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase(); }
  function bigrams(s) { var m = {}, n = 0; for (var i = 0; i < s.length - 1; i++) { var g = s.substr(i, 2); m[g] = (m[g] || 0) + 1; n++; } return { m: m, n: n }; }
  function dice(a, b) {
    if (!a.n || !b.n) return 0; var inter = 0;
    for (var g in a.m) if (b.m[g]) inter += Math.min(a.m[g], b.m[g]);
    return 2 * inter / (a.n + b.n);
  }
  function answerTexts(q) { return q.answer.map(function (k) { var o = q.options.find(function (x) { return x.key === k; }); return norm(o && o.text).slice(0, 24); }).sort(); }

  function validate(raw) {
    var R = { errors: [], warns: [], info: [], questions: [], meta: {} };
    var data = Array.isArray(raw) ? { questions: raw } : raw;
    if (!data || !Array.isArray(data.questions)) { R.errors.push("questions 배열이 없습니다. 형식을 확인하세요."); return R; }
    R.meta = { title: data.title, version: data.version, updatedAt: data.updatedAt };
    var seen = {};
    data.questions.forEach(function (q, i) {
      var tag = "#" + (q && q.id != null ? q.id : "(" + (i + 1) + "번째 항목)");
      if (!q || typeof q !== "object") { R.errors.push(tag + ": 항목 형식 오류"); return; }
      var bad = false;
      if (typeof q.id !== "number") { R.errors.push(tag + ": id가 숫자가 아닙니다."); bad = true; }
      else if (seen[q.id]) { R.errors.push(tag + ": id가 중복되었습니다."); bad = true; } else seen[q.id] = 1;
      if (!q.q || String(q.q).trim().length < 10) { R.errors.push(tag + ": 문제 본문이 비어 있거나 너무 짧습니다."); bad = true; }
      if (!Array.isArray(q.options) || q.options.length < 2) { R.errors.push(tag + ": 보기가 2개 미만입니다."); bad = true; }
      else {
        var keys = q.options.map(function (o) { return o && o.key; });
        if (new Set(keys).size !== keys.length) { R.errors.push(tag + ": 보기 키가 중복되었습니다."); bad = true; }
        if (q.options.some(function (o) { return !o || !String(o.text || "").trim(); })) { R.errors.push(tag + ": 내용이 빈 보기가 있습니다."); bad = true; }
        if (!Array.isArray(q.answer) || !q.answer.length) { R.errors.push(tag + ": 정답이 없습니다."); bad = true; }
        else if (q.answer.some(function (a) { return keys.indexOf(a) < 0; })) { R.errors.push(tag + ": 정답이 보기에 없는 키입니다 (" + q.answer.join(",") + ")."); bad = true; }
        else {
          var hint = /\((\d)\s*개\s*선택\)/.exec(q.q); var want = hint ? +hint[1] : (q.select || null);
          if (want && want !== q.answer.length) { R.errors.push(tag + ": 문제는 " + want + "개 선택인데 정답이 " + q.answer.length + "개입니다."); bad = true; }
          if (!want && q.answer.length > 1) R.warns.push(tag + ": 정답이 여러 개인데 ‘선택 개수’가 명시되지 않았습니다.");
          if (q.options.length < 4) R.warns.push(tag + ": 보기가 4개 미만입니다.");
          var noExp = q.options.filter(function (o) { return !q.explain || !q.explain[o.key]; });
          if (noExp.length) R.warns.push(tag + ": 해설이 없는 보기가 있습니다 (" + noExp.map(function (o) { return o.key; }).join(",") + ").");
        }
      }
      if (!bad) {
        var nq = JSON.parse(JSON.stringify(q)); nq.select = nq.answer.length; nq.q = String(nq.q).replace(/\s*\(\d\s*개\s*선택\)\s*$/, "").trim();
        nq.explain = nq.explain || {}; R.questions.push(nq);
      }
    });
    // 중복 문제 검출 (본문 유사도 85% 이상)
    var bg = R.questions.map(function (q) { return bigrams(norm(q.q)); });
    for (var a = 0; a < R.questions.length; a++) for (var b = a + 1; b < R.questions.length; b++) {
      if (dice(bg[a], bg[b]) >= 0.85) {
        var A = R.questions[a], B = R.questions[b];
        var ta = answerTexts(A).join("|"), tb = answerTexts(B).join("|");
        if (ta === tb) R.warns.push("중복: No." + A.id + " 와 No." + B.id + " 는 같은 문제입니다 (정답도 같음). 하나로 합쳐 풀어요.");
        else R.errors.push("정합성 충돌: No." + A.id + " 와 No." + B.id + " 는 같은 문제인데 정답 내용이 서로 다릅니다. 확인이 필요해요.");
        (A.dupOf = A.dupOf || []); if (A.dupOf.indexOf(B.id) < 0) A.dupOf.push(B.id);
        (B.dupOf = B.dupOf || []); if (B.dupOf.indexOf(A.id) < 0) B.dupOf.push(A.id);
      }
    }
    // 최신 여부 / 변경점
    var curMap = {}; bank.questions.forEach(function (q) { curMap[q.id] = q; });
    var newMap = {}; R.questions.forEach(function (q) { newMap[q.id] = q; });
    var added = [], changed = [], same = 0, removed = [];
    R.questions.forEach(function (q) {
      var o = curMap[q.id];
      if (!o) added.push(q.id);
      else if (o.q !== q.q || o.answer.join() !== q.answer.join() || JSON.stringify(o.options) !== JSON.stringify(q.options) || JSON.stringify(o.explain) !== JSON.stringify(q.explain)) changed.push(q.id);
      else same++;
    });
    bank.questions.forEach(function (q) { if (!newMap[q.id]) removed.push(q.id); });
    R.diff = { added: added, changed: changed, removed: removed, same: same };
    var cv = bank.updatedAt || bank.version || "", nv = R.meta.updatedAt || R.meta.version || "";
    R.meta.relation = !nv ? "unknown" : (nv > cv ? "newer" : (nv < cv ? "older" : "same"));
    if (R.meta.relation === "older") R.warns.push("불러온 문제집(" + nv + ")이 현재 문제집(" + cv + ")보다 오래된 버전입니다.");
    if (R.meta.relation === "unknown") R.warns.push("version / updatedAt이 없어 최신 여부를 판단할 수 없습니다.");
    R.data = data;
    return R;
  }

  function list(parent, items, cls, max) {
    var ul = el("ul"); items.slice(0, max || 30).forEach(function (t) { ul.appendChild(el("li", cls, t)); });
    if (items.length > (max || 30)) ul.appendChild(el("li", "muted", "… 외 " + (items.length - (max || 30)) + "건"));
    parent.appendChild(ul);
  }
  var pending = null;
  function showReport(R, fname) {
    pending = R; var box = $("report"); box.hidden = false; box.innerHTML = "";
    var sec = el("div", "rep"); sec.appendChild(el("h4", "", "검증 결과 — " + fname));
    var s = el("p");
    s.appendChild(el("span", "pill " + (R.errors.length ? "err" : "good"), "오류 " + R.errors.length));
    s.appendChild(el("span", "pill " + (R.warns.length ? "wn" : "good"), "경고 " + R.warns.length));
    s.appendChild(document.createTextNode("유효한 문제 " + R.questions.length + "개"));
    sec.appendChild(s); box.appendChild(sec);
    if (R.errors.length) { var e = el("div", "rep"); e.appendChild(el("h4", "err", "오류 (적용 전에 고쳐야 해요)")); list(e, R.errors, "err"); box.appendChild(e); }
    if (R.warns.length) { var w = el("div", "rep"); w.appendChild(el("h4", "wn", "경고")); list(w, R.warns, "wn"); box.appendChild(w); }
    if (R.diff) {
      var d = el("div", "rep"); d.appendChild(el("h4", "", "현재 문제집과 비교"));
      var rel = { newer: "더 최신 버전입니다 ✔", older: "더 오래된 버전입니다 ⚠", same: "같은 버전입니다", unknown: "버전 정보 없음" }[R.meta.relation];
      d.appendChild(el("p", "", "버전: " + (R.meta.updatedAt || R.meta.version || "-") + " → " + rel));
      list(d, ["신규 " + R.diff.added.length + "개" + (R.diff.added.length ? " (No." + R.diff.added.slice(0, 15).join(", ") + (R.diff.added.length > 15 ? "…" : "") + ")" : ""),
        "변경 " + R.diff.changed.length + "개" + (R.diff.changed.length ? " (No." + R.diff.changed.slice(0, 15).join(", ") + ")" : ""),
        "동일 " + R.diff.same + "개", "새 파일에 없음 " + R.diff.removed.length + "개"], "");
      box.appendChild(d);
    }
    var row = el("div", "row");
    var ok = !R.errors.length && R.questions.length > 0;
    var b1 = el("button", "primary", "병합하여 적용 (신규·변경만 반영)"); b1.disabled = !ok; b1.onclick = function () { applyBank(R, "merge"); };
    var b2 = el("button", "ghost", "전체 교체로 적용"); b2.disabled = !ok; b2.onclick = function () { applyBank(R, "replace"); };
    row.appendChild(b1); row.appendChild(b2); box.appendChild(row);
    if (!ok) box.appendChild(el("p", "muted small", R.questions.length ? "오류를 해결하기 전에는 적용할 수 없어요." : "적용할 수 있는 문제가 없습니다."));
  }
  function applyBank(R, how) {
    var next;
    if (how === "merge") {
      var map = {}; bank.questions.forEach(function (q) { map[q.id] = q; }); R.questions.forEach(function (q) { map[q.id] = q; });
      next = Object.keys(map).map(function (k) { return map[k]; });
    } else next = R.questions;
    // 정답이 바뀐 문제는 풀이 기록 초기화 (이전 기록이 더 이상 유효하지 않으므로)
    R.diff.changed.forEach(function (id) {
      var o = qById(id), n = R.questions.find(function (q) { return q.id === id; });
      if (o && n && o.answer.join() !== n.answer.join()) { delete state.history[id]; var i = state.wrong.indexOf(id); if (i >= 0) state.wrong.splice(i, 1); }
    });
    bank = { title: R.meta.title || bank.title, version: R.meta.version || R.meta.updatedAt || bank.version, updatedAt: R.meta.updatedAt || R.meta.version || bank.updatedAt, source: (R.data && R.data.source) || bank.source, questions: next.sort(function (a, b) { return a.id - b.id; }) };
    if (!lsSet(KEY_BANK, bank)) alert("브라우저 저장 공간이 부족해 이번 문제집은 새로고침하면 사라질 수 있어요.");
    state.history = Object.keys(state.history).reduce(function (m, k) { if (qById(+k)) m[k] = state.history[k]; return m; }, {});
    state.wrong = state.wrong.filter(qById); save();
    $("report").innerHTML = ""; $("report").appendChild(el("div", "rep", "✔ 적용되었습니다. 문제 " + bank.questions.length + "개 (버전 " + bank.version + ")"));
    init();
  }
  function handleFile(f) {
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try { showReport(validate(JSON.parse(rd.result)), f.name); }
      catch (e) { $("report").hidden = false; $("report").innerHTML = ""; var d = el("div", "rep"); d.appendChild(el("h4", "err", "JSON을 읽을 수 없습니다")); d.appendChild(el("p", "", String(e.message))); $("report").appendChild(d); }
    };
    rd.readAsText(f, "utf-8");
  }
  $("file").addEventListener("change", function (e) { handleFile(e.target.files[0]); });
  var dz = $("drop");
  ["dragover", "dragenter"].forEach(function (n) { dz.addEventListener(n, function (e) { e.preventDefault(); dz.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (n) { dz.addEventListener(n, function (e) { e.preventDefault(); dz.classList.remove("over"); }); });
  dz.addEventListener("drop", function (e) { handleFile(e.dataTransfer.files[0]); });
  $("btnExport").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(bank, null, 1)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "question-bank.json"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $("btnDefault").addEventListener("click", function () {
    if (!confirm("처음 제공된 문제집으로 되돌릴까요? (풀이 기록은 번호가 같은 문제만 유지됩니다)")) return;
    lsDel(KEY_BANK); bank = window.DEFAULT_BANK; state.history = Object.keys(state.history).reduce(function (m, k) { if (qById(+k)) m[k] = state.history[k]; return m; }, {}); state.wrong = state.wrong.filter(qById); save(); init();
  });

  /* ---------- 시작 ---------- */
  function applyResets() {
    var ids = (bank && bank.resetIds) || [];
    if (!ids.length || state.bankVer === bank.version) return;
    state.history = Object.keys(state.history).reduce(function (m, k) { if (ids.indexOf(+k) < 0) m[k] = state.history[k]; return m; }, {});
    state.wrong = state.wrong.filter(function (id) { return ids.indexOf(id) < 0; });
    state.bankVer = bank.version; save();
  }
  function init() {
    applyResets();
    $("mode").value = state.mode || "all"; updateMeter();
    var ids = idsForMode($("mode").value);
    var done = Object.keys(state.history).length;
    var rb = $("resume");
    if (state.lastId && qById(state.lastId) && done) {
      var h = state.history[state.lastId];
      var target = state.lastId;
      if (h && ids.length) { var nx = ids.find(function (x) { return x > state.lastId; }); if (nx != null) target = nx; }
      rb.hidden = false; rb.innerHTML = "";
      rb.appendChild(el("span", "", "지난번에 No." + state.lastId + "까지 풀었어요. 이어서 No." + target + "부터 시작합니다. (푼 문제 " + done + "개, 틀린 문제 " + state.wrong.length + "개)"));
      var b = el("button", "ghost small", "처음부터"); b.onclick = function () { rb.hidden = true; var all = idsForMode($("mode").value); if (all.length) goto(all[0]); };
      rb.appendChild(b);
      if (ids.indexOf(target) >= 0) goto(target); else if (ids.length) goto(ids[0]); else renderEmpty();
    } else { rb.hidden = true; if (ids.length) goto(ids[0]); else renderEmpty(); }
  }
  init();
})();
