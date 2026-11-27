/* Teamheft – Folgen-Plan (Kalender + Board) und „Besser machen“.
   Status, Namen und Termine kommen aus der Vorlage im privaten Speicher, nie aus dem Code.
   Ziehen geht mit Maus und Finger (Pointer Events): auf dem Handy kurz gedrückt halten, dann ziehen. */
"use strict";
const PL = { ansicht: null, monat: null, filter: "", drag: null, sheet: null, besserFilter: "offen", boardLeft: 0 };
try { PL.ansicht = localStorage.getItem("th-plan-ansicht") || "kalender"; PL.filter = localStorage.getItem("th-plan-filter") || ""; } catch (e) { PL.ansicht = "kalender"; }

// ---------- Daten ----------
function planCfg() {
  const p = (V && V.plan) || {};
  return {
    status: p.status && p.status.length ? p.status : [{ id: "Offen", farbe: "gray" }, { id: "Fertig", farbe: "green" }],
    wer: p.wer || [], termine: p.termine || [], hinweis: p.hinweis || ""
  };
}
const statusInfo = s => planCfg().status.find(x => x.id === s) || planCfg().status[0];
const karteFarbe = k => "st-" + (statusInfo(k.status).farbe || "gray");
const kartenListe = () => Object.entries(H.karten || {}).filter(([, k]) => !k.weg);
const kPos = k => (typeof k.pos === "number" && k.pos) ? k.pos : (Number(k.nr) || 0) * 1000;
const kName = k => k.nr ? "F" + String(k.nr).padStart(3, "0") : "Neu";
const folgeVonKarte = k => k.nr ? "F" + String(k.nr).padStart(3, "0") : null;
const passtFilter = k => !PL.filter || (k.wer || []).includes(PL.filter);
const fertigStatus = () => { const s = planCfg().status; return s.filter(x => x.fertig).map(x => x.id); };
const aktivKarten = () => kartenListe().filter(([, k]) => !fertigStatus().includes(k.status)).length;
const besserOffen = () => Object.values(H.besser || {}).filter(b => !b.weg && !b.erledigt).length;

const isoTag = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const ausIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const datumKurz = s => ausIso(s).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
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

// ---------- Ziehen (Maus + Finger) ----------
document.addEventListener("touchmove", e => { if (PL.drag) e.preventDefault(); }, { passive: false });
function ziehbar(node, id, onTap) {
  node.addEventListener("contextmenu", e => e.preventDefault());
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
  // Rand: selbst weiterscrollen
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
  // Ziel finden
  const hit = document.elementFromPoint(x, y);
  const zone = hit && hit.closest("[data-drop]");
  if (d.ziel !== zone) { if (d.ziel) d.ziel.classList.remove("drop-ziel"); if (zone) zone.classList.add("drop-ziel"); d.ziel = zone; }
  // im Board: Einfügestelle in der Spalte
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
  const [art, wert] = [d.ziel.dataset.drop.split(":")[0], d.ziel.dataset.drop.slice(d.ziel.dataset.drop.indexOf(":") + 1)];
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
  renderView(); renderTabs();
}

// ---------- Bausteine ----------
function werChips(k) {
  return el("div", { class: "k-wer" }, (k.wer || []).map(w => el("span", { class: "wer-chip" + (w === ICH.name ? " ich" : ""), text: w })));
}
function karteGross(id, k) {
  const n = el("div", { class: "karte " + karteFarbe(k), "data-id": id, role: "button", tabindex: "0", "aria-label": kName(k) + " " + (k.titel || "") + ", Status " + (k.status || "") + ". Zum Öffnen tippen, zum Verschieben gedrückt halten und ziehen." },
    el("div", { class: "k-top" }, el("span", { class: "k-nr", text: kName(k) }), k.erscheint ? el("span", { class: "k-datum", text: datumKurz(k.erscheint) }) : el("span", { class: "k-datum leer", text: "ohne Termin" })),
    el("div", { class: "k-titel", text: k.titel || "Ohne Titel" }),
    el("div", { class: "k-fuss" }, el("span", { class: "k-status", text: k.status || "" }), werChips(k)));
  ziehbar(n, id, () => karteOeffnen(id));
  return n;
}
function karteChip(id, k) {
  const n = el("div", { class: "kchip " + karteFarbe(k), "data-id": id, role: "button", tabindex: "0", title: kName(k) + " " + (k.titel || ""), "aria-label": kName(k) + " " + (k.titel || "") + ", " + (k.status || "") },
    el("b", { text: kName(k) }), el("span", { class: "kchip-t", text: k.titel || "" }));
  ziehbar(n, id, () => karteOeffnen(id));
  return n;
}

