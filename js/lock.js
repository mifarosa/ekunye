// App lock: a 6-digit PIN, and optionally the device's own Face ID or
// fingerprint (through WebAuthn), asked on launch and after the app has been
// in the background for a while. It keeps the list from whoever picks up the
// phone. The stored data is not encrypted with the PIN: a short PIN could be
// guessed offline anyway, and sync already encrypts what leaves the device.
(() => {
  "use strict";

  const LOCK_KEY = "bilgilerim.lock"; // { v, salt, iter, hash, cred? }
  const FAILS_KEY = "bilgilerim.lock.fails"; // { count, until }
  const PIN_LENGTH = 6;
  const ITERATIONS = 150000;
  const RELOCK_AFTER = 60 * 1000; // time in the background before locking again
  const FREE_TRIES = 5; // wrong PINs allowed before waiting kicks in
  const WAIT_BASE = 30 * 1000;
  const WAIT_MAX = 15 * 60 * 1000;

  const enc = new TextEncoder();
  const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

  async function hashPin(pin, salt, iterations) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, 256);
    return toB64(new Uint8Array(bits));
  }

  async function makeRecord(pin) {
    const salt = randomBytes(16);
    return { v: 1, salt: toB64(salt), iter: ITERATIONS, hash: await hashPin(pin, salt, ITERATIONS) };
  }

  const checkPin = async (record, pin) => (await hashPin(pin, fromB64(record.salt), record.iter)) === record.hash;

  // Waiting time after `count` wrong PINs: none for the first few, then
  // doubling from 30 seconds up to 15 minutes.
  const waitFor = (count) => (count < FREE_TRIES ? 0 : Math.min(WAIT_MAX, WAIT_BASE * 2 ** (count - FREE_TRIES)));

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (_) { return null; }
  }
  function writeJSON(key, value) {
    try { value ? localStorage.setItem(key, JSON.stringify(value)) : localStorage.removeItem(key); } catch (_) {}
  }

  async function bioAvailable() {
    try {
      return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch (_) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Controller. `ui` gives the lock the app's text, toasts and confirm dialog.
  // ---------------------------------------------------------------------------
  function start(ui) {
    const { t } = ui;
    const $ = (id) => document.getElementById(id);
    const screen = $("lockScreen");
    const titleEl = $("lockTitle");
    const textEl = $("lockText");
    const dotsEl = $("lockDots");
    const errorEl = $("lockError");
    const padEl = $("lockPad");
    const forgotBtn = $("lockForgot");
    const cancelBtn = $("lockCancel");
    const cardText = $("lockCardText");
    const cardPrimary = $("lockPrimary");
    const cardSecondary = $("lockSecondary");
    const bioRow = $("lockBioRow");
    const bioInput = $("lockBioInput");

    const supported = !!(window.isSecureContext && window.crypto && crypto.subtle);
    let record = readJSON(LOCK_KEY);
    let canBio = false;
    let locked = false;
    let hiddenAt = null;
    let request = null; // the PIN prompt on screen: { resolve, check, counts, bio }
    let entry = "";
    let busy = false;
    let waitTimer = null;

    // -------------------------------------------------------------------------
    // Keypad
    // -------------------------------------------------------------------------
    const bioIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4H5a1 1 0 0 0-1 1v2M17 4h2a1 1 0 0 1 1 1v2M7 20H5a1 1 0 0 1-1-1v-2M17 20h2a1 1 0 0 0 1-1v-2"/><path d="M9 10v1M15 10v1M12 10v3h-1M9.5 16c1.5 1 3.5 1 5 0"/></svg>';
    const backIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6H9l-5 6 5 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1Z"/><path d="m16 10-4 4M12 10l4 4"/></svg>';
    let bioKey = null;
    let backKey = null;

    function buildPad() {
      padEl.replaceChildren();
      const key = (label, cls, onClick) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `lock-key ${cls || ""}`.trim();
        b.innerHTML = label;
        b.addEventListener("click", onClick);
        padEl.appendChild(b);
        return b;
      };
      for (const d of "123456789") key(d, "", () => press(d));
      bioKey = key(bioIcon, "icon", () => tryBio());
      key("0", "", () => press("0"));
      backKey = key(backIcon, "icon", () => press("back"));
      labelPad();
    }

    function labelPad() {
      if (!bioKey) return;
      bioKey.setAttribute("aria-label", t("lockBio"));
      backKey.setAttribute("aria-label", t("lockBackspace"));
    }

    function drawDots() {
      dotsEl.replaceChildren();
      for (let i = 0; i < PIN_LENGTH; i++) {
        const dot = document.createElement("span");
        if (i < entry.length) dot.className = "on";
        dotsEl.appendChild(dot);
      }
    }

    async function press(key) {
      if (!request || busy || waitLeft() > 0) return;
      if (key === "back") entry = entry.slice(0, -1);
      else if (entry.length < PIN_LENGTH) entry += key;
      if (key !== "back") errorEl.textContent = "";
      drawDots();
      if (entry.length < PIN_LENGTH) return;

      busy = true;
      const req = request;
      const ok = await req.check(entry);
      busy = false;
      if (request !== req) return; // replaced while checking
      if (ok) {
        if (req.counts) writeJSON(FAILS_KEY, null);
        finish("ok");
        return;
      }
      entry = "";
      drawDots();
      dotsEl.classList.remove("shake");
      void dotsEl.offsetWidth; // restart the animation
      dotsEl.classList.add("shake");
      if (navigator.vibrate) navigator.vibrate(60);
      if (req.counts) {
        const fails = readJSON(FAILS_KEY) || { count: 0, until: 0 };
        fails.count += 1;
        fails.until = Date.now() + waitFor(fails.count);
        writeJSON(FAILS_KEY, fails);
      }
      showWaitOr(t("lockWrong"));
    }

    function waitLeft() {
      if (!request || !request.counts) return 0;
      const fails = readJSON(FAILS_KEY);
      return fails ? Math.max(0, fails.until - Date.now()) : 0;
    }

    // Shows the countdown while wrong PINs are being throttled, else `message`.
    function showWaitOr(message) {
      clearInterval(waitTimer);
      const tick = () => {
        const left = waitLeft();
        padEl.classList.toggle("waiting", left > 0);
        if (left > 0) errorEl.textContent = t("lockWait", Math.ceil(left / 1000));
        else {
          clearInterval(waitTimer);
          errorEl.textContent = message || "";
          message = "";
        }
      };
      tick();
      if (waitLeft() > 0) waitTimer = setInterval(tick, 1000);
    }

    document.addEventListener("keydown", (e) => {
      if (!request) return;
      let handled = true;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Escape" && request.cancel) finish("cancel");
      else handled = e.key !== "Tab" && e.key !== "Enter" && e.key !== " "; // keep the page behind inert
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    // -------------------------------------------------------------------------
    // Prompt: shows the PIN screen and resolves to "ok", "cancel" or "forgot".
    //   check(pin) -> true when the PIN is accepted
    //   counts: wrong PINs count towards the waiting time
    // -------------------------------------------------------------------------
    function prompt({ title, text, check, counts = false, cancel = false, forgot = false, bio = false }) {
      if (request) finish("cancel");
      return new Promise((resolve) => {
        request = { resolve, check, counts, cancel, bio };
        entry = "";
        titleEl.textContent = title;
        textEl.textContent = text || "";
        textEl.hidden = !text;
        forgotBtn.hidden = !forgot;
        cancelBtn.hidden = !cancel;
        bioKey.classList.toggle("off", !bio);
        bioKey.disabled = !bio;
        drawDots();
        showWaitOr("");
        screen.hidden = false;
        document.body.classList.add("locked");
        screen.focus({ preventScroll: true }); // digits can be typed; Tab reaches the keys
      });
    }

    function finish(result) {
      if (!request) return;
      const { resolve } = request;
      request = null;
      entry = "";
      clearInterval(waitTimer);
      screen.hidden = true;
      if (!document.querySelector(".overlay.open")) document.body.classList.remove("locked");
      resolve(result);
    }

    forgotBtn.addEventListener("click", () => finish("forgot"));
    cancelBtn.addEventListener("click", () => finish("cancel"));

    // -------------------------------------------------------------------------
    // Face ID / fingerprint through a platform passkey. There is no server to
    // check the signature; the device's own user check is what unlocks.
    // -------------------------------------------------------------------------
    async function enrollBio() {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: randomBytes(32),
          rp: { name: "E-Künye" },
          user: { id: randomBytes(16), name: t("lockPasskeyName"), displayName: t("lockPasskeyName") },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
          attestation: "none",
          timeout: 60000,
        },
      });
      return toB64(new Uint8Array(cred.rawId));
    }

    async function tryBio() {
      if (!request || !request.bio || !record || !record.cred || busy) return;
      busy = true;
      const req = request;
      try {
        await navigator.credentials.get({
          publicKey: {
            challenge: randomBytes(32),
            allowCredentials: [{ type: "public-key", id: fromB64(record.cred) }],
            userVerification: "required",
            timeout: 60000,
          },
        });
        busy = false;
        if (request !== req) return;
        if (req.counts) writeJSON(FAILS_KEY, null);
        finish("ok");
      } catch (_) {
        busy = false; // cancelled or not recognised: the PIN still works
      }
    }

    // -------------------------------------------------------------------------
    // Locking
    // -------------------------------------------------------------------------
    async function lockNow() {
      if (!record || locked) return;
      locked = true;
      document.documentElement.classList.add("app-locked");
      const hasBio = canBio && !!record.cred;
      const shown = prompt({
        title: t("lockTitle"),
        text: t("lockEnterPin"),
        check: (pin) => checkPin(record, pin),
        counts: true,
        forgot: true,
        bio: hasBio,
      });
      if (hasBio) tryBio(); // some browsers want a tap first; the key stays for that
      const result = await shown;
      if (result === "forgot") {
        if (ui.confirm(t("lockForgotConfirm"))) return wipe();
        locked = false;
        return lockNow();
      }
      if (result !== "ok") { locked = false; return lockNow(); }
      locked = false;
      document.documentElement.classList.remove("app-locked");
    }

    // Forgotten PIN: the only way past the lock is to start over on this
    // device. The saved sync key goes too, so the sync password is needed to
    // bring the list back.
    function wipe() {
      const keep = new Set(["bilgilerim.lang", "bilgilerim.theme"]);
      try {
        for (const key of Object.keys(localStorage)) if (key.startsWith("bilgilerim.") && !keep.has(key)) localStorage.removeItem(key);
      } catch (_) {}
      const reload = () => location.reload();
      try {
        const req = indexedDB.deleteDatabase("ekunye-sync");
        req.onsuccess = req.onerror = req.onblocked = reload;
      } catch (_) {
        reload();
      }
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (record && hiddenAt !== null && Date.now() - hiddenAt >= RELOCK_AFTER) {
        hiddenAt = null;
        lockNow();
      }
    });

    // -------------------------------------------------------------------------
    // Settings card
    // -------------------------------------------------------------------------
    function setButton(btn, key, action) {
      btn.hidden = !key;
      if (!key) return;
      btn.textContent = t(key);
      btn.onclick = action;
    }

    function render() {
      labelPad();
      if (request && locked) {
        titleEl.textContent = t("lockTitle");
        textEl.textContent = t("lockEnterPin");
      }
      if (!supported) {
        cardText.textContent = t("lockUnavailable");
        setButton(cardPrimary, null);
        setButton(cardSecondary, null);
        bioRow.hidden = true;
        return;
      }
      if (!record) {
        cardText.textContent = t("lockOffText");
        setButton(cardPrimary, "lockTurnOn", turnOn);
        setButton(cardSecondary, null);
        bioRow.hidden = true;
      } else {
        cardText.textContent = t("lockOnText");
        setButton(cardPrimary, "lockChange", changePin);
        setButton(cardSecondary, "lockTurnOff", turnOff);
        bioRow.hidden = !canBio;
        bioInput.checked = !!record.cred;
      }
    }

    // Asks for a new PIN twice; resolves to the PIN or null when cancelled.
    async function choosePin() {
      let note = t("lockNewPinText");
      for (;;) {
        let first = "";
        let second = "";
        const a = await prompt({ title: t("lockNewPin"), text: note, cancel: true, check: async (pin) => { first = pin; return true; } });
        if (a !== "ok") return null;
        const b = await prompt({ title: t("lockConfirmPin"), cancel: true, check: async (pin) => { second = pin; return true; } });
        if (b !== "ok") return null;
        if (first === second) return first;
        note = t("lockMismatch");
      }
    }

    // Changing or removing the lock asks for the current PIN first, so an
    // unlocked phone left on a table cannot simply switch it off.
    const confirmCurrent = async () =>
      (await prompt({
        title: t("lockVerify"),
        cancel: true,
        counts: true,
        bio: canBio && !!record.cred,
        check: (pin) => checkPin(record, pin),
      })) === "ok";

    async function turnOn() {
      const pin = await choosePin();
      if (!pin) return;
      record = await makeRecord(pin);
      writeJSON(LOCK_KEY, record);
      writeJSON(FAILS_KEY, null);
      render();
      ui.toast(t("lockEnabled"));
    }

    async function changePin() {
      if (!(await confirmCurrent())) return;
      const pin = await choosePin();
      if (!pin) return;
      const cred = record.cred;
      record = await makeRecord(pin);
      if (cred) record.cred = cred;
      writeJSON(LOCK_KEY, record);
      render();
      ui.toast(t("lockChanged"));
    }

    async function turnOff() {
      if (!(await confirmCurrent())) return;
      record = null;
      writeJSON(LOCK_KEY, null);
      writeJSON(FAILS_KEY, null);
      render();
      ui.toast(t("lockDisabled"));
    }

    bioInput.addEventListener("change", async () => {
      if (!record) return;
      if (!bioInput.checked) {
        delete record.cred;
        writeJSON(LOCK_KEY, record);
        return;
      }
      try {
        record.cred = await enrollBio();
        writeJSON(LOCK_KEY, record);
      } catch (_) {
        bioInput.checked = false;
        ui.toast(t("lockBioFailed"));
      }
    });

    // -------------------------------------------------------------------------
    // Boot
    // -------------------------------------------------------------------------
    buildPad();
    render();
    if (record && !supported) {
      // Locked data but no way to check the PIN here: keep it covered.
      document.documentElement.classList.add("app-locked");
      screen.hidden = false;
      titleEl.textContent = t("lockTitle");
      textEl.textContent = t("lockUnavailable");
      padEl.hidden = true;
    } else if (record) {
      bioAvailable().then((ok) => { canBio = ok; render(); lockNow(); });
    } else {
      document.documentElement.classList.remove("app-locked");
      bioAvailable().then((ok) => { canBio = ok; render(); });
    }

    return { render, isLocked: () => locked };
  }

  const api = { PIN_LENGTH, hashPin, makeRecord, checkPin, waitFor, start };
  if (typeof window !== "undefined") window.EKUNYE_LOCK = api;
  if (typeof module !== "undefined") module.exports = api;
})();
