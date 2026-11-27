/* Teamheft – App. Alle Inhalte kommen erst nach dem Zugang aus dem privaten Speicher.
   Hier im Code stehen keine Projektdaten, keine Namen, keine Schlüssel. */
"use strict";
const VERSION = 4;
const API = location.hostname === "localhost" ? "/api" : "https://script.google.com/macros/s/AKfycbzlsHkQ-WSGGli8pxzdu6SlnUSezGxXtf-ouaZDF3Ktzcj5AyUXuy8Jx-qXzkEnY5qT/exec";

const MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) { if (c == null) continue; n.append(c.nodeType ? c : document.createTextNode(c)); }
  return n;
};
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};
function toast(t, ms = 2600) { const n = $("#toast"); n.textContent = t; n.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => n.hidden = true, ms); }
function zeit(ts) { const d = new Date(ts); return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); }
function dauer(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

// ---------- Zugang ----------
let KEY = null;
(function () {
  const m = location.hash.match(/k=([A-Za-z0-9_\-]{16,})/);
  if (m) { KEY = m[1]; ls.set("th-k", KEY); history.replaceState(null, "", location.pathname + location.search); }
  else KEY = ls.get("th-k");
})();
// Neuer Link geöffnet, während die Seite schon offen ist: übernehmen und neu laden
window.addEventListener("hashchange", () => {
  const m = location.hash.match(/k=([A-Za-z0-9_\-]{16,})/);
  if (m && m[1] !== KEY) { ls.set("th-k", m[1]); location.replace(location.pathname + location.search); }
});

async function call(op, data = {}) {
  const r = await fetch(API, { method: "POST", body: JSON.stringify({ k: KEY, op, ...data }) });
  const j = await r.json();
  if (!j.ok) { const e = new Error(j.fehler || "fehler"); e.code = j.fehler; throw e; }
  return j;
}

// ---------- Zustand ----------
let V = null;          // Vorlage
let H = null;          // Heft
let ICH = null;
let REV = 0;
let tab = "folgen";   // die App startet immer im Board
const pending = new Map(); // key -> {timer, data, busy, again, fn}

const fid = (b, s, f) => `${b}__${s}__${f}`;
const txt = (b, s, f) => (H.felder[fid(b, s, f)] || {}).text || "";
const meta = (b, s) => H.meta[`${b}__${s}`] || {};
const folgenIds = () => Object.keys(H.folgen).filter(id => /^F\d+$/.test(id)).sort();
const sektionenFuer = b => b === "serie" ? V.serie : (V.folgen[b] || V.folgeStandard);
const fortschritt = b => { const s = sektionenFuer(b); return [s.filter(x => meta(b, x.id).erledigt).length, s.length]; };

// Schreiben: pro Schlüssel eins nach dem anderen, kurz gebündelt
// Ausgangskorb: jede Änderung liegt erst auf dem Gerät und wird so lange gesendet, bis Google sie bestätigt.
const KORB = "th-korb";
function korbLesen() { try { return JSON.parse(ls.get(KORB) || "{}"); } catch (e) { return {}; } }
function korbSchreiben(k) { ls.set(KORB, JSON.stringify(k)); }
function schreibe(key, op, data, delay = 900) {
  const korb = korbLesen(); korb[key] = { op, data, at: Date.now() }; korbSchreiben(korb);
  let p = pending.get(key);
  if (!p) { p = { timer: null, busy: false, again: false, versuch: 0 }; pending.set(key, p); }
  p.job = { op, data };
  clearTimeout(p.timer);
  p.timer = setTimeout(() => flush(key), delay);
  status("Speichert …", false);
}
async function flush(key) {
  const p = pending.get(key); if (!p || !p.job) return;
  if (p.busy) { p.again = true; return; }
  p.busy = true; const job = p.job; p.job = null;
  let ok = false;
  try { await call(job.op, job.data); ok = true; }
  catch (e) { if (e && /kein_zugang|login_noetig|sitzung_abgelaufen/.test(e.code)) { p.busy = false; return fehler(e); } }
  p.busy = false;
  if (!ok) {
    if (!p.job) p.job = job;                // nichts verlieren: gleiche Änderung nochmal
    p.versuch = Math.min((p.versuch || 0) + 1, 6);
    clearTimeout(p.timer); p.timer = setTimeout(() => flush(key), 2000 * p.versuch);
    zeigeStand(); return;
  }
  p.versuch = 0;
  if (p.job || p.again) { p.again = false; if (p.job) return flush(key); }
  pending.delete(key);
  const korb = korbLesen(); if (korb[key] && korb[key].at <= Date.now()) { delete korb[key]; korbSchreiben(korb); }
  zeigeStand();
}
function korbNachholen() {
  const korb = korbLesen();
  for (const [key, j] of Object.entries(korb)) if (!pending.has(key)) schreibe(key, j.op, j.data, 50);
}
function zeigeStand() {
  const offen = pending.size, audio = wartend.length;
  if (!offen && !audio) return status("Alles gespeichert", true);
  const teile = [];
  if (offen) teile.push(offen === 1 ? "1 Änderung" : offen + " Änderungen");
  if (audio) teile.push(audio === 1 ? "1 Sprachnachricht" : audio + " Sprachnachrichten");
  status(teile.join(" und ") + " noch nicht bei Google. Liegt sicher auf diesem Gerät und wird automatisch gesendet.", false);
}
function fehler(e) {
  if (e && e.code === "kein_zugang") return zeigeTor("Dein Link gilt nicht mehr", "Bitte frag nach einem neuen Link.");
  if (e && (e.code === "login_noetig" || e.code === "sitzung_abgelaufen")) return zeigeTor("Bitte neu anmelden", "Öffne deinen persönlichen Link nochmal.");
  zeigeStand();
}
function status(t, ok) { $("#statustext").textContent = t; $("#dot").classList.toggle("live", !!ok); const d2 = $("#dot2"); if (d2) { d2.classList.toggle("live", !!ok); d2.title = t; } }

// ---------- Geräte-Speicher (IndexedDB) für Aufnahmen ----------
const idb = (() => {
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open("teamheft", 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("aufnahmen", { keyPath: "id" }); r.result.createObjectStore("stuecke", { autoIncrement: true }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const tx = (store, mode, fn) => open().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode); const st = t.objectStore(store); const out = fn(st);
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error);
  }));
  return {
    put: (store, v) => tx(store, "readwrite", st => st.put(v)).catch(() => {}),
    add: (store, v) => tx(store, "readwrite", st => st.add(v)).catch(() => {}),
    del: (store, k) => tx(store, "readwrite", st => st.delete(k)).catch(() => {}),
    clear: store => tx(store, "readwrite", st => st.clear()).catch(() => {}),
    all: store => tx(store, "readonly", st => st.getAll()).catch(() => [])
  };
})();

