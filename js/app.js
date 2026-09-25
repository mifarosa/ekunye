(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const STORE_KEY = "bilgilerim.items.v1";
  const BANNER_KEY = "bilgilerim.installHintDismissed";

  const LANG_KEY = "bilgilerim.lang";
  const TOMB_KEY = "bilgilerim.deleted.v1";
  const SYNC_KEY = "bilgilerim.sync"; // "1" once the user has turned on sync

  // Starter entries, grouped; all of them appear as quick picks in the "add"
  // sheet. Only entries with `seed: true` are pre-filled into the list on first
  // launch; users can edit or delete those. `hidden` masks the value by default.
  // Titles, group labels and hints live in lang/*.js under the same ids.
  const PRESET_GROUPS = [
    {
      id: "me",
      items: [
        { id: "homeAddress", emoji: "🏠", seed: true },
        { id: "workAddress", emoji: "🏢", seed: true },
        { id: "email", emoji: "✉️", seed: true },
        { id: "phone", emoji: "📱", seed: true },
        { id: "iban", emoji: "🏦", seed: true, hint: "iban", hidden: true },
        { id: "tcId", emoji: "🪪", hint: "tcId", numeric: true, hidden: true },
      ],
    },
    {
      id: "family",
      items: [
        { id: "motherPhone", emoji: "👩", seed: true },
        { id: "motherIban", emoji: "🏦", hint: "iban", hidden: true },
        { id: "motherTcId", emoji: "🪪", hint: "tcId", numeric: true, hidden: true },
        { id: "fatherPhone", emoji: "👨", seed: true },
        { id: "fatherIban", emoji: "🏦", hint: "iban", hidden: true },
        { id: "fatherTcId", emoji: "🪪", hint: "tcId", numeric: true, hidden: true },
      ],
    },
    {
      id: "spouse",
      items: [
        { id: "spousePhone", emoji: "💑" },
        { id: "spouseIban", emoji: "🏦", hint: "iban", hidden: true },
        { id: "spouseTcId", emoji: "🪪", hint: "tcId", numeric: true, hidden: true },
      ],
    },
    {
      id: "dates",
      items: [
        { id: "myBirthday", emoji: "🎂", hint: "date" },
        { id: "spouseBirthday", emoji: "🎂", hint: "date" },
        { id: "motherBirthday", emoji: "🎂", hint: "date" },
        { id: "fatherBirthday", emoji: "🎂", hint: "date" },
        { id: "firstDate", emoji: "☕", hint: "date" },
        { id: "proposal", emoji: "💍", hint: "date" },
        { id: "engagement", emoji: "🎀", hint: "date" },
        { id: "wedding", emoji: "💒", hint: "date" },
      ],
    },
    {
      id: "home",
      items: [
        { id: "electricity", emoji: "⚡", numeric: true },
        { id: "water", emoji: "💧", numeric: true },
        { id: "gas", emoji: "🔥", numeric: true },
        { id: "internet", emoji: "🌐" },
        { id: "postcode", emoji: "📮", hint: "postcode", numeric: true },
        { id: "wifi", emoji: "📶", hidden: true },
        { id: "doorCode", emoji: "🔢", hidden: true },
      ],
    },
    {
      id: "car",
      items: [
        { id: "plate", emoji: "🚗", hint: "plate" },
        { id: "registration", emoji: "📄", hidden: true },
        { id: "trafficInsurance", emoji: "🛡️", hidden: true },
        { id: "carInsurance", emoji: "🛡️", hidden: true },
        { id: "hgs", emoji: "🛣️", numeric: true },
      ],
    },
    {
      id: "health",
      items: [
        { id: "bloodType", emoji: "🩸", seed: true, hint: "blood" },
        { id: "medications", emoji: "💊", seed: true },
        { id: "allergies", emoji: "⚠️" },
        { id: "conditions", emoji: "🩺" },
        { id: "doctorPhone", emoji: "👨‍⚕️" },
        { id: "healthInsurance", emoji: "🏥", hidden: true },
        { id: "emergencyContact", emoji: "🆘", hint: "emergency" },
      ],
    },
  ];
  const PRESETS = PRESET_GROUPS.flatMap((g) => g.items);

  // ---------------------------------------------------------------------------
  // Language
  // ---------------------------------------------------------------------------
  const LANGS = window.EKUNYE_LANGS;
  let lang = pickLanguage();

  // Saved choice first, then the browser language; English is the fallback.
  // Lists saved before the language switch existed are Turkish, so keep them so.
  function pickLanguage() {
    let saved = null;
    let hasOldList = false;
    try {
      saved = localStorage.getItem(LANG_KEY);
      hasOldList = localStorage.getItem(STORE_KEY) !== null;
    } catch (_) {}
    if (saved && LANGS[saved]) return saved;
    if (hasOldList) return "tr";
    const preferred = (navigator.languages || [navigator.language || ""]).map((l) => l.slice(0, 2).toLowerCase());
    return preferred.find((l) => LANGS[l]) || "en";
  }

  // t("key") returns a string; keys holding functions take their arguments.
  function t(key, ...args) {
    const value = LANGS[lang].ui[key] ?? LANGS.tr.ui[key];
    return typeof value === "function" ? value(...args) : value;
  }

  const presetTitle = (p, code = lang) => LANGS[code].presets[p.id];
  const presetHint = (p) => (p.hint ? LANGS[lang].hints[p.hint] : "");

  // Matches a title against every language, so an untouched preset is still
  // recognised after the user switches language.
  const findPreset = (title) =>
    PRESETS.find((p) => Object.keys(LANGS).some((code) => presetTitle(p, code) === title)) || null;

  const EMOJIS = [
    "🏠", "🏡", "🏢", "📍", "✉️", "📧", "📱", "📞",
    "🏦", "💳", "💰", "🧾", "🪪", "🛂", "🚗", "🔑",
    "🩸", "💊", "🩺", "🏥", "🚑", "❤️", "👩", "👨",
    "👵", "👴", "👶", "👫", "💼", "🎓", "🌐", "📦",
    "🐾", "✈️", "📝", "⭐", "📌", "🔒",
    "☕", "💍", "🎀", "💒", "💐", "🎂", "🥂", "📅",
    "💑", "⚡", "💧", "🔥", "📮", "📶", "🔢", "📄",
    "🛡️", "🛣️", "⚠️", "👨‍⚕️", "🆘",
  ];

  // ---------------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const listEl = $("#list");
  const emptyEl = $("#empty");
  const editor = $("#editor");
  const menu = $("#menu");
  const editorTitle = $("#editorTitle");
  const presetSection = $("#presetSection");
  const emojiInput = $("#emojiInput");
  const titleInput = $("#titleInput");
  const valueInput = $("#valueInput");
  const emojiGrid = $("#emojiGrid");
  const deleteBtn = $("#deleteBtn");
  const saveBtn = $("#saveBtn");
  const toastEl = $("#toast");
  const toastText = $("#toastText");
  const toastAction = $("#toastAction");
  const importInput = $("#importInput");
  const liveEl = $("#live");
  const hiddenInput = $("#hiddenInput");

  // ---------------------------------------------------------------------------
  // State & persistence (localStorage, device-only)
  // ---------------------------------------------------------------------------
  let items = [];
  let tombstones = {}; // id -> time of deletion, so sync can pass deletes on
  let lastSaved = new Map(); // id -> content key at the last save
  let editingId = null; // null means the editor is adding a new entry

  const uid = () =>
    window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);

  // Current record shape: { id, emoji, title, value, hidden, updatedAt }.
  // Every record from storage or a backup file goes through this function, so
  // older data (missing fields, extra fields, wrong types) always loads safely.
  // Rule for future versions: only add fields with defaults here; never rename
  // or make a field required without mapping the old name first.
  function normalizeItem(x, keepId) {
    if (!x || typeof x !== "object") return null;
    const title = typeof x.title === "string" ? x.title.trim() : "";
    if (!title) return null;
    return {
      id: keepId && typeof x.id === "string" && x.id ? x.id : uid(),
      emoji: typeof x.emoji === "string" && x.emoji.trim() ? x.emoji.trim() : "📌",
      title,
      value: typeof x.value === "string" ? x.value : "",
      hidden: x.hidden === true,
      updatedAt: Number.isFinite(x.updatedAt) ? x.updatedAt : 0,
    };
  }

  function normalizeList(list, keepIds) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of list) {
      const item = normalizeItem(raw, keepIds);
      if (!item) continue;
      if (seen.has(item.id)) item.id = uid(); // guard against duplicate ids
      seen.add(item.id);
      out.push(item);
    }
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return normalizeList(parsed, true);
      }
    } catch (_) { /* storage unavailable or corrupt: fall through */ }
    return null;
  }

  function loadTombstones() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TOMB_KEY) || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (_) {}
    return {};
  }

  // What sync compares: the visible fields plus the position in the list.
  const contentKey = (item, pos) => JSON.stringify([item.emoji, item.title, item.value, item.hidden, pos]);
  const snapshotOf = (list) => new Map(list.map((item, pos) => [item.id, contentKey(item, pos)]));

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(items));
      localStorage.setItem(TOMB_KEY, JSON.stringify(tombstones));
    } catch (_) {
      showToast(t("saveFailed"));
    }
  }

  // Every local edit ends here: stamp what changed, record deletions and tell
  // sync (when it is on) which ids to send.
  function save() {
    const now = Date.now();
    const snapshot = snapshotOf(items);
    const changed = [];
    for (const item of items) {
      if (lastSaved.get(item.id) !== snapshot.get(item.id)) {
        item.updatedAt = now;
        delete tombstones[item.id]; // an undo brings a deleted entry back
        changed.push(item.id);
      }
    }
    for (const id of lastSaved.keys()) {
      if (!snapshot.has(id)) {
        tombstones[id] = now;
        changed.push(id);
      }
    }
    lastSaved = snapshot;
    persist();
    if (changed.length) syncListeners.forEach((fn) => fn(changed));
  }

  // Sync hands over a merged list; it is already stamped, so nothing is re-sent.
  function applyRemote(nextItems, nextTombstones) {
    items = nextItems;
    tombstones = nextTombstones;
    lastSaved = snapshotOf(items);
    persist();
    render();
    if (editingId && !items.some((i) => i.id === editingId)) closeOverlay(editor);
  }

  function seedPresets() {
    return PRESETS.filter((p) => p.seed).map((p) => ({ id: uid(), emoji: p.emoji, title: presetTitle(p), value: "", hidden: !!p.hidden }));
  }

  // Ask the browser not to evict our data under storage pressure (Chromium).
  function requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted()
        .then((already) => { if (!already) return navigator.storage.persist(); })
        .catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  // Returns the last user-visible character, so multi-codepoint emoji
  // (flags, skin tones, ZWJ sequences) stay intact.
  function lastGrapheme(str) {
    if (!str) return "";
    if (window.Intl && Intl.Segmenter) {
      const segs = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(str)];
      return segs.length ? segs[segs.length - 1].segment : "";
    }
    return Array.from(str).pop() || "";
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // Fallback for contexts where the async Clipboard API is blocked.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) {}
      ta.remove();
      return ok;
    }
  }

  const vibrate = (ms) => { if (navigator.vibrate) navigator.vibrate(ms); };

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------
  let toastTimer = null;

  function showToast(message, action) {
    toastText.textContent = message;
    if (action) {
      toastAction.hidden = false;
      toastAction.textContent = action.label;
      toastAction.onclick = () => { action.fn(); hideToast(); };
    } else {
      toastAction.hidden = true;
      toastAction.onclick = null;
    }
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 4500 : 1600);
  }

  function hideToast() {
    toastEl.classList.remove("show");
  }

  // ---------------------------------------------------------------------------
  // List rendering
  // ---------------------------------------------------------------------------
  function render() {
    listEl.replaceChildren();
    for (const item of items) {
      const li = document.createElement("li");
      const row = document.createElement("button");
      row.className = "row";
      row.type = "button";
      row.dataset.id = item.id;

      const emoji = document.createElement("span");
      emoji.className = "emoji";
      emoji.textContent = item.emoji || "📌";
      emoji.setAttribute("aria-hidden", "true");

      const title = document.createElement("span");
      title.className = "title";
      title.textContent = item.title;

      const value = document.createElement("span");
      const isEmpty = !item.value.trim();
      if (isEmpty) {
        value.className = "value empty";
        value.textContent = t("tapToAdd");
      } else if (item.hidden) {
        // Fixed-length mask so the real length is not revealed either.
        value.className = "value masked";
        value.textContent = "••••••••";
        row.setAttribute("aria-label", t("hiddenAria", item.title));
      } else {
        value.className = "value";
        value.textContent = item.value;
      }

      row.append(emoji, title, value);
      attachPressHandlers(row, item.id);
      li.appendChild(row);
      listEl.appendChild(li);
    }
    emptyEl.hidden = items.length > 0;
  }

  // Tap copies, long press (or right click / "e" key) opens the editor.
  function attachPressHandlers(row, id) {
    let timer = null;
    let longPressed = false;
    let startX = 0;
    let startY = 0;

    const cancel = () => { clearTimeout(timer); timer = null; };

    row.addEventListener("pointerdown", (e) => {
      longPressed = false;
      startX = e.clientX;
      startY = e.clientY;
      cancel();
      timer = setTimeout(() => {
        longPressed = true;
        vibrate(15);
        openEditor(id);
      }, 450);
    });
    row.addEventListener("pointermove", (e) => {
      if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => row.addEventListener(t, cancel));

    row.addEventListener("click", (e) => {
      if (longPressed) { e.preventDefault(); longPressed = false; return; }
      handleTap(id, row);
    });
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!longPressed) { cancel(); openEditor(id); }
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "e" || e.key === "E") { e.preventDefault(); openEditor(id); }
    });
  }

  async function handleTap(id, row) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (!item.value.trim()) { openEditor(id); return; }

    const ok = await copyText(item.value);
    if (ok) {
      vibrate(20);
      // Quiet in-place confirmation: the name briefly reads "Copied".
      const titleEl = row.querySelector(".title");
      clearTimeout(row._copiedTimer);
      row.classList.add("copied");
      titleEl.textContent = t("copied");
      row._copiedTimer = setTimeout(() => {
        row.classList.remove("copied");
        titleEl.textContent = item.title;
      }, 1100);
      liveEl.textContent = t("copiedLive", item.title);
    } else {
      showToast(t("copyFailed"));
    }
  }

  // ---------------------------------------------------------------------------
  // Sheets (shared open/close)
  // ---------------------------------------------------------------------------
  function openOverlay(el) {
    el.classList.add("open");
    document.body.classList.add("locked");
  }

  function closeOverlay(el) {
    el.classList.remove("open");
    if (!document.querySelector(".overlay.open")) document.body.classList.remove("locked");
  }

  // Close on backdrop tap, but only if the press also started on the backdrop.
  // This prevents the long-press release from instantly closing the editor.
  [editor, menu].forEach((overlay) => {
    let downOnBackdrop = false;
    overlay.addEventListener("pointerdown", (e) => { downOnBackdrop = e.target === overlay; });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay && downOnBackdrop) closeOverlay(overlay);
      downOnBackdrop = false;
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (pwSheet.classList.contains("open")) finishPassword("cancel");
    else if (editor.classList.contains("open")) closeOverlay(editor);
    else if (menu.classList.contains("open")) closeOverlay(menu);
  });

  // ---------------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------------
  function buildEmojiGrid() {
    for (const e of EMOJIS) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = e;
      b.setAttribute("aria-label", `Emoji ${e}`);
      b.addEventListener("click", () => {
        emojiInput.value = e;
        syncEmojiSelection();
      });
      emojiGrid.appendChild(b);
    }
  }

  function syncEmojiSelection() {
    const current = emojiInput.value;
    for (const b of emojiGrid.children) b.classList.toggle("selected", b.textContent === current);
  }

  function applyPresetHints(preset) {
    valueInput.placeholder = (preset && presetHint(preset)) || t("valuePlaceholder");
    valueInput.inputMode = preset && preset.numeric ? "numeric" : "text";
  }

  function buildPresetChips() {
    presetSection.replaceChildren();
    const heading = document.createElement("span");
    heading.className = "field-label";
    heading.textContent = t("presetsHeading");
    presetSection.appendChild(heading);

    for (const group of PRESET_GROUPS) {
      const wrap = document.createElement("details");
      wrap.className = "preset-group";
      const label = document.createElement("summary");
      const name = document.createElement("span");
      name.textContent = LANGS[lang].groups[group.id];
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = String(group.items.length);
      label.append(name, count);
      const chips = document.createElement("div");
      chips.className = "chips";
      for (const p of group.items) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = `${p.emoji} ${presetTitle(p)}`;
        chip.addEventListener("click", () => {
          emojiInput.value = p.emoji;
          titleInput.value = presetTitle(p);
          hiddenInput.checked = !!p.hidden;
          applyPresetHints(p);
          syncEmojiSelection();
          updateSaveState();
          valueInput.focus();
        });
        chips.appendChild(chip);
      }
      wrap.append(label, chips);
      presetSection.appendChild(wrap);
    }
  }

  function updateSaveState() {
    saveBtn.disabled = titleInput.value.trim().length === 0;
  }

  function openEditor(id) {
    const item = id ? items.find((i) => i.id === id) : null;
    editingId = item ? item.id : null;

    editorTitle.textContent = item ? t("editEntry") : t("newEntry");
    presetSection.hidden = !!item;
    presetSection.querySelectorAll("details").forEach((d) => { d.open = false; });
    deleteBtn.hidden = !item;

    emojiInput.value = item ? item.emoji : "";
    titleInput.value = item ? item.title : "";
    valueInput.value = item ? item.value : "";
    hiddenInput.checked = item ? item.hidden : false;
    applyPresetHints(item ? findPreset(item.title) : null);
    syncEmojiSelection();
    updateSaveState();

    openOverlay(editor);
    editor.querySelector(".sheet").scrollTop = 0;
    // Jump straight to the value field when filling in an empty preset.
    if (item && !item.value.trim()) setTimeout(() => valueInput.focus(), 50);
  }

  emojiInput.addEventListener("input", () => {
    emojiInput.value = lastGrapheme(emojiInput.value.trim());
    syncEmojiSelection();
  });
  titleInput.addEventListener("input", updateSaveState);

  saveBtn.addEventListener("click", () => {
    const title = titleInput.value.trim();
    if (!title) return;
    const entry = {
      id: editingId || uid(),
      emoji: emojiInput.value.trim() || "📌",
      title,
      value: valueInput.value.trim(),
      hidden: hiddenInput.checked,
    };
    const idx = items.findIndex((i) => i.id === entry.id);
    if (idx >= 0) items[idx] = entry;
    else items.push(entry);
    save();
    render();
    closeOverlay(editor);
    showToast(idx >= 0 ? t("saved") : t("added", entry.title));
  });

  deleteBtn.addEventListener("click", () => {
    const idx = items.findIndex((i) => i.id === editingId);
    if (idx < 0) return;
    const [removed] = items.splice(idx, 1);
    save();
    render();
    closeOverlay(editor);
    showToast(t("deleted", removed.title), {
      label: t("undo"),
      fn: () => {
        items.splice(Math.min(idx, items.length), 0, removed);
        save();
        render();
      },
    });
  });

  $("#cancelBtn").addEventListener("click", () => closeOverlay(editor));
  $("#addBtn").addEventListener("click", () => openEditor(null));

  // ---------------------------------------------------------------------------
  // Backup: export / import as JSON
  // ---------------------------------------------------------------------------
  async function exportBackup() {
    const data = { app: "e-kunye", version: 2, exportedAt: new Date().toISOString(), items };
    const name = `${t("backupFileName")}-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });

    // Prefer the native share sheet (lets iOS users "Save to Files").
    try {
      const file = new File([blob], name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: t("backupShareTitle") });
        closeOverlay(menu);
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return; // user dismissed the share sheet
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    closeOverlay(menu);
    showToast(t("backupDownloaded"));
  }

  async function importBackup(file) {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (_) {
      showToast(t("fileUnreadable"));
      return;
    }
    const source = Array.isArray(parsed) ? parsed : parsed && parsed.items;
    if (!Array.isArray(source)) {
      showToast(t("noEntries"));
      return;
    }
    // Backups v1 (no `hidden`) and v2 share the same shape; normalizeItem
    // fills in anything missing. Add version-specific migrations here if the
    // shape ever changes.
    const restored = normalizeList(source, false);
    if (!restored.length) {
      showToast(t("noEntries"));
      return;
    }
    if (!confirm(t("confirmRestore", restored.length))) return;

    items = restored;
    save();
    render();
    closeOverlay(menu);
    showToast(t("restored", restored.length));
  }

  $("#menuBtn").addEventListener("click", () => {
    openOverlay(menu);
    // Load and start sync early: the Google sign-in popup must open right
    // after the tap, or browsers (Safari especially) block it.
    if (!syncEnabled()) loadSync().catch(() => {});
  });
  $("#menuClose").addEventListener("click", () => closeOverlay(menu));
  $("#exportBtn").addEventListener("click", exportBackup);
  $("#importBtn").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0];
    if (file) await importBackup(file);
    importInput.value = "";
  });

  // ---------------------------------------------------------------------------
  // "Add to home screen" hint (installed apps keep their storage reliably)
  // ---------------------------------------------------------------------------
  const banner = $("#banner");
  const bannerTitle = $("#bannerTitle");
  const bannerText = $("#bannerText");
  const bannerQr = $("#bannerQr");
  const installSteps = $("#installSteps");
  const bannerInstall = $("#bannerInstall");
  const aboutInstall = $("#aboutInstall");
  let deferredPrompt = null;

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function updateBanner() {
    let dismissed = false;
    try { dismissed = localStorage.getItem(BANNER_KEY) === "1"; } catch (_) {}
    const touch = window.matchMedia("(pointer: coarse)").matches;

    if (isStandalone() || dismissed) { banner.hidden = true; return; }

    // On a computer, point people to their phone instead of install steps.
    const desktop = !touch;
    bannerTitle.textContent = desktop ? t("desktopTitle") : t("installTitle");
    bannerQr.hidden = !desktop;
    installSteps.hidden = desktop;
    if (desktop) {
      bannerText.textContent = t("desktopCopy");
      bannerInstall.hidden = true;
      banner.hidden = false;
      return;
    }

    if (isIOS()) {
      bannerText.textContent = t("installCopy");
      installSteps.innerHTML = t("stepsIOS");
      bannerInstall.hidden = true;
    } else if (deferredPrompt) {
      bannerText.textContent = t("installCopyPrompt");
      installSteps.innerHTML = t("stepsPrompt");
      bannerInstall.hidden = false;
    } else {
      bannerText.textContent = t("installCopy");
      installSteps.innerHTML = t("stepsMenu");
      bannerInstall.hidden = true;
    }
    banner.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    aboutInstall.hidden = isStandalone();
    updateBanner();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    banner.hidden = true;
    aboutInstall.hidden = true;
  });
  async function promptInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (_) {}
    deferredPrompt = null;
    aboutInstall.hidden = true;
    updateBanner();
  }
  bannerInstall.addEventListener("click", promptInstall);
  aboutInstall.addEventListener("click", promptInstall);
  $("#bannerClose").addEventListener("click", () => {
    try { localStorage.setItem(BANNER_KEY, "1"); } catch (_) {}
    banner.hidden = true;
  });

  // ---------------------------------------------------------------------------
  // Sync (optional). js/sync.js holds the Firebase and encryption logic and is
  // only loaded once the user turns sync on; this part owns its UI.
  // ---------------------------------------------------------------------------
  const syncListeners = [];
  const syncText = $("#syncText");
  const syncStatus = $("#syncStatus");
  const syncPrimary = $("#syncPrimary");
  const syncSecondary = $("#syncSecondary");
  let syncView = { state: "off" };
  let syncPromise = null;

  const syncEnabled = () => { try { return localStorage.getItem(SYNC_KEY) === "1"; } catch (_) { return false; } };
  function setSyncEnabled(on) {
    try { on ? localStorage.setItem(SYNC_KEY, "1") : localStorage.removeItem(SYNC_KEY); } catch (_) {}
  }

  // The narrow surface js/sync.js works through.
  const store = {
    getItems: () => items,
    getTombstones: () => tombstones,
    applyRemote,
    normalize: (x) => normalizeItem(x, true),
    onLocalChange: (fn) => syncListeners.push(fn),
    setSyncView,
    setSyncEnabled,
    syncEnabled,
    askPassword,
    toast: (key) => showToast(t(key)),
    confirm: (key) => confirm(t(key)),
  };

  function loadSync() {
    if (!syncPromise) {
      syncPromise = import("./sync.js")
        .then((m) => m.start(store))
        .catch((err) => {
          syncPromise = null;
          console.error(err);
          setSyncView({ state: "error", message: "syncLoadFailed" });
          throw err;
        });
    }
    return syncPromise;
  }

  // view: { state: "off" | "connecting" | "locked" | "on" | "error",
  //         email?, status?: "synced" | "pending" | "offline", message? }
  function setSyncView(view) {
    syncView = view;
    renderSync();
  }

  function setButton(btn, key, action) {
    btn.hidden = !key;
    if (!key) return;
    btn.textContent = t(key);
    btn.onclick = action;
  }

  function renderSync() {
    const v = syncView;
    const run = (method) => () => loadSync().then((c) => c[method]()).catch(() => {});
    syncStatus.hidden = true;
    setButton(syncPrimary, null);
    setButton(syncSecondary, null);

    if (v.state === "off") {
      syncText.textContent = t("syncOffText");
      setButton(syncPrimary, "syncSignIn", run("signIn"));
    } else if (v.state === "connecting") {
      syncText.textContent = t("syncConnecting");
    } else if (v.state === "locked") {
      syncText.textContent = t("syncLockedText", v.email);
      setButton(syncPrimary, "syncUnlock", run("unlock"));
      setButton(syncSecondary, "syncSignOut", run("signOut"));
    } else if (v.state === "on") {
      syncText.textContent = t("syncOnText", v.email);
      syncStatus.hidden = false;
      syncStatus.textContent = t(v.status === "offline" ? "syncOffline" : v.status === "pending" ? "syncPending" : "syncSynced");
      setButton(syncSecondary, "syncSignOut", run("signOut"));
    } else {
      syncText.textContent = t(v.message || "syncError");
      setButton(syncPrimary, "syncRetry", run("retry"));
      if (v.email) setButton(syncSecondary, "syncSignOut", run("signOut"));
    }
  }

  // Password sheet. askPassword({ mode: "create" | "unlock", email, submit(pw) })
  // resolves to "ok", "cancel" or "forgot". submit returns false for a wrong
  // password and throws on other errors.
  const pwSheet = $("#pwSheet");
  const pwForm = $("#pwForm");
  const pwInput = $("#pwInput");
  const pwConfirm = $("#pwConfirm");
  const pwConfirmWrap = $("#pwConfirmWrap");
  const pwError = $("#pwError");
  const pwSubmit = $("#pwSubmit");
  const pwForgot = $("#pwForgot");
  let pwRequest = null;

  function askPassword({ mode, email, submit }) {
    return new Promise((resolve) => {
      pwRequest = { mode, submit, resolve };
      $("#pwUser").value = email || "";
      const create = mode === "create";
      $("#pwTitle").textContent = t(create ? "pwCreateTitle" : "pwUnlockTitle");
      $("#pwText").textContent = t(create ? "pwCreateText" : "pwUnlockText");
      pwConfirmWrap.hidden = !create;
      pwForgot.hidden = create;
      pwInput.autocomplete = create ? "new-password" : "current-password";
      pwInput.value = "";
      pwConfirm.value = "";
      pwError.textContent = "";
      setPwBusy(false);
      openOverlay(pwSheet);
      setTimeout(() => pwInput.focus(), 50);
    });
  }

  function setPwBusy(busy) {
    pwSubmit.disabled = busy;
    pwSubmit.textContent = t(busy ? "pwWorking" : "pwSubmit");
    pwInput.disabled = busy;
    pwConfirm.disabled = busy;
  }

  function finishPassword(result) {
    if (!pwRequest) return;
    const { resolve } = pwRequest;
    pwRequest = null;
    pwInput.value = "";
    pwConfirm.value = "";
    closeOverlay(pwSheet);
    resolve(result);
  }

  pwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!pwRequest || pwSubmit.disabled) return;
    const pw = pwInput.value;
    if (pw.length < 8) { pwError.textContent = t("pwTooShort"); return; }
    if (pwRequest.mode === "create" && pw !== pwConfirm.value) { pwError.textContent = t("pwMismatch"); return; }
    pwError.textContent = "";
    setPwBusy(true);
    try {
      if (await pwRequest.submit(pw)) { finishPassword("ok"); return; }
      pwError.textContent = t("pwWrong");
    } catch (err) {
      console.error(err);
      pwError.textContent = t("syncError");
    }
    setPwBusy(false);
    pwInput.select();
  });
  $("#pwCancel").addEventListener("click", () => finishPassword("cancel"));
  pwForgot.addEventListener("click", () => finishPassword("forgot"));
  {
    let downOnBackdrop = false;
    pwSheet.addEventListener("pointerdown", (e) => { downOnBackdrop = e.target === pwSheet; });
    pwSheet.addEventListener("click", (e) => {
      if (e.target === pwSheet && downOnBackdrop && !pwSubmit.disabled) finishPassword("cancel");
      downOnBackdrop = false;
    });
  }

  // ---------------------------------------------------------------------------
  // Language switch
  // ---------------------------------------------------------------------------
  const langSwitch = $("#langSwitch");

  // Static markup declares its text with data-i18n* attributes.
  function applyStaticText() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  }

  function buildLangSwitch() {
    langSwitch.replaceChildren();
    for (const code of Object.keys(LANGS)) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(code === lang));
      b.lang = code;
      b.textContent = LANGS[code].name;
      b.addEventListener("click", () => setLanguage(code));
      langSwitch.appendChild(b);
    }
  }

  function setLanguage(code) {
    if (code === lang || !LANGS[code]) return;
    // Entries still carrying a preset's original title follow the language;
    // anything the user renamed is left alone.
    let changed = false;
    for (const item of items) {
      const p = findPreset(item.title);
      if (p && item.title !== presetTitle(p, code)) {
        item.title = presetTitle(p, code);
        changed = true;
      }
    }
    lang = code;
    try { localStorage.setItem(LANG_KEY, code); } catch (_) {}
    if (changed) save();
    applyStaticText();
    buildLangSwitch();
    buildPresetChips();
    render();
    updateBanner();
    renderSync();
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  const stored = load();
  items = stored || seedPresets();
  tombstones = loadTombstones();
  if (stored) lastSaved = snapshotOf(items);
  save(); // writes seeds on first launch and upgrades older records in place

  applyStaticText();
  buildLangSwitch();
  buildEmojiGrid();
  buildPresetChips();
  render();
  updateBanner();
  requestPersistence();
  if (syncEnabled()) {
    setSyncView({ state: "connecting" });
    loadSync().catch(() => {});
  } else {
    renderSync();
  }

  // Offline support. Service workers need HTTPS (or localhost).
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