// ---------- Plan-Ansicht ----------
function renderPlan(v) {
  const cfg = planCfg();
  const neu = el("button", { type: "button", class: "btn primary", text: "+ Neue Folge", onclick: neueKarte });
  const seg = el("div", { class: "seg", role: "group", "aria-label": "Ansicht" },
    ["kalender", "board"].map(a => el("button", { type: "button", "aria-pressed": PL.ansicht === a ? "true" : "false", text: a === "kalender" ? "Kalender" : "Board", onclick: () => { PL.ansicht = a; try { localStorage.setItem("th-plan-ansicht", a); } catch (e) {} renderView(); } })));
  const filter = el("div", { class: "filter", role: "group", "aria-label": "Wer ist dran" },
    el("span", { class: "filter-l", text: "Wer ist dran" }),
    ["", ...cfg.wer].map(w => el("button", { type: "button", class: "fchip", "aria-pressed": PL.filter === w ? "true" : "false", text: w || "Alle Karten", onclick: () => { PL.filter = w; try { localStorage.setItem("th-plan-filter", w); } catch (e) {} renderView(); } })));
  const head = el("div", { class: "viewhead" },
    el("h2", { text: "Folgen-Plan" }),
    cfg.hinweis ? el("p", { class: "note", text: cfg.hinweis }) : null,
    el("div", { class: "plan-leiste" }, seg, neu),
    filter,
    el("p", { class: "note klein", text: "Karte antippen zum Bearbeiten. Zum Verschieben gedrückt halten und ziehen." }));
  v.append(head);
  if (!kartenListe().length) v.append(el("div", { class: "empty", style: "margin-top:16px", text: "Noch keine Folgen im Plan. Mit „+ Neue Folge“ legt ihr die erste Karte an." }));
  if (PL.ansicht === "board") renderBoard(v); else renderKalender(v);
}
function renderKalender(v) {
  const cfg = planCfg();
  if (!PL.monat) { const d = new Date(); PL.monat = new Date(d.getFullYear(), d.getMonth(), 1); }
  const m = PL.monat, heute = isoTag(new Date());
  const nav = el("div", { class: "monat-nav" },
    el("button", { type: "button", class: "btn rund", "aria-label": "Vorheriger Monat", text: "‹", onclick: () => { PL.monat = new Date(m.getFullYear(), m.getMonth() - 1, 1); renderView(); } }),
    el("h3", { class: "monat", text: m.toLocaleDateString("de-DE", { month: "long", year: "numeric" }) }),
    el("button", { type: "button", class: "btn rund", "aria-label": "Nächster Monat", text: "›", onclick: () => { PL.monat = new Date(m.getFullYear(), m.getMonth() + 1, 1); renderView(); } }),
    el("button", { type: "button", class: "btn", text: "Heute", onclick: () => { PL.monat = null; renderView(); } }));
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
  const imMonat = Object.keys(proTag).some(t => t.slice(0, 7) === isoTag(m).slice(0, 7));
  const naechste = kartenListe().filter(([, k]) => k.erscheint && k.erscheint >= heute && passtFilter(k)).sort((a, b) => a[1].erscheint.localeCompare(b[1].erscheint))[0];
  const sprung = !imMonat && naechste ? el("button", { type: "button", class: "link sprung", text: "Nächste Folge: " + kName(naechste[1]) + " am " + datumLang(naechste[1].erscheint) + " – hinspringen", onclick: () => { const d = ausIso(naechste[1].erscheint); PL.monat = new Date(d.getFullYear(), d.getMonth(), 1); renderView(); } }) : null;
  v.append(el("div", { class: "kal-wrap" }, nav, sprung, grid));
  // Ohne Termin
  const ohne = kartenListe().filter(([, k]) => !k.erscheint && passtFilter(k)).sort((a, b) => (a[1].nr || 0) - (b[1].nr || 0));
  const ablage = el("div", { class: "ablage", "data-drop": "ohne" }, el("h3", { class: "klein-h", text: "Ohne Termin" }));
  const reihe = el("div", { class: "karten-reihe" }); for (const [id, k] of ohne) reihe.append(karteGross(id, k));
  if (!ohne.length) reihe.append(el("p", { class: "note klein", text: "Alle Folgen haben einen Termin. Karte hierher ziehen, um den Termin zu entfernen." }));
  ablage.append(reihe); v.append(ablage);
  // Alle Termine als Liste
  const mitTermin = kartenListe().filter(([, k]) => k.erscheint && passtFilter(k)).sort((a, b) => a[1].erscheint.localeCompare(b[1].erscheint) || (a[1].nr || 0) - (b[1].nr || 0));
  if (mitTermin.length) {
    const liste = el("div", { class: "terminliste" }, el("h3", { class: "klein-h", text: "Alle Termine" }));
    for (const [id, k] of mitTermin) {
      const z = el("button", { type: "button", class: "termin " + karteFarbe(k) + (k.erscheint < heute ? " vorbei" : ""), onclick: () => karteOeffnen(id) },
        el("span", { class: "t-datum", text: datumLang(k.erscheint) }),
        el("span", { class: "t-titel" }, el("b", { text: kName(k) }), " " + (k.titel || "")),
        el("span", { class: "t-status", text: k.status || "" }), werChips(k));
      liste.append(z);
    }
    v.append(liste);
  }
}
function renderBoard(v) {
  const cfg = planCfg();
  const board = el("div", { class: "board", role: "list", "aria-label": "Board nach Status" });
  for (const s of cfg.status) {
    const ks = kartenListe().filter(([, k]) => (k.status || cfg.status[0].id) === s.id && passtFilter(k)).sort((a, b) => kPos(a[1]) - kPos(b[1]));
    const sp = el("section", { class: "spalte st-" + (s.farbe || "gray"), "data-drop": "status:" + s.id, role: "listitem", "aria-label": s.id },
      el("header", { class: "sp-kopf" }, el("span", { class: "sp-punkt" }), el("span", { class: "sp-name", text: s.id }), el("span", { class: "sp-n", text: String(ks.length) })));
    const liste = el("div", { class: "sp-liste" });
    for (const [id, k] of ks) liste.append(karteGross(id, k));
    if (!ks.length) liste.append(el("div", { class: "sp-leer", text: "Hierher ziehen" }));
    sp.append(liste); board.append(sp);
  }
  v.append(board);
  board.scrollLeft = PL.boardLeft || 0;
  board.addEventListener("scroll", () => { if (!PL.drag) PL.boardLeft = board.scrollLeft; }, { passive: true });
}
function neueKarte() {
  const nrs = kartenListe().map(([, k]) => Number(k.nr) || 0).concat(folgenIds().map(f => parseInt(f.slice(1), 10)));
  const nr = (nrs.length ? Math.max(...nrs) : 0) + 1;
  const id = "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  setKarte(id, { nr, titel: "", status: planCfg().status[0].id, wer: [], erscheint: "", bibelstelle: "", notiz: "", pos: nr * 1000 }, 0);
  renderView(); renderTabs(); karteOeffnen(id, true);
}

