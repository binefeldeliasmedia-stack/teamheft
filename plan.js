/* Teamheft – Folgen (Board + Kalender), Folge als Seite, Seitenleiste, „Besser machen“.
   Aufbau nach dem Vorbild einer Notion-Datenbank: jede Folge ist eine Karte, ein Klick öffnet sie als Seite.
   Status, Namen und Termine kommen aus der Vorlage im privaten Speicher, nie aus dem Code.
   Ziehen geht mit Maus und Finger (Pointer Events): auf dem Handy kurz gedrückt halten, dann ziehen. */
"use strict";
const PL = { ansicht: "board", monat: null, filter: "", drag: null, peek: null, besserFilter: "offen", boardLeft: 0 };
let POP = null;
try { PL.ansicht = localStorage.getItem("th-ansicht") || "board"; PL.filter = localStorage.getItem("th-plan-filter") || ""; } catch (e) {}

const svg = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
const IC = {
  board: svg('<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>'),
  kal: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  stil: svg('<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.2-1-1.4-1-2.4 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.1-4-7.5-9-7.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  offen: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  besser: svg('<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 6l3 3"/>'),
  seite: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'),
  status: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>'),
  person: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  datum: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  buch: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>'),
  nr: svg('<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>'),
  text: svg('<path d="M4 6h16M4 11h16M4 16h10"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  zu: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  gross: svg('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'),
  zurueck: svg('<path d="M15 5l-7 7 7 7"/>'),
  mehr: svg('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
  menue: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  filter: svg('<path d="M4 5h16l-6 8v6l-4-2v-4z"/>'),
  haken: svg('<path d="M5 12l5 5 9-10"/>')
};

// ---------- Daten ----------
function planCfg() {
  const p = (V && V.plan) || {};
  return {
    status: p.status && p.status.length ? p.status : [{ id: "Offen", farbe: "gray" }, { id: "Fertig", farbe: "green", fertig: true }],
    wer: p.wer || [], termine: p.termine || [], hinweis: p.hinweis || ""
  };
}
const statusInfo = s => planCfg().status.find(x => x.id === s) || planCfg().status[0];
const stKlasse = s => "st-" + (statusInfo(s).farbe || "gray");
const kartenListe = () => Object.entries(H.karten || {}).filter(([, k]) => !k.weg);
const kPos = k => (typeof k.pos === "number" && k.pos) ? k.pos : (Number(k.nr) || 0) * 1000;
const fNr = nr => "F" + String(nr).padStart(3, "0");
const kName = k => k && k.nr ? fNr(k.nr) : "Neu";
const folgeVonKarte = k => k && k.nr ? fNr(k.nr) : null;
const passtFilter = k => !PL.filter || (k.wer || []).includes(PL.filter);
const aktivKarten = () => kartenListe().filter(([, k]) => !statusInfo(k.status).fertig).length;
const besserOffen = () => Object.values(H.besser || {}).filter(b => !b.weg && !b.erledigt).length;
const breit = () => window.matchMedia("(min-width: 900px)").matches;

const isoTag = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const ausIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const datumKurz = s => ausIso(s).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
const datumLang = s => ausIso(s).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

function setKarte(id, patch, delay = 700) {
  H.karten[id] = { ...(H.karten[id] || {}), ...patch, at: Date.now(), von: ICH.name };
  const k = H.karten[id], p = {};
  for (const f of ["nr", "titel", "status", "wer", "erscheint", "bibelstelle", "notiz", "pos", "weg"]) if (f in k) p[f] = k[f];
  schreibe("karte:" + id, "karte", { id, patch: p }, delay);
}
function setBesser(id, patch, delay = 800) {
  H.besser[id] = { ...(H.besser[id] || {}), ...patch, at: Date.now(), von: ICH.name };
  const b = H.besser[id], p = {};
  for (const f of ["was", "anders", "wer", "folge", "erledigt", "weg"]) if (f in b) p[f] = b[f];
  schreibe("besser:" + id, "besser", { id, patch: p }, delay);
}
// Folgen, die schon ein Besprechungsheft haben, aber noch keine Karte: Karte mit fester ID nachziehen (Karte und Folge sind dasselbe)
function folgenOhneKarte() {
  const nrs = new Set(kartenListe().map(([, k]) => Number(k.nr) || 0));
  for (const f of Object.keys(H.folgen).filter(x => /^F\d+$/.test(x))) {
    const nr = parseInt(f.slice(1), 10);
    if (nrs.has(nr) || H.karten["k" + f]) continue;
    setKarte("k" + f, { nr, titel: H.folgen[f].titel || "", status: planCfg().status[0].id, wer: [], erscheint: "", bibelstelle: "", notiz: "", pos: nr * 1000 }, 300);
  }
}
function naechsteNr() {
  const nrs = kartenListe().map(([, k]) => Number(k.nr) || 0).concat(Object.keys(H.folgen).filter(x => /^F\d+$/.test(x)).map(f => parseInt(f.slice(1), 10)));
  return (nrs.length ? Math.max(...nrs) : 0) + 1;
}
function neueKarte(status) {
  const nr = naechsteNr(), st = status || planCfg().status[0].id;
  const id = "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const imStatus = kartenListe().filter(([, k]) => (k.status || planCfg().status[0].id) === st).map(([, k]) => kPos(k));
  // Wie bei Notion: Im gefilterten Board bekommt die neue Karte den Filterwert, damit sie nie unsichtbar wird
  setKarte(id, { nr, titel: "", status: st, wer: PL.filter ? [PL.filter] : [], erscheint: "", bibelstelle: "", notiz: "", pos: (imStatus.length ? Math.max(...imStatus) : 0) + 1000 }, 0);
  if (tab !== "folgen") { tab = "folgen"; try { history.pushState({ tab }, ""); } catch (e) {} }
  renderNav(); renderView();
  oeffneFolge(id, false, true);
}

// ---------- Rahmen: Seitenleiste, Titel, Menü ----------
function setzeTitel(t) { const n = $("#topbartitel"); if (n) n.textContent = t; }
function seitenRahmen(v) { const r = el("div", { class: "seite-rahmen" }); v.append(r); return r; }
function renderNav() {
  const n = $("#nav"); if (!n || !H) return;
  n.replaceChildren();
  const item = (id, label, icon, extra, sub) => {
    const aktiv = tab === id || (sub && PL.peek && "k:" + PL.peek === id);
    const b = el("button", { type: "button", class: "sl-item" + (sub ? " sub" : "") + (aktiv ? " aktiv" : ""), "aria-current": aktiv ? "page" : null, onclick: () => { menueZu(); if (id.startsWith("k:")) oeffneFolge(id.slice(2)); else go(id); } },
      el("span", { class: "sl-ic", html: icon }), el("span", { class: "sl-l", text: label }));
    if (extra) b.append(el("span", { class: "sl-n", text: extra }));
    n.append(b);
  };
  item("folgen", "Folgen", IC.board, String(aktivKarten()));
  const ks = kartenListe().sort((a, b) => (a[1].nr || 0) - (b[1].nr || 0));
  for (const [id, k] of ks) item("k:" + id, kName(k) + (k.titel ? " " + k.titel : ""), IC.seite, "", true);
  n.append(el("div", { class: "sl-trenn" }));
  const [a, c] = fortschritt("serie");
  item("serie", "Serien-Stil", IC.stil, a + "/" + c);
  item("offen", "Offene Punkte", IC.offen, String(Object.values(H.offen).filter(o => !o.erledigt && !o.weg).length || ""));
  item("besser", "Besser machen", IC.besser, String(besserOffen() || ""));
}
function menueAuf() { document.body.classList.add("menue-offen"); $("#slhinter").hidden = false; $("#menuknopf").setAttribute("aria-expanded", "true"); }
function menueZu() { document.body.classList.remove("menue-offen"); const h = $("#slhinter"); if (h) h.hidden = true; const m = $("#menuknopf"); if (m) m.setAttribute("aria-expanded", "false"); }
function rahmenEinrichten() {
  const m = $("#menuknopf"); if (m && !m._an) { m._an = 1; m.innerHTML = IC.menue; m.addEventListener("click", () => document.body.classList.contains("menue-offen") ? menueZu() : menueAuf()); }
  const h = $("#slhinter"); if (h && !h._an) { h._an = 1; h.addEventListener("click", menueZu); }
  const ph = $("#peekhinter"); if (ph && !ph._an) { ph._an = 1; ph.addEventListener("click", () => peekZu()); }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", rahmenEinrichten); else rahmenEinrichten();
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (POP) return popZu();
  if (document.body.classList.contains("menue-offen")) return menueZu();
  if (PL.peek) peekZu();
});
let breitVorher = null;
window.addEventListener("resize", () => {
  const b = breit(); if (breitVorher === null) { breitVorher = b; return; }
  if (b === breitVorher) return; breitVorher = b;
  if (!b && PL.peek) { const id = PL.peek; peekZu(true); go("k:" + id); }
  menueZu();
});

// ---------- Ausklapp-Menü (Status, Wer ist dran, Filter, …) ----------
function popAuf(anker, fuellen) {
  popZu();
  const p = el("div", { class: "pop", role: "menu" });
  fuellen(p);
  document.body.append(p);
  const r = anker.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
  p.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
  p.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";
  const zu = e => { if (!p.contains(e.target) && !anker.contains(e.target)) popZu(); };
  const scroll = e => { if (!p.contains(e.target)) popZu(); };
  setTimeout(() => { document.addEventListener("pointerdown", zu, true); document.addEventListener("scroll", scroll, true); }, 0);
  POP = { p, zu, scroll, anker };
  const erstes = p.querySelector("button"); if (erstes) erstes.focus({ preventScroll: true });
}
function popZu() {
  if (!POP) return; const { p, zu, scroll, anker } = POP; POP = null;
  p.remove(); document.removeEventListener("pointerdown", zu, true); document.removeEventListener("scroll", scroll, true);
  if (anker && document.contains(anker)) try { anker.focus({ preventScroll: true }); } catch (e) {}
}
const statusPill = s => el("span", { class: "pill-st " + stKlasse(s), text: s || "" });
const werChip = w => el("span", { class: "chip-wer" + (ICH && w === ICH.name ? " ich" : ""), text: w });

// ---------- Ziehen (Maus + Finger) ----------
document.addEventListener("touchmove", e => { if (PL.drag) e.preventDefault(); }, { passive: false });
function ziehbar(node, id, onTap) {
  node.addEventListener("contextmenu", e => { if (e.pointerType !== "mouse") e.preventDefault(); });
  node.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } });
  node.addEventListener("pointerdown", e => {
    if (e.button !== 0 || PL.drag) return;
    const sx = e.clientX, sy = e.clientY, pid = e.pointerId, finger = e.pointerType !== "mouse";
    let aktiv = false, weg = false, timer = null, lx = sx, ly = sy;
    const los = () => { aktiv = true; ziehStart(node, id, lx, ly); };
    if (finger) timer = setTimeout(() => { if (!weg) { los(); try { navigator.vibrate && navigator.vibrate(12); } catch (x) {} } }, 300);
    const move = ev => {
      if (ev.pointerId !== pid) return;
      lx = ev.clientX; ly = ev.clientY;
      const dist = Math.hypot(lx - sx, ly - sy);
      if (!aktiv) {
        if (finger) { if (dist > 10) { weg = true; ende(); } return; }
        if (dist > 5) los(); else return;
      }
      ev.preventDefault();
      PL.drag.x = lx; PL.drag.y = ly; ziehBild();
    };
    const up = ev => {
      if (ev.pointerId !== pid) return;
      ende();
      if (aktiv && PL.drag && ev.type === "pointerup") { PL.drag.x = ev.clientX; PL.drag.y = ev.clientY; ziehBild(true); }
      if (aktiv) ziehEnde(ev.type === "pointercancel");
      else if (!weg && ev.type === "pointerup") onTap();
    };
    const ende = () => { clearTimeout(timer); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
}
function ziehStart(node, id, x, y) {
  const r = node.getBoundingClientRect();
  const geist = node.cloneNode(true);
  geist.classList.add("geist"); geist.style.width = r.width + "px";
  document.body.append(geist);
  node.classList.add("wird-gezogen"); document.body.classList.add("zieht");
  const board = document.querySelector(".board"); if (board) board.classList.add("ohne-snap");
  PL.drag = { id, node, geist, offX: x - r.left, offY: y - r.top, x, y, ziel: null, vor: null, raf: 0 };
  const schritt = () => { if (!PL.drag) return; ziehBild(); PL.drag.raf = requestAnimationFrame(schritt); };
  schritt();
}
function ziehBild(ohneScroll) {
  const d = PL.drag; const { x, y } = d;
  d.geist.style.transform = `translate(${x - d.offX}px, ${y - d.offY}px) rotate(1.5deg)`;
  const rand = ohneScroll ? -1 : 64, h = window.innerHeight;
  if (y < rand) window.scrollBy(0, -Math.ceil((rand - y) / 4));
  else if (y > h - rand) window.scrollBy(0, Math.ceil((y - (h - rand)) / 4));
  const board = document.querySelector(".board");
  if (board && !ohneScroll) {
    const br = board.getBoundingClientRect();
    if (y > br.top && y < br.bottom) {
      if (x < br.left + rand) board.scrollLeft -= Math.ceil((br.left + rand - x) / 3);
      else if (x > br.right - rand) board.scrollLeft += Math.ceil((x - (br.right - rand)) / 3);
    }
  }
  const hit = document.elementFromPoint(x, y);
  const zone = hit && hit.closest("[data-drop]");
  if (d.ziel !== zone) { if (d.ziel) d.ziel.classList.remove("drop-ziel"); if (zone) zone.classList.add("drop-ziel"); d.ziel = zone; }
  if (d.vor) { d.vor.classList.remove("davor"); d.vor = null; }
  if (zone && zone.dataset.drop.startsWith("status:")) {
    const vor = [...zone.querySelectorAll(".karte")].find(c => c !== d.node && c.getBoundingClientRect().top + c.offsetHeight / 2 > y);
    if (vor) { vor.classList.add("davor"); d.vor = vor; }
  }
}
function ziehEnde(abbruch) {
  const d = PL.drag; if (!d) return;
  cancelAnimationFrame(d.raf);
  d.geist.remove(); d.node.classList.remove("wird-gezogen"); document.body.classList.remove("zieht");
  if (d.ziel) d.ziel.classList.remove("drop-ziel"); if (d.vor) d.vor.classList.remove("davor");
  const board = document.querySelector(".board"); if (board) { board.classList.remove("ohne-snap"); PL.boardLeft = board.scrollLeft; }
  PL.drag = null;
  if (abbruch || !d.ziel) return;
  const k = H.karten[d.id]; if (!k) return;
  const dd = d.ziel.dataset.drop, art = dd.slice(0, dd.indexOf(":")), wert = dd.slice(dd.indexOf(":") + 1);
  if (art === "tag") {
    if (k.erscheint === wert) return;
    setKarte(d.id, { erscheint: wert }, 200); toast(kName(k) + " erscheint jetzt am " + datumLang(wert));
  } else if (art === "ohne") {
    if (!k.erscheint) return;
    setKarte(d.id, { erscheint: "" }, 200); toast(kName(k) + " hat jetzt keinen Termin");
  } else if (art === "status") {
    const spalte = kartenListe().filter(([id, c]) => id !== d.id && (c.status || planCfg().status[0].id) === wert).sort((a, b) => kPos(a[1]) - kPos(b[1]));
    const vorId = d.vor ? d.vor.dataset.id : null;
    const i = vorId ? spalte.findIndex(([id]) => id === vorId) : spalte.length;
    const vorher = i > 0 ? kPos(spalte[i - 1][1]) : null, nachher = i < spalte.length ? kPos(spalte[i][1]) : null;
    const pos = vorher == null && nachher == null ? 1000 : vorher == null ? nachher - 1000 : nachher == null ? vorher + 1000 : (vorher + nachher) / 2;
    const neuStatus = k.status !== wert;
    setKarte(d.id, { status: wert, pos }, 200);
    if (neuStatus) toast(kName(k) + " → " + wert);
  }
  renderView(); renderNav(); if (PL.peek === d.id) renderPeek();
}

// ---------- Folgen: Board + Kalender ----------
function renderFolgen(v) {
  const cfg = planCfg();
  const wrap = el("div", { class: "folgen" });
  const ansichten = el("div", { class: "ansichten", role: "tablist", "aria-label": "Ansicht" },
    [["board", "Board", IC.board], ["kalender", "Kalender", IC.kal]].map(([a, l, ic]) => el("button", { type: "button", role: "tab", class: "ansicht", "aria-selected": PL.ansicht === a ? "true" : "false", html: ic + "<span>" + l + "</span>", onclick: () => { PL.ansicht = a; try { localStorage.setItem("th-ansicht", a); } catch (e) {} renderView(); } })));
  const filterKnopf = el("button", { type: "button", class: "leiste-btn" + (PL.filter ? " an" : ""), html: IC.filter + "<span>" + (PL.filter ? "Dran: " + PL.filter : "Wer ist dran") + "</span>" });
  filterKnopf.addEventListener("click", () => popAuf(filterKnopf, p => {
    p.append(el("div", { class: "pop-h", text: "Nur Karten zeigen von" }));
    for (const w of ["", ...cfg.wer]) p.append(el("button", { type: "button", class: "pop-item" + (PL.filter === w ? " an" : ""), role: "menuitemradio", "aria-checked": PL.filter === w ? "true" : "false", onclick: () => { PL.filter = w; try { localStorage.setItem("th-plan-filter", w); } catch (e) {} popZu(); renderView(); } }, w ? werChip(w) : el("span", { text: "Alle" }), PL.filter === w ? el("span", { class: "pop-haken", html: IC.haken }) : null));
  }));
  const neu = el("button", { type: "button", class: "btn primary neu-btn", html: IC.plus + "<span>Neue Folge</span>", onclick: () => neueKarte() });
  const versteckt = PL.filter ? kartenListe().filter(([, k]) => !passtFilter(k)).length : 0;
  const filterHinweis = PL.filter ? el("div", { class: "filter-hinweis", role: "status" },
    el("span", { text: "Gefiltert: nur Karten, bei denen " + PL.filter + " dran ist" + (versteckt ? " · " + versteckt + " ausgeblendet" : "") }),
    el("button", { type: "button", class: "filter-weg", "aria-label": "Filter aufheben", html: IC.zu + "<span>Alle zeigen</span>", onclick: () => { PL.filter = ""; try { localStorage.setItem("th-plan-filter", ""); } catch (e) {} renderView(); } })) : null;
  wrap.append(
    el("div", { class: "folgen-kopf" }, el("h1", { class: "seiten-h", text: "Folgen" }), cfg.hinweis ? el("p", { class: "note", text: cfg.hinweis }) : null),
    el("div", { class: "ansicht-leiste" }, ansichten, el("span", { class: "spacer" }), filterKnopf, neu), filterHinweis);
  v.append(wrap);
  if (PL.ansicht === "kalender") renderKalender(wrap); else renderBoard(wrap);
}
function karteBoard(id, k) {
  const props = el("div", { class: "k-props" });
  if ((k.wer || []).length) props.append(el("div", { class: "k-wer" }, k.wer.map(werChip)));
  if (k.erscheint) props.append(el("div", { class: "k-zeile", html: IC.datum }, el("span", { text: datumKurz(k.erscheint) })));
  if (k.bibelstelle) props.append(el("div", { class: "k-zeile", html: IC.buch }, el("span", { class: "k-kurz", text: k.bibelstelle })));
  const f = folgeVonKarte(k), hf = f && H.folgen[f];
  if (hf && hf.status === "fertig") props.append(el("div", { class: "k-zeile ok", html: IC.haken }, el("span", { text: "Fertig, Claude darf lesen" })));
  const n = el("div", { class: "karte" + (PL.peek === id ? " aktiv" : ""), "data-id": id, role: "button", tabindex: "0", "aria-label": kName(k) + " " + (k.titel || "Ohne Titel") + ", " + (k.status || "") + ". Öffnen mit Enter. Verschieben: gedrückt halten und ziehen." },
    el("div", { class: "k-titel" }, el("span", { class: "k-nr", text: kName(k) }), el("span", { class: "k-t", text: k.titel || "Ohne Titel" })), props);
  ziehbar(n, id, () => oeffneFolge(id));
  return n;
}
function renderBoard(v) {
  const cfg = planCfg();
  const board = el("div", { class: "board", "aria-label": "Board nach Status" });
  for (const s of cfg.status) {
    const ks = kartenListe().filter(([, k]) => (k.status || cfg.status[0].id) === s.id && passtFilter(k)).sort((a, b) => kPos(a[1]) - kPos(b[1]));
    const liste = el("div", { class: "sp-liste" });
    for (const [id, k] of ks) liste.append(karteBoard(id, k));
    board.append(el("section", { class: "spalte " + stKlasse(s.id), "data-drop": "status:" + s.id, "aria-label": s.id + ", " + ks.length + " Karten" },
      el("header", { class: "sp-kopf" }, statusPill(s.id), el("span", { class: "sp-n", text: String(ks.length) })),
      liste,
      el("button", { type: "button", class: "sp-neu", html: IC.plus + "<span>Neu</span>", onclick: () => neueKarte(s.id) })));
  }
  v.append(board);
  board.scrollLeft = PL.boardLeft || 0;
  board.addEventListener("scroll", () => { if (!PL.drag) PL.boardLeft = board.scrollLeft; }, { passive: true });
}
function karteChip(id, k) {
  const n = el("div", { class: "kchip " + stKlasse(k.status), "data-id": id, role: "button", tabindex: "0", title: kName(k) + " " + (k.titel || ""), "aria-label": kName(k) + " " + (k.titel || "") + ", " + (k.status || "") },
    el("b", { text: kName(k) }), el("span", { class: "kchip-t", text: k.titel || "" }));
  ziehbar(n, id, () => oeffneFolge(id));
  return n;
}
function renderKalender(v) {
  const cfg = planCfg(), heute = isoTag(new Date());
  if (!PL.monat) {
    const naechste = kartenListe().filter(([, k]) => k.erscheint && k.erscheint >= heute).sort((a, b) => a[1].erscheint.localeCompare(b[1].erscheint))[0];
    const d = naechste ? ausIso(naechste[1].erscheint) : new Date();
    PL.monat = new Date(d.getFullYear(), d.getMonth(), 1);
  }
  const m = PL.monat;
  const nav = el("div", { class: "monat-nav" },
    el("h2", { class: "monat", text: m.toLocaleDateString("de-DE", { month: "long", year: "numeric" }) }),
    el("span", { class: "spacer" }),
    el("button", { type: "button", class: "icon-btn", "aria-label": "Vorheriger Monat", html: IC.zurueck, onclick: () => { PL.monat = new Date(m.getFullYear(), m.getMonth() - 1, 1); renderView(); } }),
    el("button", { type: "button", class: "leiste-btn", text: "Heute", onclick: () => { const d = new Date(); PL.monat = new Date(d.getFullYear(), d.getMonth(), 1); renderView(); } }),
    el("button", { type: "button", class: "icon-btn spiegel", "aria-label": "Nächster Monat", html: IC.zurueck, onclick: () => { PL.monat = new Date(m.getFullYear(), m.getMonth() + 1, 1); renderView(); } }));
  const grid = el("div", { class: "kal", role: "grid", "aria-label": "Monatskalender" });
  for (const t of ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]) grid.append(el("div", { class: "kal-wt", text: t }));
  const start = new Date(m.getFullYear(), m.getMonth(), 1 - ((m.getDay() + 6) % 7));
  const proTag = {};
  for (const [id, k] of kartenListe()) if (k.erscheint && passtFilter(k)) (proTag[k.erscheint] = proTag[k.erscheint] || []).push([id, k]);
  const termine = {}; for (const t of cfg.termine) (termine[t.datum] = termine[t.datum] || []).push(t.titel);
  const wochen = Math.ceil((((m.getDay() + 6) % 7) + new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) / 7);
  for (let i = 0; i < wochen * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), iso = isoTag(d);
    const zelle = el("div", { class: "kal-tag" + (d.getMonth() !== m.getMonth() ? " fremd" : "") + (iso === heute ? " heute" : ""), "data-drop": "tag:" + iso, role: "gridcell", "aria-label": datumLang(iso) },
      el("span", { class: "kal-nr", text: String(d.getDate()) }));
    for (const t of termine[iso] || []) zelle.append(el("span", { class: "kal-termin", text: t, title: t }));
    for (const [id, k] of (proTag[iso] || []).sort((a, b) => (a[1].nr || 0) - (b[1].nr || 0))) zelle.append(karteChip(id, k));
    grid.append(zelle);
  }
  v.append(el("div", { class: "kal-wrap" }, nav, grid));
  const ohne = kartenListe().filter(([, k]) => !k.erscheint && passtFilter(k)).sort((a, b) => (a[1].nr || 0) - (b[1].nr || 0));
  const reihe = el("div", { class: "karten-reihe" }); for (const [id, k] of ohne) reihe.append(karteBoard(id, k));
  if (!ohne.length) reihe.append(el("p", { class: "note klein", text: "Alle Folgen haben einen Termin. Karte hierher ziehen, um den Termin zu entfernen." }));
  v.append(el("div", { class: "ablage", "data-drop": "ohne" }, el("h3", { class: "klein-h", text: "Ohne Termin · " + ohne.length }), reihe));
}

