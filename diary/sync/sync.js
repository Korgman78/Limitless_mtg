#!/usr/bin/env node
/**
 * Synchronise le Player.log d'Arena vers le Training Diary, en une passe.
 *
 * Pourquoi ce script existe : le collecteur tourne normalement dans l'overlay
 * Electron, mais l'overlay est une dependance lourde pour quelque chose qui ne
 * fait que lire un fichier. Si tu as drafte sans l'overlay lance, tu perds tout.
 * Ici tu rattrapes apres coup, tant que le draft est encore dans le log.
 *
 * L'ecriture est idempotente : draft_id unique sur les evenements, contrainte
 * unique (event_id, pack, pick) sur les picks. Relancer ne duplique rien.
 *
 * Usage :  node diary/sync/sync.js [chemin/vers/Player.log]
 */

const fs = require('fs');
const path = require('path');

const DiaryCollector = require('./diary-collector');
const { createMatchTracker, feedParsedLine } = require('./match-tracker');
const LogParser = require('./log-parser');

const ROOT = path.resolve(__dirname, '..', '..');

// ─── Configuration ───────────────────────────────────────────────────────────

function readEnv() {
  const candidates = [
    path.join(ROOT, 'diary', '.env'),
    path.join(ROOT, '.env'),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;

    const cfg = {};
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) cfg[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }

    const url = cfg.VITE_SUPABASE_URL || cfg.SUPABASE_URL;
    const key = cfg.VITE_SUPABASE_KEY || cfg.SUPABASE_KEY;
    if (url && key) return { url, key };
  }

  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_KEY introuvables (diary/.env)');
}

function findLogPath(override) {
  if (override) return override;

  const candidates = [
    // LocalLow : emplacement Unity standard, builds Steam et standalone.
    path.join(process.env.USERPROFILE || '', 'AppData', 'LocalLow',
      'Wizards Of The Coast', 'MTGA', 'Player.log'),
    path.join(process.env.LOCALAPPDATA || '', 'Packages',
      'WizardsOfTheCoast.MagicTheGatheringArena_pa3s0fap88e66',
      'LocalCache', 'Local', 'Wizards Of The Coast', 'MTGA', 'Player.log'),
    path.join(process.env.LOCALAPPDATA || '',
      'Wizards Of The Coast', 'MTGA', 'Player.log'),
  ];

  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(`Player.log introuvable. Essayes :\n  ${candidates.join('\n  ')}`);
  }
  return found;
}

// ─── Resolution des noms de cartes ───────────────────────────────────────────

async function loadCardMeta(url, key, setCode) {
  const response = await fetch(
    `${url}/rest/v1/card_list?set_code=eq.${setCode}` +
      '&select=card_name,arena_id,colors,card_type',
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!response.ok) throw new Error(`card_list ${response.status}`);

  const map = new Map();
  for (const row of await response.json()) {
    if (!row.arena_id) continue;
    map.set(row.arena_id, {
      name: row.card_name,
      colors: row.colors,
      type: row.card_type,
    });
  }
  return map;
}

// ─── Rejeu ───────────────────────────────────────────────────────────────────

async function main() {
  const { url, key } = readEnv();
  const logPath = findLogPath(process.argv[2]);

  console.log(`Log   : ${logPath}`);
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');

  const parser = new LogParser(logPath);

  // Les noms de cartes dependent du set, connu seulement apres le premier
  // EventJoin. On collecte d'abord, on resout ensuite.
  const nameCache = new Map();
  const resolveCardName = async (arenaId, setCode) => {
    const code = setCode || parser.currentDraft?.setCode;
    if (!code) return null;
    if (!nameCache.has(code)) nameCache.set(code, await loadCardMeta(url, key, code));
    return nameCache.get(code).get(arenaId)?.name ?? null;
  };

  const collector = new DiaryCollector({
    supabaseUrl: url,
    supabaseKey: key,
    resolveCardName,
  });

  // Le parser emet en synchrone alors que le collecteur ecrit en asynchrone :
  // on met les taches en file pour les executer dans l'ordre du log.
  const queue = [];
  parser.on('draft-start', (d) => queue.push(() => collector.onDraftStart(d)));
  parser.on('pack-opened', (d) =>
    queue.push(async () => {
      const cards = [];
      for (const card of d.cards) {
        cards.push({ arenaId: card.arenaId, name: await resolveCardName(card.arenaId, d.setCode) });
      }
      collector.registerPack(d.packNumber, d.pickNumber, cards);
    }),
  );
  parser.on('card-picked', (d) =>
    queue.push(() =>
      collector.onCardPicked({
        arenaId: d.arenaId,
        packNumber: d.packNumber,
        pickNumber: d.pickNumber,
      }),
    ),
  );
  parser.on('courses-update', (c) => queue.push(() => collector.onCoursesUpdate(c)));

  // Les matchs vivent dans des messages que le LogParser ne regarde pas : on
  // les suit en parallele, en poussant dans la MEME file pour que l'ordre du
  // log soit respecte — un match doit etre traite apres le draft qui l'a arme.
  const matchTracker = createMatchTracker();

  const metaForEvent = async (eventName) => {
    const code = (eventName || '').match(/_([A-Z0-9]{3})_/)?.[1];
    if (!code) return new Map();
    if (!nameCache.has(code)) nameCache.set(code, await loadCardMeta(url, key, code));
    return nameCache.get(code);
  };

  // Le parser est bavard : on le tait pendant le rejeu, on garde nos traces.
  const chatty = console.log;
  console.log = () => {};

  for (const line of lines) {
    parser.parseLine(line);

    // Filtre bon marche avant le JSON.parse : ces messages sont volumineux et
    // representent la majorite du fichier.
    if (
      !line.includes('reservedPlayers') &&
      !line.includes('finalMatchResult') &&
      !line.includes('gameObjects')
    ) {
      continue;
    }

    const brace = line.indexOf('{');
    if (brace < 0) continue;

    let payload;
    try {
      payload = JSON.parse(line.slice(brace));
    } catch {
      continue;
    }

    const finished = feedParsedLine(matchTracker, payload);
    if (finished) {
      queue.push(async () =>
        collector.onMatchComplete(finished, await metaForEvent(finished.eventName)),
      );
    }
  }

  console.log = chatty;

  console.log(`Taches : ${queue.length}\n`);
  for (const task of queue) await task();

  console.log('\nSynchro terminee.');
}

main().catch((err) => {
  console.error('ECHEC :', err.message);
  process.exit(1);
});
