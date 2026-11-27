/* Teamheft – App. Alle Inhalte kommen erst nach dem Zugang aus dem privaten Speicher.
   Hier im Code stehen keine Projektdaten, keine Namen, keine Schlüssel. */
"use strict";
const VERSION = 1;
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
let tab = ls.get("th-tab") || "serie";
const pending = new Map(); // key -> {timer, data, busy, again, fn}

const fid = (b, s, f) => `${b}__${s}__${f}`;
const txt = (b, s, f) => (H.felder[fid(b, s, f)] || {}).text || "";
const meta = (b, s) => H.meta[`${b}__${s}`] || {};
const folgenIds = () => Object.keys(H.folgen).filter(id => /^F\d+$/.test(id)).sort();
const sektionenFuer = b => b === "serie" ? V.serie : (V.folgen[b] || V.folgeStandard);
const fortschritt = b => { const s = sektionenFuer(b); return [s.filter(x => meta(b, x.id).erledigt).length, s.length]; };

// Schreiben: pro Schlüssel eins nach dem anderen, kurz gebündelt
function schreibe(key, fn, delay = 900) {
  let p = pending.get(key);
  if (!p) { p = { timer: null, busy: false, again: false }; pending.set(key, p); }
  p.fn = fn;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => flush(key), delay);
  status("Speichert …", false);
}
async function flush(key) {
  const p = pending.get(key); if (!p) return;
  if (p.busy) { p.again = true; return; }
  p.busy = true; const fn = p.fn; p.fn = null;
  try { await fn(); }
  catch (e) { fehler(e); }
  p.busy = false;
  if (p.again || p.fn) { p.again = false; if (p.fn) return flush(key); }
  pending.delete(key);
  if (!pending.size) status("Alles gespeichert", true);
}
function fehler(e) {
  if (e && e.code === "kein_zugang") return zeigeTor("Dein Link gilt nicht mehr", "Bitte frag nach einem neuen Link.");
  status("Nicht gespeichert: keine Verbindung. Ich versuche es weiter, sobald du wieder tippst.", false);
}
function status(t, ok) { $("#statustext").textContent = t; $("#dot").classList.toggle("live", !!ok); }

