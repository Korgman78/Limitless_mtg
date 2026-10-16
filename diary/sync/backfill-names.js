#!/usr/bin/env node
/**
 * Complete les noms de cartes manquants des picks deja en base.
 *
 * Pourquoi ce script existe : la synchro traduit les grpId d'Arena en noms via
 * card_list.arena_id. Si populate_arena_ids.py n'a pas encore tourne sur le
 * set (cas de FRA a sa sortie), les picks sont ecrits avec `name: null` et le
 * front n'a plus de quoi afficher les images. Relancer la synchro ne rattrape
 * que les drafts encore presents dans le Player.log ; ce script repare les
 * autres a partir de l'arena_id, conserve dans chaque pick.
 *
 * N'ecrit que les picks dont au moins un nom a ete resolu. Relancer ne fait
 * rien de plus.
 *
 * Usage :
 *   node diary/sync/backfill-names.js SET [--dry-run]
 */

const { readEnv } = require('./sync');

async function main() {
  const args = process.argv.slice(2);
  const setCode = args.find((a) => !a.startsWith('--'))?.toUpperCase();
  const dryRun = args.includes('--dry-run');
  if (!setCode) throw new Error('Usage : node diary/sync/backfill-names.js SET [--dry-run]');

  const { url, key } = readEnv();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  async function request(pathAndQuery, init = {}) {
    const response = await fetch(`${url}/rest/v1/${pathAndQuery}`, { headers, ...init });
    if (!response.ok) {
      throw new Error(`${pathAndQuery.split('?')[0]} ${response.status}: ${await response.text()}`);
    }
    return response.status === 204 ? null : response.json();
  }

  const cards = await request(
    `card_list?set_code=eq.${setCode}&arena_id=not.is.null&select=card_name,arena_id`,
  );
  const names = new Map(cards.map((c) => [c.arena_id, c.card_name]));
  if (!names.size) {
    throw new Error(`Aucun arena_id pour ${setCode} : lancer d'abord populate_arena_ids.py ${setCode}`);
  }

  const events = await request(
    `diary_events?set_code=eq.${setCode}&select=id,diary_picks(id,picked_arena_id,picked_card,pack_cards)`,
  );

  let updated = 0;
  let stillMissing = 0;

  for (const event of events) {
    for (const pick of event.diary_picks ?? []) {
      let changed = false;

      const packCards = (pick.pack_cards ?? []).map((card) => {
        if (card.name || !names.has(card.arenaId)) return card;
        changed = true;
        return { ...card, name: names.get(card.arenaId) };
      });

      let pickedCard = pick.picked_card;
      if (!pickedCard && names.has(pick.picked_arena_id)) {
        pickedCard = names.get(pick.picked_arena_id);
        changed = true;
      }

      stillMissing += packCards.filter((c) => !c.name).length + (pickedCard ? 0 : 1);
      if (!changed) continue;

      updated += 1;
      if (dryRun) continue;

      await request(`diary_picks?id=eq.${pick.id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ picked_card: pickedCard, pack_cards: packCards }),
      });
    }
  }

  console.log(
    `${setCode} : ${events.length} evenement(s), ${updated} pick(s) ` +
      `${dryRun ? 'a mettre a jour (dry run)' : 'mis a jour'}, ` +
      `${stillMissing} nom(s) toujours introuvable(s).`,
  );
}

main().catch((err) => {
  console.error('ECHEC :', err.message);
  process.exit(1);
});
