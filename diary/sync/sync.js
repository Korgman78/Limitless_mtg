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
 * Usage :
 *   node diary/sync/sync.js [log]           rejeu unique, puis sortie
 *   node diary/sync/sync.js --watch [log]   rejeu puis surveillance continue
 */

const fs = require('fs');
const path = require('path');

const DiaryCollector = require('./diary-collector');
const {
  createMatchTracker,
  feedParsedLine,
  readBasicLandIds,
} = require('./match-tracker');
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

/**
 * Logs a rejouer, du plus ancien au plus recent.
 *
 * Arena fait tourner son log a chaque redemarrage : le fichier courant repart
 * de zero et l'ancien devient Player-prev.log. Un draft joue avant le dernier
 * lancement n'a donc plus ni draft-start ni picks dans Player.log, alors que sa
 * course et ses matchs, eux, continuent d'y passer. Rejouer les deux fichiers
 * dans l'ordre reconstruit le pool avant d'arriver au log courant.
 *
 * L'ecriture etant idempotente, repasser sur du deja-synchronise ne coute que
 * du temps de lecture.
 */
function findLogPaths(override) {
  if (override) return [override];

  const current = findLogPath();
  const previous = path.join(path.dirname(current), 'Player-prev.log');

  return fs.existsSync(previous) ? [previous, current] : [current];
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
  const args = process.argv.slice(2);
  const watch = args.includes('--watch');
  const logPaths = findLogPaths(args.find((a) => !a.startsWith('--')));
  const logPath = logPaths[logPaths.length - 1];

  for (const p of logPaths) console.log(`Log   : ${p}`);

  // Le parser surveille le log COURANT ; les fichiers precedents ne sont que
  // rejoues, ligne par ligne, dans la meme instance pour que l'etat de draft
  // (set courant, pack en cours) traverse la rotation.
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

  // Rempli au fil du scan ; le deck n'est ecrit qu'a la vidange de la file,
  // donc la table est complete au moment ou le collecteur en a besoin.
  const basicLandIds = new Map();

  const collector = new DiaryCollector({
    supabaseUrl: url,
    supabaseKey: key,
    resolveCardName,
    basicLandIds,
  });

  // Les pools drafts viennent de la base avant toute lecture : c'est ce qui
  // permet de rattacher une course ou un match a un draft que plus aucun log
  // ne decrit.
  await collector.rehydratePools();

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

  // Execute les taches en attente, dans l'ordre du log.
  const drain = async () => {
    while (queue.length) {
      const task = queue.shift();
      await task();
    }
  };

  // Le parser est bavard : on le tait pendant le rejeu, on garde nos traces.
  const chatty = console.log;
  console.log = () => {};

  // Filtre bon marche avant le JSON.parse : ces messages sont volumineux et
  // representent la majorite du fichier.
  const feedMatchLine = (line) => {
    if (
      !line.includes('reservedPlayers') &&
      !line.includes('finalMatchResult') &&
      !line.includes('gameObjects')
    ) {
      return;
    }

    const brace = line.indexOf('{');
    if (brace < 0) return;

    let payload;
    try {
      payload = JSON.parse(line.slice(brace));
    } catch {
      return;
    }

    readBasicLandIds(payload, basicLandIds);

    const finished = feedParsedLine(matchTracker, payload);
    if (finished) {
      queue.push(async () =>
        collector.onMatchComplete(finished, await metaForEvent(finished.eventName)),
      );
    }
  };

  for (const file of logPaths) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      parser.parseLine(line);
      feedMatchLine(line);
    }
  }

  console.log = chatty;

  console.log(`Taches : ${queue.length}`);
  await drain();

  if (!watch) {
    console.log('Synchro terminee.');
    return;
  }

  // --- Surveillance continue -----------------------------------------------
  // Le rejeu ci-dessus a deja tout rattrape ; seules les nouvelles lignes sont
  // traitees ensuite. parser.start() se positionne en fin de fichier et gere la
  // troncature quand Arena redemarre.
  console.log('Surveillance du log active. Ferme cette fenetre pour arreter.');

  parser.on('raw-line', feedMatchLine);

  // Les taches arrivent en continu : on vide la file peu apres chaque rafale,
  // sans jamais lancer deux vidanges en parallele.
  let draining = false;
  const scheduleDrain = () => {
    if (draining) return;
    draining = true;
    setTimeout(async () => {
      try {
        await drain();
      } finally {
        draining = false;
      }
    }, 500);
  };

  for (const event of ['draft-start', 'pack-opened', 'card-picked', 'courses-update']) {
    parser.on(event, scheduleDrain);
  }
  parser.on('raw-line', scheduleDrain);

  parser.start();
}

main().catch((err) => {
  console.error('ECHEC :', err.message);
  process.exit(1);
});