// ---------- Folge als Seite ----------
function oeffneFolge(id, ausVerlauf, neu) {
  if (!H.karten[id]) return;
  if (breit() && tab === "folgen") {
    const war = PL.peek; PL.peek = id;
    if (!ausVerlauf && war !== id) try { history.pushState({ tab, peek: id }, ""); } catch (e) {}
    renderPeek(neu || war !== id); renderNav(); markiereAktiveKarte();
  } else {
    go("k:" + id);
    if (neu) { const t = document.querySelector(".seite-titel"); if (t) t.focus({ preventScroll: true }); }
  }
}
function renderPeek(vonOben) {
  const p = $("#peek"), id = PL.peek; if (!p || !id) return;
  const scroll = p.scrollTop;
  p.replaceChildren(); p.hidden = false; $("#peekhinter").hidden = false; document.body.classList.add("peek-offen");
  renderFolgeSeite(p, id, "peek");
  p.scrollTop = vonOben ? 0 : scroll;
  const k = H.karten[id];
  if (vonOben && k && !k.titel) { const t = p.querySelector(".seite-titel"); if (t) t.focus({ preventScroll: true }); }
}
function peekZu(still) {
  if (!PL.peek) return;
  PL.peek = null; SEITE = null;
  const p = $("#peek"); p.hidden = true; p.replaceChildren(); $("#peekhinter").hidden = true; document.body.classList.remove("peek-offen");
  popZu(); markiereAktiveKarte(); renderNav();
  if (!still) { try { if (history.state && history.state.peek) history.back(); } catch (e) {} }
}
function markiereAktiveKarte() { document.querySelectorAll(".karte").forEach(n => n.classList.toggle("aktiv", n.dataset.id === PL.peek)); }