// ---------- Aufnahme ----------
let rec = null, wach = null;
async function aufnehmen(ziel) {
  if (rec) { rec.mr.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) return toast("Aufnehmen geht in diesem Browser nicht. Bitte Safari oder Chrome nehmen.");
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { return toast("Kein Zugriff aufs Mikro. Bitte in den Einstellungen erlauben.", 5000); }
  const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(m => MediaRecorder.isTypeSupported(m)) || "";
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  const chunks = [];
  await idb.clear("stuecke");
  idb.put("aufnahmen", { id: "laufend", ziel, t0: Date.now(), mime: mr.mimeType || mime, laufend: true });
  rec = { mr, t0: Date.now(), ziel, timer: null };
  try { wach = await navigator.wakeLock.request("screen"); } catch (e) { wach = null; }
  mr.ondataavailable = e => { if (e.data && e.data.size) { chunks.push(e.data); idb.add("stuecke", e.data); } };
  mr.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    const sek = (Date.now() - rec.t0) / 1000;
    clearInterval(rec.timer); rec = null; $("#recbar").hidden = true; markiereRec();
    try { if (wach) await wach.release(); } catch (e) {} wach = null;
    const blob = new Blob(chunks, { type: (mr.mimeType || mime || "audio/webm").split(";")[0] });
    await idb.del("aufnahmen", "laufend"); await idb.clear("stuecke");
    if (sek < 1 || !blob.size) return toast("Zu kurz, nichts gespeichert.");
    if (sek >= 15 * 60) toast("15 Minuten erreicht: gespeichert. Für mehr einfach neu aufnehmen.", 6000);
    neueAufnahme(blob, sek, ziel);
  };
  mr.start(1000);
  $("#recziel").textContent = ziel.label;
  $("#recbar").hidden = false;
  rec.timer = setInterval(() => {
    const s = (Date.now() - rec.t0) / 1000;
    $("#reczeit").textContent = dauer(s);
    if (s > 15 * 60) rec.mr.stop();
  }, 250);
  markiereRec();
}
function markiereRec() {
  document.querySelectorAll(".rec-btn").forEach(b => {
    const an = rec && b._ziel && b._ziel.key === rec.ziel.key;
    b.classList.toggle("on", !!an);
    b.querySelector("span").textContent = an ? "Stopp" : "Aufnehmen";
  });
}
const wartend = []; // Aufnahmen, die noch nicht bei Google sind {id, blob, sek, ziel, fehler, laeuft}
function blobToB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); }); }
async function neueAufnahme(blob, sek, ziel) {
  const item = { id: "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), blob, sek, ziel, at: Date.now() };
  await idb.put("aufnahmen", { id: item.id, blob, sek, ziel, at: item.at });   // zuerst sicher aufs Gerät
  wartend.push(item);
  hochladen(item);
}
async function hochladen(item) {
  if (item.laeuft) return;
  item.laeuft = true; item.fehler = false; zeichneAudios(); zeigeStand();
  try {
    const b64 = await blobToB64(item.blob);
    const r = await call("audio", { bereich: item.ziel.b, sek: item.ziel.s, feld: item.ziel.f || "", mime: item.blob.type, dauer: Math.round(item.sek), cid: item.id, b64 });
    wartend.splice(wartend.indexOf(item), 1);
    await idb.del("aufnahmen", item.id);
    H.audios[r.erg] = { bereich: item.ziel.b, sek: item.ziel.s, feld: item.ziel.f || "", von: ICH.name, at: item.at, mime: item.blob.type, dauer: Math.round(item.sek), cid: item.id };
    blobCache.set(r.erg, URL.createObjectURL(item.blob));
    toast("Sprachnachricht gespeichert");
  } catch (e) {
    item.fehler = true;
    toast("Sprachnachricht liegt sicher auf dem Gerät und wird automatisch nochmal gesendet.", 5000);
  }
  item.laeuft = false;
  zeichneAudios(); refreshPills(); zeigeStand();
}
async function aufnahmenNachholen() {
  // Abgebrochene Aufnahme (App geschlossen, Akku leer) aus den gesicherten Stücken wiederherstellen
  const alle = await idb.all("aufnahmen");
  const laufend = alle.find(a => a.id === "laufend");
  if (laufend && !rec) {
    const st = await idb.all("stuecke");
    if (st.length) {
      const blob = new Blob(st, { type: (laufend.mime || "audio/webm").split(";")[0] });
      const sek = Math.max(1, st.length);
      await idb.del("aufnahmen", "laufend"); await idb.clear("stuecke");
      await neueAufnahme(blob, sek, laufend.ziel);
      toast("Eine abgebrochene Aufnahme wurde gerettet und wird gespeichert.", 6000);
    } else await idb.del("aufnahmen", "laufend");
  }
  for (const a of alle) {
    if (a.id === "laufend" || wartend.some(w => w.id === a.id)) continue;
    const item = { id: a.id, blob: a.blob, sek: a.sek, ziel: a.ziel, at: a.at };
    wartend.push(item); hochladen(item);
  }
}
setInterval(() => { for (const w of wartend) if (w.fehler && !w.laeuft) hochladen(w); }, 30000);
const blobCache = new Map();
async function datei(id) {
  if (blobCache.has(id)) return blobCache.get(id);
  const r = await call("datei", { id });
  const bin = atob(r.b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([u], { type: r.mime }));
  blobCache.set(id, url); return url;
}
let spieler = null;
async function abspielen(id, btn) {
  if (spieler && spieler._id === id && !spieler.paused) { spieler.pause(); btn.textContent = "▶ Anhören"; return; }
  if (spieler) spieler.pause();
  btn.textContent = "Lädt …";
  try {
    const url = await datei(id);
    spieler = new Audio(url); spieler._id = id;
    spieler.onended = () => { btn.textContent = "▶ Anhören"; };
    await spieler.play(); btn.textContent = "❚❚ Pause";
  } catch (e) { btn.textContent = "▶ Anhören"; toast("Abspielen ging nicht."); }
}

// ---------- Bausteine ----------
function recButton(ziel) {
  const b = el("button", { class: "rec-btn", type: "button", html: MIC + "<span>Aufnehmen</span>", "aria-label": "Sprachnachricht aufnehmen: " + ziel.label });
  b._ziel = ziel; b.addEventListener("click", () => aufnehmen(ziel));
  return b;
}
function audiosFuer(b, s) {
  return Object.entries(H.audios).filter(([, a]) => a.bereich === b && a.sek === s && !a.weg).sort((x, y) => x[1].at - y[1].at);
}
function audioBox(b, s) {
  const box = el("div", { class: "audios", "data-audios": b + "/" + s });
  box._fill = () => {
    box.replaceChildren();
    for (const [id, a] of audiosFuer(b, s)) {
      const play = el("button", { class: "play", type: "button", text: "▶ Anhören" });
      play.addEventListener("click", () => abspielen(id, play));
      const zeile = el("div", { class: "zeile" }, play, el("span", { class: "info", text: a.von + " · " + zeit(a.at) + " · " + dauer(a.dauer) }));
      if (a.von === ICH.name || ICH.rolle === "admin") {
        let scharf = false;
        const weg = el("button", { class: "link", type: "button", text: "Entfernen" });
        weg.addEventListener("click", async () => {
          if (!scharf) { scharf = true; weg.textContent = "Wirklich entfernen?"; setTimeout(() => { scharf = false; weg.textContent = "Entfernen"; }, 3500); return; }
          try { await call("weg", { id }); a.weg = true; box._fill(); refreshPills(); } catch (e) { fehler(e); }
        });
        zeile.append(weg);
      }
      const item = el("div", { class: "audio" }, zeile);
      if (a.transkript) item.append(el("div", { class: "tr", text: "Abgetippt: " + a.transkript }));
      box.append(item);
    }
    for (const w of wartend.filter(w => w.ziel.b === b && w.ziel.s === s)) {
      const z = el("div", { class: "zeile" }, el("span", { class: "info", text: (w.fehler ? "Noch nicht bei Google, liegt sicher auf dem Gerät · " : "Wird gespeichert … · ") + dauer(w.sek) }));
      if (w.fehler) {
        z.append(el("button", { class: "btn", type: "button", text: "Jetzt nochmal senden", onclick: () => hochladen(w) }));
        const a = el("a", { class: "link", text: "Aufs Gerät laden", download: "Sprachnachricht " + zeit(w.at || Date.now()).replace(/[:.]/g, "-") + (w.blob.type.includes("mp4") ? ".m4a" : ".webm") });
        a.href = URL.createObjectURL(w.blob); z.append(a);
      }
      box.append(el("div", { class: "audio wartet" }, z));
    }
  };
  box._fill();
  return box;
}
function zeichneAudios() { document.querySelectorAll("[data-audios]").forEach(b => b._fill()); }

function autoGrow(ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight + 2, 520) + "px"; }
function werText(f) { return f && f.von ? "zuletzt " + f.von + ", " + zeit(f.at) : ""; }
function feldBox(b, s, f) {
  const key = fid(b, s, f.id);
  const ta = el("textarea", { id: "t-" + key, "data-key": key, placeholder: f.ph || "Hier eintragen …", rows: "3" });
  ta.value = txt(b, s, f.id);
  const wer = el("div", { class: "wer", text: werText(H.felder[key]) });
  ta.addEventListener("input", () => {
    autoGrow(ta);
    H.felder[key] = { text: ta.value, at: Date.now(), von: ICH.name };
    const text = ta.value;
    schreibe("feld:" + key, "feld", { id: key, text });
    refreshPills();
  });
  requestAnimationFrame(() => autoGrow(ta));
  const box = el("div", { class: "feld" }, el("div", { class: "feld-head" }, el("label", { for: "t-" + key, text: f.label })));
  if (f.stand) box.append(el("div", { class: "feld-stand", text: "Stand jetzt: " + f.stand }));
  if (f.proben) { const pr = el("div", { class: "proben" }); for (const p of f.proben) if (/^https:\/\//.test(p.url)) pr.append(el("a", { href: p.url, target: "_blank", rel: "noopener", text: "▶ " + p.name })); box.append(pr); }
  box.append(ta, wer);
  return box;
}
function hatInhalt(b, sek) {
  if (audiosFuer(b, sek.id).length) return true;
  if (sek.typ === "szenen") return Object.values(H.szenen).some(z => z.folge === b && !z.weg && (z.gefuehl || z.kamera || z.aendern));
  if (sek.typ === "freigabe") { const m = meta(b, sek.id); return !!(m.skript || m.storyboard); }
  return (sek.felder || []).some(f => txt(b, sek.id, f.id).trim());
}
function pillFor(b, sek) {
  if (meta(b, sek.id).erledigt) return el("span", { class: "pill done", text: "Besprochen" });
  if (hatInhalt(b, sek)) return el("span", { class: "pill filled", text: "Angefangen" });
  return el("span", { class: "pill", text: "Offen" });
}
function setMeta(b, s, patch) {
  const id = `${b}__${s}`;
  H.meta[id] = { ...(H.meta[id] || {}), ...patch };
  schreibe("meta:" + id, "meta", { id, patch: { ...H.meta[id] } }, 200);
}
function bilderBox(b, s) {
  const wrap = el("div", { class: "bilder", "data-bilder": b + "/" + s });
  wrap._fill = () => {
    wrap.replaceChildren();
    for (const [id, bi] of Object.entries(H.bilder).filter(([, x]) => x.bereich === b && x.sek === s && !x.weg)) {
      const ph = el("div", { class: "ph" });
      const card = el("div", { class: "bild" }, ph, el("span", { text: bi.von + " · " + (bi.name || "") }));
      datei(id).then(url => { const img = el("img", { src: url, alt: bi.name || "Bild" }); const a = el("a", { href: url, target: "_blank", rel: "noopener" }, img); ph.replaceWith(a); }).catch(() => {});
      if (bi.von === ICH.name || ICH.rolle === "admin") {
        let scharf = false;
        const weg = el("button", { class: "link", type: "button", text: "Entfernen" });
        weg.addEventListener("click", async () => {
          if (!scharf) { scharf = true; weg.textContent = "Wirklich?"; setTimeout(() => { scharf = false; weg.textContent = "Entfernen"; }, 3500); return; }
          try { await call("weg", { id }); bi.weg = true; wrap._fill(); } catch (e) { fehler(e); }
        });
        card.append(weg);
      }
      wrap.append(card);
    }
  };
  return wrap;
}
async function bildHoch(file, b, s, wrap) {
  toast("Foto wird hochgeladen …", 8000);
  try {
    const blob = await verkleinern(file);
    const b64 = await blobToB64(blob);
    const r = await call("bild", { bereich: b, sek: s, name: file.name || "Foto", mime: blob.type, b64 });
    H.bilder[r.erg] = { bereich: b, sek: s, von: ICH.name, at: Date.now(), name: file.name || "Foto", mime: blob.type };
    blobCache.set(r.erg, URL.createObjectURL(blob));
    wrap._fill(); toast("Foto hängt im Bereich");
  } catch (e) { toast("Foto ging nicht hoch. Bitte nochmal versuchen."); }
}
function verkleinern(file) {
  return new Promise(res => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 2000, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(bl => { URL.revokeObjectURL(url); res(bl || file); }, "image/jpeg", 0.86);
    };
    img.onerror = () => res(file);
    img.src = url;
  });
}
function claudeBox(b, s) {
  const c = H.claude[`${b}__${s}`];
  if (!c || !(c.verstanden || c.fragen)) return null;
  const box = el("div", { class: "claude" });
  if (c.verstanden) box.append(el("b", { text: "So hat Claude euch verstanden" }), el("span", { text: c.verstanden }));
  if (c.fragen) box.append(el("b", { text: "Rückfragen von Claude" }), el("span", { text: c.fragen }));
  return box;
}