// ---------- Aufnahme ----------
let rec = null;
async function aufnehmen(ziel) {
  if (rec) { rec.mr.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) return toast("Aufnehmen geht in diesem Browser nicht. Bitte Safari oder Chrome nehmen.");
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { return toast("Kein Zugriff aufs Mikro. Bitte in den Einstellungen erlauben."); }
  const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(m => MediaRecorder.isTypeSupported(m)) || "";
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  const chunks = [];
  rec = { mr, t0: Date.now(), ziel, timer: null };
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  mr.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    const sek = (Date.now() - rec.t0) / 1000;
    clearInterval(rec.timer); rec = null; $("#recbar").hidden = true; markiereRec();
    const blob = new Blob(chunks, { type: mr.mimeType || mime || "audio/webm" });
    if (sek < 1 || !blob.size) return toast("Zu kurz, nichts gespeichert.");
    hochladen(blob, sek, ziel);
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
const wartend = []; // {id, blob, sek, ziel, fehler}
function blobToB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); }); }
async function hochladen(blob, sek, ziel, item) {
  item = item || { id: "w" + Date.now(), blob, sek, ziel };
  if (!wartend.includes(item)) wartend.push(item);
  item.fehler = false; zeichneAudios();
  try {
    const b64 = await blobToB64(item.blob);
    const r = await call("audio", { bereich: ziel.b, sek: ziel.s, feld: ziel.f || "", mime: item.blob.type, dauer: Math.round(item.sek), b64 });
    wartend.splice(wartend.indexOf(item), 1);
    H.audios[r.erg] = { bereich: ziel.b, sek: ziel.s, feld: ziel.f || "", von: ICH.name, at: Date.now(), mime: item.blob.type, dauer: Math.round(item.sek) };
    blobCache.set(r.erg, URL.createObjectURL(item.blob));
    toast("Sprachnachricht gespeichert");
  } catch (e) {
    item.fehler = true; toast("Sprachnachricht noch nicht gespeichert. Bitte „Nochmal senden“ drücken.", 5000);
  }
  zeichneAudios(); refreshPills();
}
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
      const z = el("div", { class: "zeile" }, el("span", { class: "info", text: (w.fehler ? "Nicht gespeichert · " : "Wird gespeichert … · ") + dauer(w.sek) }));
      if (w.fehler) z.append(el("button", { class: "btn", type: "button", text: "Nochmal senden", onclick: () => hochladen(w.blob, w.sek, w.ziel, w) }));
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
    schreibe("feld:" + key, () => call("feld", { id: key, text }));
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
  schreibe("meta:" + id, () => call("meta", { id, patch: { ...H.meta[id] } }), 200);
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
  schreibe("szene:" + id, () => call("szene", { id, patch: p }), delay);
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
function renderTabs() {
  const n = $("#tabs"); n.replaceChildren();
  const mk = (id, label, extra, fertig) => {
    const t = el("button", { class: "tab", type: "button", role: "tab", "aria-selected": tab === id ? "true" : "false", onclick: () => go(id) }, label);
    if (extra) t.append(el("span", { class: "n", text: extra }));
    if (fertig) t.append(el("span", { class: "fertig", title: "Fertig, Claude darf lesen" }));
    n.append(t);
  };
  const [a, c] = fortschritt("serie"); mk("serie", "Serien-Stil", a + "/" + c, (H.folgen.serie || {}).status === "fertig");
  for (const id of folgenIds()) { const [x, y] = fortschritt(id); mk(id, id, x + "/" + y, H.folgen[id].status === "fertig"); }
  n.append(el("button", { class: "tab add", type: "button", text: "+ Folge", onclick: neueFolge }));
  mk("offen", "Offene Punkte", String(Object.values(H.offen).filter(o => !o.erledigt && !o.weg).length));
}
function neueFolge() {
  const nums = folgenIds().map(id => parseInt(id.slice(1), 10));
  const nr = "F" + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0");
  H.folgen[nr] = { titel: "", at: Date.now() };
  schreibe("folge:" + nr, () => call("folge", { id: nr, patch: { titel: "" } }), 0);
  go(nr);
}
function go(id) { tab = id; ls.set("th-tab", id); renderTabs(); renderView(); window.scrollTo({ top: 0 }); }
function fortschrittZeigen() {
  const p = $("#progress"); if (!p) return;
  const [a, c] = fortschritt(tab); p.textContent = a + " von " + c + " Bereichen besprochen";
  $("#threadbar").style.width = (c ? a / c * 100 : 0) + "%";
  renderTabs();
}
function freigabeLeiste(b) {
  const f = H.folgen[b] || {}; const fertig = f.status === "fertig";
  const box = el("div", { class: "freigabe" + (fertig ? " fertig" : "") });
  box.append(el("span", { class: "txt", text: fertig ? "Fertig gemeldet von " + (f.statusVon || "?") + ", " + zeit(f.statusAt) + ". Claude liest und schreibt zurück." : "Noch in Arbeit. Wenn alles drin ist: Claude Bescheid geben." }));
  box.append(el("button", { type: "button", class: fertig ? "btn" : "btn ok", text: fertig ? "Wieder öffnen" : "Fertig, Claude darf lesen", onclick: () => {
    H.folgen[b] = { ...f, status: fertig ? "offen" : "fertig", statusVon: ICH.name, statusAt: Date.now() };
    schreibe("folge:" + b, () => call("folge", { id: b, patch: { status: fertig ? "offen" : "fertig" } }), 0);
    renderView(); renderTabs(); if (!fertig) toast("Claude ist Bescheid gegeben");
  } }));
  return box;
}
function renderView() {
  const v = $("#view"); v.replaceChildren();
  if (tab === "offen") return renderOffen(v);
  if (tab !== "serie" && !H.folgen[tab]) tab = "serie";
  const b = tab; const secs = sektionenFuer(b);
  const head = el("div", { class: "viewhead" });
  if (b === "serie") head.append(el("h2", { text: "Serien-Stil" }), el("p", { class: "note", text: "Gilt für alle Folgen. Einmal festlegen, danach nur bewusst ändern." }));
  else {
    const f = H.folgen[b] || {};
    const ti = el("input", { type: "text", id: "titel-" + b, value: f.titel || "", placeholder: "Titel der Folge" });
    ti.addEventListener("input", () => { H.folgen[b] = { ...(H.folgen[b] || {}), titel: ti.value }; const t = ti.value; schreibe("folge:" + b, () => call("folge", { id: b, patch: { titel: t } })); });
    head.append(el("h2", { text: "Folge " + b.slice(1).replace(/^0+/, "") }), el("div", { class: "titlefield" }, el("label", { for: ti.id, text: "Titel" }), ti));
  }
  head.append(freigabeLeiste(b), el("div", { class: "thread" }, el("span", { id: "threadbar" })), el("div", { class: "progress", id: "progress" }));
  v.append(head);
  const list = el("div", { style: "display:flex;flex-direction:column;gap:12px;margin-top:18px" });
  secs.forEach((s, i) => list.append(sektion(b, s, i)));
  v.append(list);
  fortschrittZeigen();
}
function renderOffen(v) {
  v.append(el("div", { class: "viewhead" }, el("h2", { text: "Offene Punkte" }), el("p", { class: "note", text: "Was noch nicht entschieden ist: was, wer kümmert sich, bis wann. Erledigtes abhaken." })));
  const bereiche = ["Serie", ...folgenIds()];
  const tbody = el("tbody");
  const rows = Object.entries(H.offen).filter(([, o]) => !o.weg).sort((a, c) => (a[1].angelegt || a[1].at || 0) - (c[1].angelegt || c[1].at || 0));
  if (!rows.length) tbody.append(el("tr", {}, el("td", { colspan: "6", class: "note", text: "Noch keine offenen Punkte." })));
  for (const [id, o] of rows) {
    const upd = (patch, d) => { H.offen[id] = { ...H.offen[id], ...patch }; const p = { ...H.offen[id] }; schreibe("offen:" + id, () => call("offen", { id, patch: { was: p.was, wer: p.wer, bis: p.bis, bereich: p.bereich, erledigt: p.erledigt, weg: p.weg } }), d); };
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
      schreibe("offen:" + id, () => call("offen", { id, patch: { was: "", wer: "", bis: "", bereich: "Serie", erledigt: false } }), 0);
      renderView(); renderTabs(); setTimeout(() => { const n = document.getElementById("o-" + id + "-was"); n && n.focus(); }, 30);
    } }), recButton(ziel)), audioBox("offen", "offen"));
}

