// Field types: which keyboard an entry gets, how its value is tidied up on
// save, and a light check whose warning never blocks saving.
(() => {
  "use strict";

  const TYPES = ["text", "longText", "phone", "email", "number", "iban", "tcId", "date", "blood"];
  const BLOOD = ["A Rh+", "A Rh−", "B Rh+", "B Rh−", "AB Rh+", "AB Rh−", "0 Rh+", "0 Rh−"];

  const digits = (s) => s.replace(/\D/g, "");
  const compact = (s) => s.replace(/\s+/g, "");

  const INPUT = {
    text: { inputMode: "text" },
    longText: { inputMode: "text", multiline: true },
    phone: { inputMode: "tel", autocapitalize: "off" },
    email: { inputMode: "email", autocapitalize: "off" },
    number: { inputMode: "numeric" },
    iban: { inputMode: "text", autocapitalize: "characters" },
    tcId: { inputMode: "numeric" },
    date: { inputMode: "numeric" },
    blood: { inputMode: "text", autocapitalize: "characters" },
  };
  const input = (type) => INPUT[type] || INPUT.text;

  function ibanValid(value) {
    const s = compact(value).toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    if (s.startsWith("TR") && s.length !== 26) return false;
    let rest = 0;
    for (const ch of s.slice(4) + s.slice(0, 4)) {
      const part = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
      for (const d of part) rest = (rest * 10 + Number(d)) % 97;
    }
    return rest === 1;
  }

  // Turkish national ID: 11 digits, no leading zero, two check digits.
  function tcIdValid(value) {
    const s = compact(value);
    if (!/^[1-9]\d{10}$/.test(s)) return false;
    const n = [...s].map(Number);
    const odd = n[0] + n[2] + n[4] + n[6] + n[8];
    const even = n[1] + n[3] + n[5] + n[7];
    if ((((odd * 7 - even) % 10) + 10) % 10 !== n[9]) return false;
    return n.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === n[10];
  }

  function dateValid(value) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
    if (!m) return false;
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(y, mo - 1, d);
    return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
  }

  // "A+", "a rh +", "O-" and similar become "A Rh+" / "0 Rh−".
  function normalizeBlood(value) {
    const m = /^\s*(AB|A|B|0|O)\s*(?:RH)?\s*([+\-−]|POS|NEG|POZ)/i.exec(value);
    if (!m) return value.trim();
    const group = m[1].toUpperCase() === "O" ? "0" : m[1].toUpperCase();
    const sign = /^(\+|POS|POZ)$/i.test(m[2]) ? "+" : "−";
    return `${group} Rh${sign}`;
  }

  function formatPhone(value) {
    if (/[^\d\s+()\-.]/.test(value)) return value; // leave anything unusual as typed
    let d = digits(value);
    if (d.length === 12 && d.startsWith("90")) d = d.slice(2);
    else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    else if (d.length !== 10 || d.startsWith("0")) return value;
    const local = `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
    return value.trim().startsWith("+") ? `+90 ${local}` : `0${local}`;
  }

  // Tidies a value on save; unknown shapes are kept exactly as typed.
  function format(type, value) {
    const v = value.trim();
    if (!v) return v;
    switch (type) {
      case "phone":
        return formatPhone(v);
      case "email":
        return compact(v);
      case "iban": {
        const s = compact(v).toUpperCase();
        return /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s) ? s.replace(/(.{4})(?=.)/g, "$1 ") : v;
      }
      case "tcId":
        return /^[\d\s]+$/.test(v) ? digits(v) : v;
      case "date": {
        const d = digits(v);
        return /^[\d.\s/-]+$/.test(v) && d.length === 8 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}` : v;
      }
      case "blood":
        return normalizeBlood(v);
      default:
        return v;
    }
  }

  // While typing: dots for dates, capitals for IBANs.
  function mask(type, value) {
    if (type === "date" && /^[\d.]*$/.test(value)) {
      const d = digits(value).slice(0, 8);
      return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join(".");
    }
    if (type === "iban") return value.toUpperCase();
    return value;
  }

  // Returns a warning key for the language files, or null when it looks fine.
  function problem(type, value) {
    const v = format(type, value);
    if (!v) return null;
    switch (type) {
      case "phone": {
        const n = digits(v).length;
        return n >= 7 && n <= 15 ? null : "warnPhone";
      }
      case "email":
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : "warnEmail";
      case "number":
        return /^[\d\s-]+$/.test(v) ? null : "warnNumber";
      case "iban":
        return ibanValid(v) ? null : "warnIban";
      case "tcId":
        return tcIdValid(v) ? null : "warnTcId";
      case "date":
        return dateValid(v) ? null : "warnDate";
      default:
        return null;
    }
  }

  const api = { TYPES, BLOOD, input, format, mask, problem, ibanValid, tcIdValid, dateValid, normalizeBlood };
  if (typeof window !== "undefined") window.EKUNYE_FIELDS = api;
  if (typeof module !== "undefined") module.exports = api;
})();