// ---------- Karte bearbeiten ----------
function karteOeffnen(id, neu) {
  const k = H.karten[id]; if (!k) return;
  sheetZu();
  const cfg = planCfg();
  const hinter = el("div", { class: "sheet-hinter", onclick: e => { if (e.target === hinter) sheetZu(); } });
  const panel = el("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-h" });
  const kopf = el("div", { class: "sheet-kopf" },
    el("h2", { id: "sheet-h", tabindex: "-1", text: kName(k) }),
    el("button", { type: "button", class: "btn", text: "Fertig", onclick: sheetZu }));
  const feld = (label, input) => el("label", { class: "s-feld" }, el("span", { class: "s-l", text: label }), input);
  const nr = el("input", { type: "number", inputmode: "numeric", min: "0", value: k.nr || "", id: "s-nr" });
  nr.addEventListener("input", () => { setKarte(id, { nr: Number(nr.value) || 0 }); panel.querySelector("#sheet-h").textContent = kName(H.karten[id]); folgeKnopf(); });
  const titel = el("input", { type: "text", value: k.titel || "", placeholder: "Titel der Folge", id: "s-titel" });
  titel.addEventListener("input", () => setKarte(id, { titel: titel.value }));
  // Status als Knöpfe
  const st = el("div", { class: "s-chips", role: "radiogroup", "aria-label": "Status" });
  const zeichneStatus = () => { st.replaceChildren(...cfg.status.map(s => el("button", { type: "button", role: "radio", class: "s-chip st-" + (s.farbe || "gray"), "aria-checked": (H.karten[id].status || cfg.status[0].id) === s.id ? "true" : "false", text: s.id, onclick: () => { setKarte(id, { status: s.id }, 200); zeichneStatus(); } }))); };
  zeichneStatus();
  const wer = el("div", { class: "s-chips", role: "group", "aria-label": "Wer ist dran" });
  const zeichneWer = () => { const akt = H.karten[id].wer || []; wer.replaceChildren(...cfg.wer.map(w => el("button", { type: "button", class: "s-chip wer", "aria-pressed": akt.includes(w) ? "true" : "false", text: w, onclick: () => { const a = H.karten[id].wer || []; setKarte(id, { wer: a.includes(w) ? a.filter(x => x !== w) : [...a, w] }, 200); zeichneWer(); } }))); };
  zeichneWer();
  const datum = el("input", { type: "date", value: k.erscheint || "", id: "s-datum" });
  datum.addEventListener("change", () => setKarte(id, { erscheint: datum.value || "" }, 200));
  const ohneDatum = el("button", { type: "button", class: "link", text: "Termin entfernen", onclick: () => { datum.value = ""; setKarte(id, { erscheint: "" }, 200); } });
  const bibel = el("input", { type: "text", value: k.bibelstelle || "", placeholder: "Buch Kapitel, Vers", id: "s-bibel" });
  bibel.addEventListener("input", () => setKarte(id, { bibelstelle: bibel.value }));
  const notiz = el("textarea", { rows: "4", placeholder: "Stand, Absprachen, Links …", id: "s-notiz" }); notiz.value = k.notiz || "";
  notiz.addEventListener("input", () => { autoGrow(notiz); setKarte(id, { notiz: notiz.value }); });
  requestAnimationFrame(() => autoGrow(notiz));
  const fuss = el("div", { class: "sheet-fuss" });
  const folgeKnopf = () => {
    fuss.replaceChildren();
    const f = folgeVonKarte(H.karten[id]);
    if (f && H.folgen[f]) fuss.append(el("button", { type: "button", class: "btn ok", text: "Besprechung " + f + " öffnen", onclick: () => { sheetZu(); go(f); } }));
    else if (f) fuss.append(el("button", { type: "button", class: "btn", text: "Besprechungsseite " + f + " anlegen", onclick: () => {
      H.folgen[f] = { titel: H.karten[id].titel || "", at: Date.now() };
      schreibe("folge:" + f, "folge", { id: f, patch: { titel: H.karten[id].titel || "" } }, 0);
      sheetZu(); go(f);
    } }));
    let scharf = false;
    const weg = el("button", { type: "button", class: "link", text: "Karte entfernen" });
    weg.addEventListener("click", () => { if (!scharf) { scharf = true; weg.textContent = "Wirklich entfernen?"; setTimeout(() => { scharf = false; weg.textContent = "Karte entfernen"; }, 3500); return; } setKarte(id, { weg: true }, 0); sheetZu(); toast("Karte entfernt"); });
    fuss.append(el("span", { class: "spacer" }), weg);
  };
  folgeKnopf();
  const kk = H.karten[id];
  panel.append(kopf,
    el("div", { class: "s-zwei" }, feld("Nr.", nr), feld("Titel", titel)),
    el("div", { class: "s-feld" }, el("span", { class: "s-l", text: "Status" }), st),
    el("div", { class: "s-feld" }, el("span", { class: "s-l", text: "Wer ist dran" }), wer),
    el("div", { class: "s-feld" }, el("label", { class: "s-l", for: "s-datum", text: "Erscheint" }), el("div", { class: "row" }, datum, ohneDatum)),
    feld("Bibelstelle", bibel), feld("Notiz", notiz),
    el("p", { class: "wer", text: kk.von ? "zuletzt " + kk.von + ", " + zeit(kk.at) : "" }),
    fuss);
  hinter.append(panel); document.body.append(hinter); document.body.classList.add("sheet-offen");
  const esc = e => { if (e.key === "Escape") sheetZu(); };
  document.addEventListener("keydown", esc);
  PL.sheet = { id, hinter, esc, vorher: document.activeElement, felder: { titel, bibel, notiz, nr, datum }, zeichneStatus, zeichneWer };
  if (neu) titel.focus(); else panel.querySelector("#sheet-h").focus();
}
function sheetZu() {
  const s = PL.sheet; if (!s) return;
  PL.sheet = null; s.hinter.remove(); document.body.classList.remove("sheet-offen");
  document.removeEventListener("keydown", s.esc);
  if (tab === "plan") renderView();
  renderTabs();
  if (s.vorher && document.contains(s.vorher)) try { s.vorher.focus({ preventScroll: true }); } catch (e) {}
}
function sheetAbgleich() {
  const s = PL.sheet; if (!s) return;
  const k = H.karten[s.id]; if (!k || k.weg) return sheetZu();
  const f = s.felder, fokus = document.activeElement;
  const setz = (n, w) => { if (n !== fokus && n.value !== String(w == null ? "" : w)) n.value = w == null ? "" : w; };
  setz(f.titel, k.titel); setz(f.bibel, k.bibelstelle); setz(f.notiz, k.notiz); setz(f.nr, k.nr || ""); setz(f.datum, k.erscheint);
  s.zeichneStatus(); s.zeichneWer();
}

