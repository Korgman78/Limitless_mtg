// ─── Draft Practice : défi partageable ("Share with a friend") ────────────────
// Tout l'état d'un défi tient dans l'URL — aucune écriture en base. Le pod à
// rejouer est déjà chez tout le monde dans `trophy_draft_picks`, donc le lien ne
// transporte que : le set, l'id du pod, le mode de jeu, et les CHOIX du joueur
// qui partage (index de l'option prise à chaque pick + quelles cartes il a
// gardées dans son deck + ses terres de base). Les noms de cartes, les stats et
// les scores ne voyagent pas : chaque client les recalcule à l'identique.
//
// Le payload est binaire compact puis base64url, placé dans le FRAGMENT (#) :
// un fragment n'est jamais envoyé au serveur et survit au déploiement statique.
//
// Format (version 1) — ~78 octets pour un joueur, soit ~105 caractères :
//   [0]      version
//   [1]      flags : bit0 = mode (0 blind, 1 coached), bit1 = id du pod packé hex
//   [2]      longueur du set, puis N octets ASCII
//   [..]     id du pod : 16 octets si packé hex, sinon longueur + ASCII
//   [..]     nombre de participants (1 aujourd'hui : le partageur)
//   par participant :
//     longueur du pseudo + pseudo UTF-8
//     nombre de picks, puis 1 octet par pick :
//       bits 0-6 = index de l'option choisie, bit 7 = carte gardée dans le deck
//     5 octets : terres de base W U B R G
//   [..2]    checksum FNV-1a tronqué (détecte un lien tronqué/collé de travers)
// ─────────────────────────────────────────────────────────────────────────────

const VERSION = 1;
const MAX_ENTRANTS = 8;
const MAX_PICKS = 127;
const MAX_NAME_LEN = 24;
const COLORS: readonly string[] = ['W', 'U', 'B', 'R', 'G'];

/** Paramètre de fragment portant le défi : #dp=<payload> */
export const CHALLENGE_PARAM = 'dp';
/** Même payload, mais partagé en lecture seule : #dr=<payload> */
export const RESULT_PARAM = 'dr';

/**
 * Deux usages du même token :
 *  - `challenge` : "rejoue ce pod et bats-moi" → l'ami drafte.
 *  - `result`    : "voilà mon draft" → le visiteur atterrit sur l'écran final,
 *                  picks et decks déjà reconstitués, sans rien drafter.
 */
export type SharedDraftKind = 'challenge' | 'result';

export interface SharedDraft {
  kind: SharedDraftKind;
  challenge: DraftChallenge;
}

export type ChallengeMode = 'blind' | 'coached';

export interface ChallengeEntrant {
  name: string;
  /** Index de l'option choisie, aligné sur la séquence de picks du pod. */
  pickIdx: number[];
  /** Pour chaque pick : la carte a-t-elle été gardée dans le deck final. */
  inDeck: boolean[];
  /** Terres de base par couleur (W/U/B/R/G). */
  basics: Record<string, number>;
}

export interface DraftChallenge {
  set: string;
  /** `aggregate_id` du pod dans `trophy_draft_picks`. */
  aggregateId: string;
  mode: ChallengeMode;
  /** Participants déjà présents dans le lien (aujourd'hui : le partageur). */
  entrants: ChallengeEntrant[];
}

// ─── octets ↔ base64url ──────────────────────────────────────────────────────