// ---------- Neue Daten von den anderen ----------
function uebernehmen(neu) {
  // eigene, noch nicht gesendete Eingaben behalten
  for (const [key] of pending) {
    const [art, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const map = { feld: "felder", meta: "meta", folge: "folgen", szene: "szenen", offen: "offen" }[art];
    if (map && H[map][id]) neu[map][id] = H[map][id];
  }
  const alt = H; H = neu;
  for (const k of ["folgen", "felder", "meta", "szenen", "offen", "audios", "bilder", "claude"]) if (!H[k]) H[k] = {};
  const fokus = document.activeElement;
  const inView = fokus && $("#view").contains(fokus) && /INPUT|TEXTAREA|SELECT/.test(fokus.tagName);
  // Struktur geändert? Dann neu zeichnen, wenn niemand tippt.
  const sig = h => JSON.stringify([Object.keys(h.folgen).sort(), Object.keys(h.claude).sort().map(k => h.claude[k].at), tab === "offen" ? Object.keys(h.offen).sort() : 0]);
  if (sig(alt) !== sig(H) && !inView) { renderTabs(); renderView(); return; }
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
    if (!pending.size) status("Alles gespeichert · aktuell", true);
  } catch (e) { if (e.code === "kein_zugang") fehler(e); else status("Keine Verbindung. Versuche es gleich wieder …", false); }
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
  for (const k of ["folgen", "felder", "meta", "szenen", "offen", "audios", "bilder", "claude"]) if (!H[k]) H[k] = {};
  if (!V) return zeigeTor("Noch nicht eingerichtet", "Claude richtet das Heft gerade ein. Bitte später nochmal öffnen.");
  document.title = V.titel || "Teamheft";
  $("#eyebrow").textContent = (V.titel || "Teamheft") + " · " + (V.untertitel || "");
  $("#titel").textContent = "Hallo " + ICH.name;
  $("#app").hidden = false;
  status("Alles gespeichert · aktuell", true);
  renderTabs(); renderView();
  setInterval(holen, 8000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") holen(); });
  window.addEventListener("beforeunload", e => { if (pending.size || wartend.length || rec) { e.preventDefault(); e.returnValue = ""; } });
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
start();
