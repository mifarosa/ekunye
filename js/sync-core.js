// Sync building blocks with no Firebase dependency: end-to-end encryption and
// the merge between the local list and the copy in the cloud. js/sync.js wires
// them to Firestore.

export const PBKDF2_ITERATIONS = 600000;
const LAST = Number.MAX_SAFE_INTEGER; // sorts entries with no position to the end
const CHECK_TEXT = "ekunye";

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < view.length; i += 0x8000) bin += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

// AES-256-GCM key from the sync password. Non-extractable, so it can be kept
// in IndexedDB without the raw key ever being readable by script.
export async function deriveKey(password, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// `aad` ties a ciphertext to where it is stored (user and entry id), so a
// record cannot be copied into another slot and still decrypt.
export async function encryptJSON(key, value, aad) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    key,
    enc.encode(JSON.stringify(value)),
  );
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptJSON(key, { iv, ct }, aad) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv), additionalData: enc.encode(aad) },
    key,
    fromB64(ct),
  );
  return JSON.parse(dec.decode(plain));
}

export const makeCheck = (key, uid) => encryptJSON(key, { check: CHECK_TEXT }, `${uid}/check`);

// False for a wrong password: AES-GCM refuses to decrypt with the wrong key.
export async function verifyCheck(key, check, uid) {
  try {
    const value = await decryptJSON(key, check, `${uid}/check`);
    return value && value.check === CHECK_TEXT;
  } catch (_) {
    return false;
  }
}

// Merges the local list with the cloud copy, entry by entry; the newer
// `updatedAt` wins, and deletions travel as tombstones.
//   local:      [{ id, emoji, title, value, hidden, updatedAt }] in list order
//   tombstones: { id: deletedAt }
//   remote:     Map id -> { updatedAt, deleted, data?: { emoji, title, value, hidden, pos } }
//   firstLink:  true the first time this device joins this account; untouched
//               empty starter entries that the account already has are dropped
//               instead of being uploaded as duplicates.
// Returns { items, tombstones, changed, push } where push lists the ids whose
// local version is newer than the cloud's.
export function reconcile({ local, tombstones, remote, firstLink, normalize }) {
  const localById = new Map(local.map((item, pos) => [item.id, { item, pos }]));
  const tomb = { ...tombstones };

  const drop = new Set();
  if (firstLink) {
    const remoteTitles = new Set();
    for (const r of remote.values()) if (!r.deleted && r.data) remoteTitles.add(r.data.title);
    for (const item of local) {
      if (!remote.has(item.id) && !item.value.trim() && remoteTitles.has(item.title)) drop.add(item.id);
    }
  }

  const ids = new Set([...localById.keys(), ...Object.keys(tomb), ...remote.keys()]);
  const merged = [];
  const push = [];

  for (const id of ids) {
    if (drop.has(id)) continue;
    const L = localById.get(id);
    const R = remote.get(id);
    const localTs = L ? L.item.updatedAt : tomb[id] || 0;

    if (R && R.updatedAt > localTs) {
      if (R.deleted) {
        tomb[id] = R.updatedAt;
        continue;
      }
      const item = normalize({ ...R.data, id, updatedAt: R.updatedAt });
      if (!item) continue;
      delete tomb[id];
      merged.push({ item, pos: Number.isFinite(R.data.pos) ? R.data.pos : L ? L.pos : LAST, order: L ? L.pos : LAST });
    } else {
      if (L) merged.push({ item: L.item, pos: L.pos, order: L.pos });
      if ((L || tomb[id]) && (!R || R.updatedAt < localTs)) push.push(id);
    }
  }

  merged.sort((a, b) => a.pos - b.pos || a.order - b.order);
  const items = merged.map((m) => m.item);
  const changed =
    JSON.stringify(items) !== JSON.stringify(local) || JSON.stringify(tomb) !== JSON.stringify(tombstones);
  return { items, tombstones: tomb, changed, push };
}