// ---------- Besser machen ----------
function renderBesser(v) {
  const alle = Object.entries(H.besser || {}).filter(([, b]) => !b.weg);
  const offen = alle.filter(([, b]) => !b.erledigt).sort((a, b) => (b[1].angelegt || 0) - (a[1].angelegt || 0));
  const fertig = alle.filter(([, b]) => b.erledigt).sort((a, b) => (b[1].erledigtAt || 0) - (a[1].erledigtAt || 0));
  v.append(el("div", { class: "viewhead" },
    el("h2", { text: "Besser machen" }),
    el("p", { class: "note", text: "Was lief nicht gut, und was machen wir beim nächsten Mal anders? So wird jede Folge leichter und schneller. Einfach aufschreiben oder als Sprachnachricht aufnehmen." }),
    el("div", { class: "plan-leiste" },
      el("div", { class: "seg", role: "group", "aria-label": "Anzeigen" },
        [["offen", "Noch offen", offen.length], ["fertig", "Umgesetzt", fertig.length]].map(([a, l, n]) => el("button", { type: "button", "aria-pressed": PL.besserFilter === a ? "true" : "false", text: l + " · " + n, onclick: () => { PL.besserFilter = a; renderView(); } }))),
      el("button", { type: "button", class: "btn primary", text: "+ Neuer Punkt", onclick: () => {
        const id = "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        H.besser[id] = { angelegt: Date.now(), angelegtVon: ICH.name };
        setBesser(id, { was: "", anders: "", wer: "", folge: "", erledigt: false }, 0);
        PL.besserFilter = "offen"; renderView(); renderTabs();
        setTimeout(() => { const n = document.getElementById("b-" + id + "-was"); n && n.focus(); }, 30);
      } }))));
  const ziel = { key: "besser/besser", b: "besser", s: "besser", label: "Besser machen" };
  v.append(el("div", { class: "row", style: "margin-top:12px" }, recButton(ziel), el("span", { class: "note", text: "Sprachnachricht: Claude tippt sie ab und macht Punkte daraus" })), audioBox("besser", "besser"));
  const liste = el("div", { class: "besser-liste" });
  const zeigen = PL.besserFilter === "fertig" ? fertig : offen;
  if (!zeigen.length) liste.append(el("div", { class: "empty", text: PL.besserFilter === "fertig" ? "Noch nichts umgesetzt." : "Gerade nichts offen. Neue Erkenntnis? „+ Neuer Punkt“." }));
  const bereiche = [["", "–"], ["Serie", "Ganze Serie"], ...folgenIds().map(f => [f, f])];
  for (const [id, b] of zeigen) {
    const ta = (k, l, ph) => { const t = el("textarea", { id: "b-" + id + "-" + k, rows: "2", placeholder: ph }); t.value = b[k] || ""; t.addEventListener("input", () => { autoGrow(t); setBesser(id, { [k]: t.value }); }); requestAnimationFrame(() => autoGrow(t)); return el("div", { class: "feld" }, el("label", { for: t.id, class: "b-l", text: l }), t); };
    const wer = el("input", { type: "text", id: "b-" + id + "-wer", value: b.wer || "", placeholder: "Wer kümmert sich?" });
    wer.addEventListener("input", () => setBesser(id, { wer: wer.value }));
    const sel = el("select", { id: "b-" + id + "-folge" }, bereiche.map(([w, l]) => el("option", { value: w, text: l }))); sel.value = b.folge || "";
    sel.addEventListener("change", () => setBesser(id, { folge: sel.value }, 0));
    const cb = el("input", { type: "checkbox", id: "b-" + id + "-ok" }); cb.checked = !!b.erledigt;
    cb.addEventListener("change", () => { setBesser(id, { erledigt: cb.checked }, 0); toast(cb.checked ? "Als umgesetzt abgehakt" : "Wieder offen"); setTimeout(() => { renderView(); renderTabs(); }, 350); });
    let scharf = false; const del = el("button", { type: "button", class: "link", text: "Entfernen" });
    del.addEventListener("click", () => { if (!scharf) { scharf = true; del.textContent = "Wirklich?"; setTimeout(() => { scharf = false; del.textContent = "Entfernen"; }, 3500); return; } setBesser(id, { weg: true }, 0); renderView(); renderTabs(); });
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

// ---------- Abgleich mit neuen Daten der anderen ----------
// Gibt true zurück, wenn die Plan-/Besser-Ansicht den Abgleich selbst erledigt hat.
function planNeu(alt, inView) {
  if (!H.karten) H.karten = {}; if (!H.besser) H.besser = {};
  if (PL.sheet) sheetAbgleich();
  if (tab !== "plan" && tab !== "besser") return false;
  const sig = h => JSON.stringify([h.karten || {}, tab === "besser" ? h.besser || {} : 0, Object.keys(h.folgen || {}).sort(), tab === "besser" ? Object.keys(h.audios || {}).length : 0]);
  if (sig(alt) !== sig(H) && !PL.drag && !inView) { renderTabs(); renderView(); }
  else if (tab === "besser") zeichneAudios();
  return true;
}