function propZeile(icon, label, wert, id) {
  return el("div", { class: "prop" }, el("div", { class: "prop-l", id }, el("span", { class: "prop-ic", html: icon }), el("span", { text: label })), el("div", { class: "prop-w" }, wert));
}
function renderFolgeSeite(c, id, modus) {
  const k = H.karten[id]; const cfg = planCfg();
  // Werkzeugleiste
  const mehr = el("button", { type: "button", class: "icon-btn", "aria-label": "Weitere Aktionen", html: IC.mehr });
  mehr.addEventListener("click", () => popAuf(mehr, p => {
    let scharf = false;
    const weg = el("button", { type: "button", class: "pop-item gefahr", text: "Folge entfernen" });
    weg.addEventListener("click", () => {
      if (!scharf) { scharf = true; weg.textContent = "Wirklich entfernen? Nochmal tippen"; return; }
      popZu(); setKarte(id, { weg: true }, 0); toast(kName(k) + " entfernt (Claude kann sie wiederherstellen)");
      if (modus === "peek") { peekZu(); renderView(); } else go("folgen");
    });
    p.append(weg);
  }));
  const leiste = el("div", { class: "seite-leiste" });
  if (modus === "peek") leiste.append(
    el("button", { type: "button", class: "icon-btn", "aria-label": "Schließen", title: "Schließen (Esc)", html: IC.zu, onclick: () => peekZu() }),
    el("button", { type: "button", class: "leiste-btn", html: IC.gross + "<span>Als ganze Seite öffnen</span>", onclick: () => { const i = PL.peek; peekZu(true); go("k:" + i); } }));
  else leiste.append(el("button", { type: "button", class: "leiste-btn", html: IC.zurueck + "<span>Folgen</span>", onclick: () => go("folgen") }));
  leiste.append(el("span", { class: "spacer" }), el("span", { class: "wer", text: k.von ? "zuletzt " + k.von + ", " + zeit(k.at) : "" }), mehr);
  c.append(leiste);

  const seite = el("article", { class: "seite", "data-karte": id });
  const titel = el("textarea", { class: "seite-titel", rows: "1", placeholder: "Ohne Titel", "aria-label": "Titel der Folge", "data-prop": "titel" });
  titel.value = k.titel || "";
  titel.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); titel.blur(); } });
  titel.addEventListener("input", () => {
    titel.value = titel.value.replace(/\n/g, " "); autoGrow(titel);
    setKarte(id, { titel: titel.value });
    const f = folgeVonKarte(H.karten[id]);
    if (f && H.folgen[f]) { H.folgen[f] = { ...H.folgen[f], titel: titel.value }; const t = titel.value; schreibe("folge:" + f, "folge", { id: f, patch: { titel: t } }); }
    document.querySelectorAll(`.karte[data-id="${id}"] .k-t`).forEach(n => n.textContent = titel.value || "Ohne Titel");
    setzeTitel(kName(H.karten[id]) + " " + titel.value);
  });
  titel.addEventListener("blur", () => renderNav());
  requestAnimationFrame(() => autoGrow(titel));
  seite.append(el("div", { class: "seite-nr", text: kName(k) }), titel);

  // Eigenschaften
  const props = el("div", { class: "props" });
  const stKnopf = el("button", { type: "button", class: "prop-btn", "aria-labelledby": "pl-status-" + id, "data-prop": "status" });
  const stZeichnen = () => stKnopf.replaceChildren(statusPill(H.karten[id].status || cfg.status[0].id));
  stZeichnen();
  stKnopf.addEventListener("click", () => popAuf(stKnopf, p => {
    p.append(el("div", { class: "pop-h", text: "Status wählen" }));
    for (const s of cfg.status) {
      const an = (H.karten[id].status || cfg.status[0].id) === s.id;
      p.append(el("button", { type: "button", class: "pop-item" + (an ? " an" : ""), role: "menuitemradio", "aria-checked": an ? "true" : "false", onclick: () => { setKarte(id, { status: s.id }, 200); popZu(); stZeichnen(); if (tab === "folgen") renderView(); markiereAktiveKarte(); renderNav(); } }, statusPill(s.id), an ? el("span", { class: "pop-haken", html: IC.haken }) : null));
    }
  }));
  props.append(propZeile(IC.status, "Status", stKnopf, "pl-status-" + id));

  const werKnopf = el("button", { type: "button", class: "prop-btn", "aria-labelledby": "pl-wer-" + id, "data-prop": "wer" });
  const werZeichnen = () => { const w = H.karten[id].wer || []; werKnopf.replaceChildren(...(w.length ? w.map(werChip) : [el("span", { class: "leer", text: "Leer" })])); };
  werZeichnen();
  werKnopf.addEventListener("click", () => popAuf(werKnopf, p => {
    p.append(el("div", { class: "pop-h", text: "Wer ist dran? (mehrere möglich)" }));
    const zeichne = () => {
      p.querySelectorAll(".pop-item").forEach(n => n.remove());
      for (const w of cfg.wer) {
        const an = (H.karten[id].wer || []).includes(w);
        p.append(el("button", { type: "button", class: "pop-item" + (an ? " an" : ""), role: "menuitemcheckbox", "aria-checked": an ? "true" : "false", onclick: () => {
          const a = H.karten[id].wer || []; setKarte(id, { wer: a.includes(w) ? a.filter(x => x !== w) : [...a, w] }, 300);
          zeichne(); werZeichnen(); if (tab === "folgen" && !PL.drag) renderView(); markiereAktiveKarte();
        } }, werChip(w), an ? el("span", { class: "pop-haken", html: IC.haken }) : null));
      }
    };
    zeichne();
  }));
  props.append(propZeile(IC.person, "Wer ist dran", werKnopf, "pl-wer-" + id));

  const datum = el("input", { type: "date", class: "prop-in", value: k.erscheint || "", "aria-labelledby": "pl-datum-" + id, "data-prop": "erscheint" });
  datum.addEventListener("change", () => { setKarte(id, { erscheint: datum.value || "" }, 200); if (tab === "folgen") renderView(); markiereAktiveKarte(); });
  props.append(propZeile(IC.datum, "Erscheint", datum, "pl-datum-" + id));

  const bibel = el("textarea", { class: "prop-in", rows: "1", placeholder: "Leer", "aria-labelledby": "pl-bibel-" + id, "data-prop": "bibelstelle" });
  bibel.value = k.bibelstelle || "";
  bibel.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(); });
  bibel.addEventListener("input", () => { bibel.value = bibel.value.replace(/\n/g, " "); autoGrow(bibel); setKarte(id, { bibelstelle: bibel.value }); });
  requestAnimationFrame(() => autoGrow(bibel));
  props.append(propZeile(IC.buch, "Bibelstelle", bibel, "pl-bibel-" + id));

  const nr = el("input", { type: "number", inputmode: "numeric", min: "1", class: "prop-in kurz", value: k.nr || "", "aria-labelledby": "pl-nr-" + id, "data-prop": "nr" });
  nr.addEventListener("change", () => {
    const n = Number(nr.value) || 0;
    const doppelt = kartenListe().some(([oid, o]) => oid !== id && Number(o.nr) === n);
    if (doppelt && !confirm(fNr(n) + " gibt es schon. Trotzdem diese Nummer nehmen? Beide Karten teilen sich dann ein Besprechungsheft.")) { nr.value = H.karten[id].nr || ""; return; }
    setKarte(id, { nr: n }, 200); renderPeekOderSeite();
  });
  props.append(propZeile(IC.nr, "Folge Nr.", nr, "pl-nr-" + id));

  const notiz = el("textarea", { class: "prop-in notiz", rows: "1", placeholder: "Leer", "aria-labelledby": "pl-notiz-" + id, "data-prop": "notiz" });
  notiz.value = k.notiz || "";
  notiz.addEventListener("input", () => { autoGrow(notiz); setKarte(id, { notiz: notiz.value }); });
  requestAnimationFrame(() => autoGrow(notiz));
  props.append(propZeile(IC.text, "Notiz", notiz, "pl-notiz-" + id));
  seite.append(props);
  seite._sync = () => { stZeichnen(); werZeichnen(); };

  // Besprechungsheft dieser Folge
  const f = folgeVonKarte(k);
  seite.append(el("div", { class: "seite-trenn" }));
  if (!f) seite.append(el("p", { class: "note", text: "Gib der Folge eine Nummer, dann erscheint hier das Besprechungsheft." }));
  else seite.append(el("h2", { class: "heft-h", text: "Besprechung" }), heftBereiche(f));
  c.append(seite);
  fortschrittZeigen();
}
function renderPeekOderSeite() { if (PL.peek) renderPeek(); else renderView(); renderNav(); }
// Eigenschaften der offenen Seite mit neuen Daten abgleichen (ohne Neuzeichnen, ohne beim Tippen dazwischenzufunken)
function seiteAbgleich() {
  const fokus = document.activeElement;
  document.querySelectorAll(".seite[data-karte]").forEach(s => {
    const k = H.karten[s.dataset.karte]; if (!k) return;
    s.querySelectorAll("[data-prop]").forEach(n => {
      if (n === fokus || n.tagName === "BUTTON") return;
      const w = k[n.dataset.prop] == null ? "" : String(k[n.dataset.prop]);
      if (n.value !== w) { n.value = w; if (n.tagName === "TEXTAREA") autoGrow(n); }
    });
    if (s._sync && !POP) s._sync();
  });
}
// Was bestimmt den Aufbau einer Ansicht? (Zeitstempel weglassen, sonst zeichnet jede eigene Speicherung neu)
const ohneZeit = o => { const r = {}; for (const [id, x] of Object.entries(o || {})) { const { at, von, angelegt, angelegtVon, erledigtAt, ...rest } = x; r[id] = rest; } return r; };
function ansichtSig(h) {
  if (tab === "folgen") return JSON.stringify([ohneZeit(h.karten), Object.entries(h.folgen || {}).map(([i, f]) => i + (f.status || ""))]);
  if (tab === "besser") return JSON.stringify([Object.keys(h.besser || {}).sort(), Object.values(h.besser || {}).map(b => !!b.erledigt + "" + !!b.weg), Object.keys(h.audios || {}).length]);
  if (tab === "offen") return JSON.stringify(Object.keys(h.offen || {}).sort());
  const b = tab === "serie" ? "serie" : folgeVonKarte((h.karten || {})[tab.slice(2)]);
  return JSON.stringify([b, Object.keys(h.folgen || {}).sort(), Object.entries(h.claude || {}).map(([i, c]) => i + c.at), ((h.folgen || {})[b] || {}).status || "", tab.startsWith("k:") ? !!((h.karten || {})[tab.slice(2)] || {}).weg : 0]);
}
function peekSig(h) {
  const k = (h.karten || {})[PL.peek] || {}, b = folgeVonKarte(k);
  return JSON.stringify([!!k.weg, k.nr, ((h.folgen || {})[b] || {}).status || "", Object.entries(h.claude || {}).filter(([i]) => i.startsWith(b + "__")).map(([i, c]) => i + c.at)]);
}