function sektion(b, sek, i) {
  const d = el("details", { class: "sek" });
  const okey = "th-open-" + b + "/" + sek.id;
  if (ls.get(okey) === "1") d.open = true;
  d.addEventListener("toggle", () => { ls.set(okey, d.open ? "1" : "0"); if (d.open && d._bilder) d._bilder._fill(); });
  const pill = pillFor(b, sek);
  d.append(el("summary", {}, el("span", { class: "sum-nr", text: String(i + 1) }), el("span", { class: "sum-title", text: sek.titel }), pill));
  const body = el("div", { class: "sek-body" });
  if (sek.stand) body.append(el("div", { class: "stand" }, el("b", { text: "Stand jetzt" }), el("span", { text: sek.stand })));
  if (sek.fragen && sek.fragen.length) body.append(el("ul", { class: "fragen" }, sek.fragen.map(q => el("li", { text: q }))));
  const cb0 = claudeBox(b, sek.id); if (cb0) body.append(cb0);
  if (sek.typ === "szenen") body.append(szenenBox(b));
  else if (sek.typ === "freigabe") body.append(freigabeBox(b));
  else for (const f of sek.felder) body.append(feldBox(b, sek.id, f));
  // Sprachnachrichten
  const ziel = { key: b + "/" + sek.id, b, s: sek.id, label: sek.titel };
  body.append(el("div", { class: "row" }, recButton(ziel), el("span", { class: "note", text: "Sprachnachricht zu diesem Bereich" })), audioBox(b, sek.id));
  // Fotos und Haken
  const bb = bilderBox(b, sek.id); d._bilder = bb; if (d.open) bb._fill();
  const row = el("div", { class: "row" });
  const cid = "c-" + b + "-" + sek.id;
  const cb = el("input", { type: "checkbox", id: cid }); cb.checked = !!meta(b, sek.id).erledigt;
  cb.addEventListener("change", () => { setMeta(b, sek.id, { erledigt: cb.checked }); refreshPills(); fortschrittZeigen(); });
  row.append(el("label", { class: "check", for: cid }, cb, "Besprochen"));
  const fi = el("input", { type: "file", accept: "image/*", class: "sr", id: "f-" + b + "-" + sek.id });
  fi.addEventListener("change", () => { const file = fi.files && fi.files[0]; if (file) bildHoch(file, b, sek.id, bb); fi.value = ""; });
  row.append(fi, el("label", { class: "btn", for: fi.id, text: "Foto anhängen", tabindex: "0", onkeydown: e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); } } }));
  body.append(bb, row);
  d.append(body);
  d._pill = pill; d._b = b; d._sek = sek;
  return d;
}
function refreshPills() {
  document.querySelectorAll("details.sek").forEach(d => { const p = pillFor(d._b, d._sek); d._pill.replaceWith(p); d._pill = p; });
}

