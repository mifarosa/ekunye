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
//   keyOf:      title -> language-independent preset id (or null), so
//               "Ev adresi" and "Home address" count as the same field.
//   now:        timestamp for deletions made while removing duplicates.
// Returns { items, tombstones, changed, push } where push lists the ids whose
// local version is newer than the cloud's.
export function reconcile({ local, tombstones, remote, firstLink, normalize, keyOf = () => null, now = Date.now() }) {
  const fieldKey = (title) => keyOf(title) || `title:${title}`;
  const localById = new Map(local.map((item, pos) => [item.id, { item, pos }]));
  const tomb = { ...tombstones };

  const drop = new Set();
  if (firstLink) {
    const remoteFields = new Set();
    for (const r of remote.values()) if (!r.deleted && r.data) remoteFields.add(fieldKey(r.data.title));
    for (const item of local) {
      if (!remote.has(item.id) && !item.value.trim() && remoteFields.has(fieldKey(item.title))) drop.add(item.id);
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
  let items = merged.map((m) => m.item);

  // Clean up duplicates of the same field, e.g. left over from two devices
  // that started in different languages. Only copies that add nothing are
  // removed: empty ones next to a filled one, or exact repeats. The survivor
  // is picked by id so every device removes the same copies.
  const removed = findDuplicates(items, fieldKey);
  if (removed.size) {
    items = items.filter((item) => !removed.has(item.id));
    for (const id of removed) {
      tomb[id] = Math.max(now, (localById.get(id)?.item.updatedAt || 0) + 1, (remote.get(id)?.updatedAt || 0) + 1);
      if (!push.includes(id)) push.push(id);
    }
  }

  const changed =
    JSON.stringify(items) !== JSON.stringify(local) || JSON.stringify(tomb) !== JSON.stringify(tombstones);
  return { items, tombstones: tomb, changed, push };
}

export function findDuplicates(items, fieldKey) {
  const groups = new Map();
  for (const item of items) {
    const key = fieldKey(item.title);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const removed = new Set();
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const filled = group.filter((i) => i.value.trim());
    const empty = group.filter((i) => !i.value.trim()).sort(byId);
    // Empty copies go if the field is filled somewhere; otherwise keep one.
    empty.slice(filled.length ? 0 : 1).forEach((i) => removed.add(i.id));
    // Filled copies go only when they repeat the same value exactly.
    const seen = new Map();
    for (const item of [...filled].sort(byId)) {
      const sig = JSON.stringify([item.value.trim(), item.hidden]);
      if (seen.has(sig)) removed.add(item.id);
      else seen.set(sig, item.id);
    }
  }
  return removed;
}