// ---------- Besser machen ----------
function renderBesser(v) {
  const alle = Object.entries(H.besser || {}).filter(([, b]) => !b.weg);
  const offen = alle.filter(([, b]) => !b.erledigt).sort((a, b) => (b[1].angelegt || 0) - (a[1].angelegt || 0));
  const fertig = alle.filter(([, b]) => b.erledigt).sort((a, b) => (b[1].erledigtAt || 0) - (a[1].erledigtAt || 0));
  v.append(el("div", { class: "seitenkopf" },
    el("h1", { class: "seiten-h", text: "Besser machen" }),
    el("p", { class: "note", text: "Was lief nicht gut, und was machen wir beim nächsten Mal anders? So wird jede Folge leichter und schneller. Aufschreiben oder als Sprachnachricht aufnehmen." })));
  v.append(el("div", { class: "ansicht-leiste" },
    el("div", { class: "ansichten", role: "tablist" },
      [["offen", "Noch offen", offen.length], ["fertig", "Umgesetzt", fertig.length]].map(([a, l, n]) => el("button", { type: "button", role: "tab", class: "ansicht", "aria-selected": PL.besserFilter === a ? "true" : "false", text: l + " · " + n, onclick: () => { PL.besserFilter = a; renderView(); } }))),
    el("span", { class: "spacer" }),
    el("button", { type: "button", class: "btn primary neu-btn", html: IC.plus + "<span>Neuer Punkt</span>", onclick: () => {
      const id = "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      H.besser[id] = { angelegt: Date.now(), angelegtVon: ICH.name };
      setBesser(id, { was: "", anders: "", wer: "", folge: "", erledigt: false }, 0);
      PL.besserFilter = "offen"; renderView(); renderNav();
      setTimeout(() => { const n = document.getElementById("b-" + id + "-was"); n && n.focus(); }, 30);
    } })));
  const ziel = { key: "besser/besser", b: "besser", s: "besser", label: "Besser machen" };
  v.append(el("div", { class: "row", style: "margin-top:12px" }, recButton(ziel), el("span", { class: "note", text: "Sprachnachricht: Claude tippt sie ab und macht Punkte daraus" })), audioBox("besser", "besser"));
  const liste = el("div", { class: "besser-liste" });
  const zeigen = PL.besserFilter === "fertig" ? fertig : offen;
  if (!zeigen.length) liste.append(el("div", { class: "empty", text: PL.besserFilter === "fertig" ? "Noch nichts umgesetzt." : "Gerade nichts offen. Neue Erkenntnis? „Neuer Punkt“." }));
  const bereiche = [["", "–"], ["Serie", "Ganze Serie"], ...kartenListe().sort((a, b) => (a[1].nr || 0) - (b[1].nr || 0)).filter(([, k]) => k.nr).map(([, k]) => [fNr(k.nr), fNr(k.nr) + (k.titel ? " " + k.titel : "")])];
  for (const [id, b] of zeigen) {
    const ta = (k, l, ph) => { const t = el("textarea", { id: "b-" + id + "-" + k, rows: "2", placeholder: ph }); t.value = b[k] || ""; t.addEventListener("input", () => { autoGrow(t); setBesser(id, { [k]: t.value }); }); requestAnimationFrame(() => autoGrow(t)); return el("div", { class: "feld" }, el("label", { for: t.id, class: "b-l", text: l }), t); };
    const wer = el("input", { type: "text", id: "b-" + id + "-wer", value: b.wer || "", placeholder: "Wer kümmert sich?" });
    wer.addEventListener("input", () => setBesser(id, { wer: wer.value }));
    const sel = el("select", { id: "b-" + id + "-folge" }, bereiche.map(([w, l]) => el("option", { value: w, text: l }))); sel.value = b.folge || "";
    sel.addEventListener("change", () => setBesser(id, { folge: sel.value }, 0));
    const cb = el("input", { type: "checkbox", id: "b-" + id + "-ok" }); cb.checked = !!b.erledigt;
    cb.addEventListener("change", () => { setBesser(id, { erledigt: cb.checked }, 0); toast(cb.checked ? "Als umgesetzt abgehakt" : "Wieder offen"); setTimeout(() => { renderView(); renderNav(); }, 350); });
    let scharf = false; const del = el("button", { type: "button", class: "link", text: "Entfernen" });
    del.addEventListener("click", () => { if (!scharf) { scharf = true; del.textContent = "Wirklich?"; setTimeout(() => { scharf = false; del.textContent = "Entfernen"; }, 3500); return; } setBesser(id, { weg: true }, 0); renderView(); renderNav(); });
    liste.append(el("article", { class: "besser" + (b.erledigt ? " erledigt" : ""), "data-besser": id },
      el("div", { class: "grid2" }, ta("was", "Was lief nicht gut?", "z. B. Feedback kam erst nach dem Bau"), ta("anders", "Was machen wir nächstes Mal anders?", "z. B. Storyboard zuerst gemeinsam anschauen")),
      el("div", { class: "row b-zeile" },
        el("label", { class: "b-mini" }, el("span", { class: "b-l", text: "Wer kümmert sich" }), wer),
        el("label", { class: "b-mini" }, el("span", { class: "b-l", text: "Gilt für" }), sel),
        el("label", { class: "check", for: cb.id }, cb, "Umgesetzt"),
        el("span", { class: "spacer" }), del),
      el("p", { class: "wer", text: (b.angelegtVon || b.von || "") + (b.angelegt ? " · " + zeit(b.angelegt) : "") + (b.erledigt && b.erledigtVon ? " · umgesetzt von " + b.erledigtVon : "") })));
  }
  v.append(liste);
}