const toBase64Url = (bytes: number[]): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (token: string): number[] | null => {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return [...bin].map((ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
};

const checksum = (bytes: number[]): number => {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h & 0xffff;
};

const isPackableId = (id: string) => /^[0-9a-f]{32}$/i.test(id);

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

// ─── encode ──────────────────────────────────────────────────────────────────

/** Sérialise un défi en token base64url (retourne '' si le défi est invalide). */
export function encodeChallenge(challenge: DraftChallenge): string {
  const { set, aggregateId, mode, entrants } = challenge;
  if (!set || !aggregateId || entrants.length === 0) return '';

  const bytes: number[] = [];
  const packedId = isPackableId(aggregateId);
  bytes.push(VERSION);
  bytes.push((mode === 'coached' ? 1 : 0) | (packedId ? 2 : 0));

  const setBytes = [...new TextEncoder().encode(set.slice(0, 12))];
  bytes.push(setBytes.length, ...setBytes);

  if (packedId) {
    for (let i = 0; i < 32; i += 2) bytes.push(parseInt(aggregateId.slice(i, i + 2), 16));
  } else {
    const idBytes = [...new TextEncoder().encode(aggregateId)].slice(0, 255);
    bytes.push(idBytes.length, ...idBytes);
  }

  const kept = entrants.slice(0, MAX_ENTRANTS);
  bytes.push(kept.length);
  for (const e of kept) {
    const nameBytes = [...new TextEncoder().encode(e.name.slice(0, MAX_NAME_LEN))];
    bytes.push(nameBytes.length, ...nameBytes);
    const n = Math.min(e.pickIdx.length, MAX_PICKS);
    bytes.push(n);
    for (let i = 0; i < n; i++) {
      const optIdx = Math.max(0, Math.min(MAX_PICKS, Math.round(e.pickIdx[i] ?? 0)));
      bytes.push(optIdx | (e.inDeck[i] ? 0x80 : 0));
    }
    for (const c of COLORS) bytes.push(clampByte(e.basics?.[c] ?? 0));
  }

  const sum = checksum(bytes);
  bytes.push(sum & 0xff, (sum >> 8) & 0xff);
  return toBase64Url(bytes);
}

// ─── decode ──────────────────────────────────────────────────────────────────

/** Parse un token de défi. Retourne null si illisible, tronqué ou corrompu. */
export function decodeChallenge(token: string): DraftChallenge | null {
  const bytes = fromBase64Url(token.trim());
  if (!bytes || bytes.length < 8) return null;

  const body = bytes.slice(0, -2);
  const expected = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
  if (checksum(body) !== expected) return null;

  let p = 0;
  const readByte = (): number => {
    if (p >= body.length) throw new Error('truncated');
    return body[p++];
  };
  const readBytes = (n: number): number[] => {
    if (p + n > body.length) throw new Error('truncated');
    const out = body.slice(p, p + n);
    p += n;
    return out;
  };
  const decoder = new TextDecoder();

  try {
    if (readByte() !== VERSION) return null;
    const flags = readByte();
    const mode: ChallengeMode = flags & 1 ? 'coached' : 'blind';
    const packedId = (flags & 2) !== 0;

    const set = decoder.decode(new Uint8Array(readBytes(readByte())));
    const aggregateId = packedId
      ? readBytes(16).map((b) => b.toString(16).padStart(2, '0')).join('')
      : decoder.decode(new Uint8Array(readBytes(readByte())));

    const entrantCount = readByte();
    if (entrantCount < 1 || entrantCount > MAX_ENTRANTS) return null;

    const entrants: ChallengeEntrant[] = [];
    for (let e = 0; e < entrantCount; e++) {
      const name = decoder.decode(new Uint8Array(readBytes(readByte())));
      const n = readByte();
      const pickIdx: number[] = [];
      const inDeck: boolean[] = [];
      for (const raw of readBytes(n)) {
        pickIdx.push(raw & 0x7f);
        inDeck.push((raw & 0x80) !== 0);
      }
      const basics: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
      const basicBytes = readBytes(COLORS.length);
      COLORS.forEach((c, i) => { basics[c] = basicBytes[i]; });
      entrants.push({ name, pickIdx, inDeck, basics });
    }

    if (!set || !aggregateId) return null;
    return { set, aggregateId, mode, entrants };
  } catch {
    return null;
  }
}

// ─── URL ─────────────────────────────────────────────────────────────────────

const buildUrl = (param: string, challenge: DraftChallenge): string => {
  const token = encodeChallenge(challenge);
  if (!token) return '';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${param}=${token}`;
};

/** Lien "rejoue ce pod et bats-moi" à envoyer à un ami. */
export function buildChallengeUrl(challenge: DraftChallenge): string {
  return buildUrl(CHALLENGE_PARAM, challenge);
}

/** Lien "voilà mon draft" : ouvre directement l'écran final en lecture seule. */
export function buildResultUrl(challenge: DraftChallenge): string {
  return buildUrl(RESULT_PARAM, challenge);
}

// Le token est lu UNE fois au chargement du module : `useUrlState` réécrit l'URL
// (replaceState sans fragment) dès le premier rendu de App et effacerait le
// token avant qu'on ait pu le consommer.
const initialShared: SharedDraft | null = (() => {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  for (const [param, kind] of [
    [CHALLENGE_PARAM, 'challenge'],
    [RESULT_PARAM, 'result'],
  ] as const) {
    const token = params.get(param);
    if (!token) continue;
    const challenge = decodeChallenge(token);
    return challenge ? { kind, challenge } : null;
  }
  return null;
})();

/** Défi ou résultat présent dans l'URL au chargement de la page (null sinon). */
export function readSharedDraftFromUrl(): SharedDraft | null {
  return initialShared;
}

/** Retire le token du fragment sans recharger (après consommation). */
export function clearSharedDraftFromUrl(): void {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return;
  const params = new URLSearchParams(hash);
  if (!params.has(CHALLENGE_PARAM) && !params.has(RESULT_PARAM)) return;
  params.delete(CHALLENGE_PARAM);
  params.delete(RESULT_PARAM);
  const rest = params.toString();
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ''}`,
  );
}