// Szenen
const szenenListe = b => Object.entries(H.szenen).filter(([, z]) => z.folge === b && !z.weg).sort((a, c) => (a[1].nr || 0) - (c[1].nr || 0));
function setSzene(id, patch, delay) {
  H.szenen[id] = { ...(H.szenen[id] || {}), ...patch, at: Date.now() };
  const p = { ...H.szenen[id] }; delete p.at; delete p.von;
  schreibe("szene:" + id, "szene", { id, patch: p }, delay);
}
function szenenBox(b) {
  const box = el("div", { class: "szenen", "data-szenen": b });
  box._fill = () => {
    box.replaceChildren(); const list = szenenListe(b);
    if (!list.length) box.append(el("div", { class: "empty", text: "Noch keine Teile. Mit „Teil hinzufügen“ legt ihr den ersten an." }));
    for (const [id, z] of list) {
      const inp = (k, ph, label) => { const i = el("input", { type: "text", value: z[k] || "", placeholder: ph, "aria-label": label, id: "z-" + id + "-" + k }); i.addEventListener("input", () => setSzene(id, { [k]: i.value })); return i; };
      const fields = [["gefuehl", "Gefühl und wichtigstes Bild"], ["kamera", "Kamera und Tempo"], ["aendern", "Ändern"]].map(([k, l]) => {
        const ta = el("textarea", { id: "z-" + id + "-" + k, rows: "2", placeholder: l + " …" }); ta.value = z[k] || "";
        ta.addEventListener("input", () => { autoGrow(ta); setSzene(id, { [k]: ta.value }); });
        requestAnimationFrame(() => autoGrow(ta));
        return el("div", { class: "feld" }, el("label", { for: ta.id, class: "wer", text: l }), ta);
      });
      box.append(el("div", { class: "szene" },
        el("div", { class: "szene-head" }, el("span", { class: "nr", text: String(z.nr) }), inp("titel", "Titel", "Titel des Teils"), el("span", { class: "len" }, inp("laenge", "Länge", "Länge"))),
        el("div", { class: "was" }, inp("was", "Was passiert", "Was passiert")),
        el("div", { class: "grid3" }, fields)));
    }
    box.append(el("button", { type: "button", class: "btn", text: "Teil hinzufügen", onclick: () => {
      const nr = Math.max(0, ...szenenListe(b).map(([, z]) => z.nr || 0)) + 1;
      const id = b + "-s" + String(nr).padStart(2, "0") + "-" + Math.random().toString(36).slice(2, 6);
      setSzene(id, { folge: b, nr, titel: "Neuer Teil", was: "", laenge: "" }, 0); box._fill();
    } }));
    box._ids = list.map(([id]) => id).join(",");
  };
  box._fill(); return box;
}
function freigabeBox(b) {
  const m = meta(b, "freigabe"); const wrap = el("div", { class: "feld" });
  for (const [k, l] of [["skript", "Alles geklärt: Claude darf Storyboard und Shot-Blätter schreiben"], ["storyboard", "Storyboard angeschaut und freigegeben: Claude darf bauen (erst nach ausdrücklicher Freigabe)"]]) {
    const cb = el("input", { type: "checkbox", id: "fg-" + b + "-" + k }); cb.checked = !!m[k];
    cb.addEventListener("change", () => { setMeta(b, "freigabe", { [k]: cb.checked }); refreshPills(); });
    wrap.append(el("label", { class: "check", for: cb.id }, cb, l));
  }
  return wrap;
}

// ---------- Ansichten ----------
// tab: "folgen" (Board/Kalender, Start), "serie", "offen", "besser" oder "k:<Karten-ID>" (Folge als ganze Seite).
// Am breiten Bildschirm öffnet eine Karte rechts als Seitenfenster (PL.peek).
let SEITE = null; // Bereich (serie/F001 …), dessen Besprechungsheft gerade zu sehen ist
function renderTabs() { renderNav(); }
function go(id, ohneVerlauf) {
  if (PL.peek) peekZu(true);
  tab = id; if (!ohneVerlauf) try { history.pushState({ tab: id }, ""); } catch (e) {}
  renderNav(); renderView(); window.scrollTo({ top: 0 });
}
window.addEventListener("popstate", e => {
  const st = e.state || {};
  if (PL.peek && !st.peek) { peekZu(true); return; }
  if (st.tab && st.tab !== tab) { tab = st.tab; renderNav(); renderView(); }
  if (st.peek && st.peek !== PL.peek) oeffneFolge(st.peek, true);
});
function neuZeichnen() { renderNav(); renderView(); if (PL.peek) renderPeek(); }
function fortschrittZeigen() {
  const p = $("#progress"); if (!p || !SEITE) return;
  const [a, c] = fortschritt(SEITE); p.textContent = a + " von " + c + " Bereichen besprochen";
  $("#threadbar").style.width = (c ? a / c * 100 : 0) + "%";
  renderNav();
}
function freigabeLeiste(b) {
  const f = H.folgen[b] || {}; const fertig = f.status === "fertig";
  const box = el("div", { class: "freigabe" + (fertig ? " fertig" : "") });
  box.append(el("span", { class: "txt", text: fertig ? "Fertig gemeldet von " + (f.statusVon || "?") + ", " + zeit(f.statusAt) + ". Claude liest und schreibt zurück." : "Noch in Arbeit. Wenn alles drin ist: Claude Bescheid geben." }));
  box.append(el("button", { type: "button", class: fertig ? "btn" : "btn ok", text: fertig ? "Wieder öffnen" : "Fertig, Claude darf lesen", onclick: () => {
    H.folgen[b] = { ...f, status: fertig ? "offen" : "fertig", statusVon: ICH.name, statusAt: Date.now() };
    schreibe("folge:" + b, "folge", { id: b, patch: { status: fertig ? "offen" : "fertig" } }, 0);
    neuZeichnen(); if (!fertig) toast("Claude ist Bescheid gegeben");
  } }));
  return box;
}
function heftBereiche(b) {
  // Besprechungsheft eines Bereichs: Fertig-Knopf, roter Faden, alle Abschnitte
  SEITE = b;
  const wrap = el("div", { class: "heft" });
  wrap.append(freigabeLeiste(b), el("div", { class: "thread" }, el("span", { id: "threadbar" })), el("div", { class: "progress", id: "progress" }));
  const list = el("div", { class: "sek-liste" });
  sektionenFuer(b).forEach((s, i) => list.append(sektion(b, s, i)));
  wrap.append(list);
  return wrap;
}
function renderView() {
  const v = $("#view"); v.replaceChildren(); SEITE = null;
  document.body.dataset.tab = tab.startsWith("k:") ? "seite" : tab;
  if (tab === "offen") { setzeTitel("Offene Punkte"); return renderOffen(seitenRahmen(v)); }
  if (tab === "besser") { setzeTitel("Besser machen"); return renderBesser(seitenRahmen(v)); }
  if (tab.startsWith("k:")) {
    const id = tab.slice(2);
    if (!H.karten[id] || H.karten[id].weg) { tab = "folgen"; return renderView(); }
    setzeTitel(kName(H.karten[id]) + " " + (H.karten[id].titel || ""));
    return renderFolgeSeite(seitenRahmen(v), id, "seite");
  }
  if (tab === "serie") {
    setzeTitel("Serien-Stil");
    const r = seitenRahmen(v);
    r.append(el("div", { class: "seitenkopf" }, el("h1", { class: "seiten-h", text: "Serien-Stil" }), el("p", { class: "note", text: "Gilt für alle Folgen. Einmal festlegen, danach nur bewusst ändern." })), heftBereiche("serie"));
    fortschrittZeigen(); return;
  }
  tab = "folgen"; setzeTitel("Folgen");
  renderFolgen(v);
}
function renderOffen(v) {
  v.append(el("div", { class: "viewhead" }, el("h2", { text: "Offene Punkte" }), el("p", { class: "note", text: "Was noch nicht entschieden ist: was, wer kümmert sich, bis wann. Erledigtes abhaken." })));
  const bereiche = ["Serie", ...folgenIds()];
  const tbody = el("tbody");
  const rows = Object.entries(H.offen).filter(([, o]) => !o.weg).sort((a, c) => (a[1].angelegt || a[1].at || 0) - (c[1].angelegt || c[1].at || 0));
  if (!rows.length) tbody.append(el("tr", {}, el("td", { colspan: "6", class: "note", text: "Noch keine offenen Punkte." })));
  for (const [id, o] of rows) {
    const upd = (patch, d) => { H.offen[id] = { ...H.offen[id], ...patch }; const p = { ...H.offen[id] }; schreibe("offen:" + id, "offen", { id, patch: { was: p.was, wer: p.wer, bis: p.bis, bereich: p.bereich, erledigt: p.erledigt, weg: p.weg } }, d); };
    const tr = el("tr", { class: o.erledigt ? "erledigt" : "" });
    const cb = el("input", { type: "checkbox", "aria-label": "Erledigt", id: "o-" + id + "-done" }); cb.checked = !!o.erledigt;
    cb.addEventListener("change", () => { upd({ erledigt: cb.checked }, 0); tr.className = cb.checked ? "erledigt" : ""; renderTabs(); });
    const inp = (k, ph) => { const i = el("input", { type: "text", value: o[k] || "", placeholder: ph, id: "o-" + id + "-" + k, "aria-label": ph }); i.addEventListener("input", () => upd({ [k]: i.value })); return i; };
    const sel = el("select", { id: "o-" + id + "-bereich", "aria-label": "Bereich" }, bereiche.map(x => el("option", { value: x, text: x }))); sel.value = o.bereich || "Serie"; sel.addEventListener("change", () => upd({ bereich: sel.value }, 0));
    let scharf = false; const del = el("button", { type: "button", class: "link", text: "Entfernen" });
    del.addEventListener("click", () => { if (!scharf) { scharf = true; del.textContent = "Wirklich?"; setTimeout(() => { scharf = false; del.textContent = "Entfernen"; }, 3500); return; } upd({ weg: true }, 0); renderView(); renderTabs(); });
    tr.append(el("td", {}, cb), el("td", {}, inp("was", "Was ist offen?")), el("td", {}, inp("wer", "Wer")), el("td", {}, inp("bis", "Bis wann")), el("td", {}, sel), el("td", {}, del));
    tbody.append(tr);
  }
  v.append(el("div", { class: "tablewrap", style: "margin-top:16px" }, el("table", { class: "offen" }, el("thead", {}, el("tr", {}, ["✓", "Was", "Wer", "Bis wann", "Bereich", ""].map(h => el("th", { text: h })))), tbody)));
  const ziel = { key: "offen/offen", b: "offen", s: "offen", label: "Offene Punkte" };
  v.append(el("div", { class: "row", style: "margin-top:12px" },
    el("button", { type: "button", class: "btn primary", text: "Punkt hinzufügen", onclick: () => {
      const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      H.offen[id] = { was: "", wer: "", bis: "", bereich: "Serie", erledigt: false, angelegt: Date.now() };
      schreibe("offen:" + id, "offen", { id, patch: { was: "", wer: "", bis: "", bereich: "Serie", erledigt: false } }, 0);
      renderView(); renderTabs(); setTimeout(() => { const n = document.getElementById("o-" + id + "-was"); n && n.focus(); }, 30);
    } }), recButton(ziel)), audioBox("offen", "offen"));
}

// ---------- Neue Daten von den anderen ----------
function uebernehmen(neu) {
  // eigene, noch nicht gesendete Eingaben behalten
  for (const [key] of pending) {
    const [art, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const map = { feld: "felder", meta: "meta", folge: "folgen", szene: "szenen", offen: "offen", karte: "karten", besser: "besser" }[art];
    if (map && H[map][id]) { if (!neu[map]) neu[map] = {}; neu[map][id] = H[map][id]; }
  }
  const alt = H; H = neu;
  for (const k of ["folgen", "felder", "meta", "szenen", "offen", "audios", "bilder", "claude", "karten", "besser"]) if (!H[k]) H[k] = {};
  const fokus = document.activeElement;
  const tippt = !!fokus && /INPUT|TEXTAREA|SELECT/.test(fokus.tagName) && ($("#view").contains(fokus) || $("#peek").contains(fokus));
  // Ansicht nur neu zeichnen, wenn sich ihr Aufbau geändert hat und niemand tippt oder zieht
  if (ansichtSig(alt) !== ansichtSig(H) && !tippt && !PL.drag && !POP) renderView();
  if (PL.peek && peekSig(alt) !== peekSig(H) && !tippt) renderPeek();
  renderNav();
  seiteAbgleich();
  document.querySelectorAll("textarea[data-key]").forEach(ta => {
    if (ta === fokus) return; const f = H.felder[ta.dataset.key] || {};
    if (ta.value !== (f.text || "")) { ta.value = f.text || ""; autoGrow(ta); }
    const w = ta.nextElementSibling; if (w && w.classList.contains("wer")) w.textContent = werText(f);
  });
  document.querySelectorAll("details.sek").forEach(d => {
    const cb = document.getElementById("c-" + d._b + "-" + d._sek.id);
    if (cb && cb !== fokus) cb.checked = !!meta(d._b, d._sek.id).erledigt;
    if (d.open && d._bilder) d._bilder._fill();
  });
  document.querySelectorAll("[data-szenen]").forEach(box => {
    const ids = szenenListe(box.dataset.szenen).map(([id]) => id).join(",");
    if (ids !== box._ids) { if (!box.contains(fokus)) box._fill(); return; }
    for (const [id, z] of szenenListe(box.dataset.szenen)) for (const k of ["titel", "laenge", "was", "gefuehl", "kamera", "aendern"]) {
      const n = document.getElementById("z-" + id + "-" + k); if (n && n !== fokus && n.value !== (z[k] || "")) n.value = z[k] || "";
    }
  });
  zeichneAudios(); refreshPills(); fortschrittZeigen();
}
let polling = false;
async function holen() {
  if (polling || document.visibilityState !== "visible") return;
  polling = true;
  try {
    const r = await call("laden", { rev: REV });
    if (!r.unveraendert) { REV = r.rev; if (r.vorlage) V = r.vorlage; uebernehmen(r.heft); }
    zeigeStand();
  } catch (e) { if (/kein_zugang|login_noetig|sitzung_abgelaufen/.test(e.code)) fehler(e); else if (!pending.size && !wartend.length) status("Gerade keine Verbindung. Eingaben bleiben auf dem Gerät und werden nachgesendet.", false); }
  polling = false;
}

// ---------- Start ----------
function zeigeTor(t, txt2) { $("#app").hidden = true; $("#tor").hidden = false; if (t) $("#tortitel").textContent = t; if (txt2) $("#tortext").textContent = txt2; }
async function start() {
  $("#version").textContent = "Stand v" + VERSION;
  $("#recstop").addEventListener("click", () => rec && rec.mr.stop());
  if (!KEY) return zeigeTor();
  $("#tor").hidden = true;
  let r;
  try { r = await call("laden", {}); }
  catch (e) {
    if (e.code === "kein_zugang") return zeigeTor("Dein Link gilt nicht", "Bitte frag nach einem neuen Link.");
    zeigeTor("Keine Verbindung", "Das Heft ist gerade nicht erreichbar. Bitte Internet prüfen und die Seite neu laden.");
    return;
  }
  ICH = r.ich; REV = r.rev; V = r.vorlage; H = r.heft;
  for (const k of ["folgen", "felder", "meta", "szenen", "offen", "audios", "bilder", "claude", "karten", "besser"]) if (!H[k]) H[k] = {};
  // Noch nicht gesendete Texte vom letzten Mal sofort wieder anzeigen
  for (const j of Object.values(korbLesen())) {
    if (!j.data || !j.data.id) continue;
    if (j.op === "feld") H.felder[j.data.id] = { ...(H.felder[j.data.id] || {}), text: j.data.text, at: j.at, von: ICH.name };
    if (j.op === "karte" || j.op === "besser") { const t = j.op === "karte" ? "karten" : "besser"; H[t][j.data.id] = { ...(H[t][j.data.id] || {}), ...(j.data.patch || {}) }; }
  }
  if (!V) return zeigeTor("Noch nicht eingerichtet", "Claude richtet das Heft gerade ein. Bitte später nochmal öffnen.");
  document.title = V.titel || "Teamheft";
  $("#sltitel").textContent = V.titel || "Teamheft";
  $("#slzeichen").textContent = (V.titel || "T").replace(/^die\s+/i, "").slice(0, 1).toUpperCase();
  $("#slwer").textContent = ICH.name;
  $("#app").hidden = false;
  status("Alles gespeichert · aktuell", true);
  folgenOhneKarte();
  try { history.replaceState({ tab }, ""); } catch (e) {}
  renderNav(); renderView();
  korbNachholen(); aufnahmenNachholen();
  setInterval(holen, 8000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") holen(); });
  window.addEventListener("beforeunload", e => { if (pending.size || wartend.length || rec) { e.preventDefault(); e.returnValue = ""; } });
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
start();
