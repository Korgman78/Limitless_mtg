# MTG Training Diary

Journal d'entraînement Limited, en trois onglets :

- **Diary** — une entrée par draft/sealed : score, phase de pick, deck (avec
  versions), matchs joués et commentaires qualitatifs. Le sélecteur d'extension
  et la création d'entrée vivent ici.
- **Stats** — win rate global et son évolution, filtres format/extension,
  archétypes affrontés, cartes les plus jouées et écarts 17Lands.
- **Rapport hebdo** — synthèse IA hebdomadaire du journal.

Projet **indépendant de Limitless** — front séparé, port séparé — mais qui
partage le même projet Supabase (tables préfixées `diary_*`) et réutilise la
logique pure de Limitless via l'alias Vite `@limitless`.

## Mise en place

**Une seule fois, sur le projet Supabase** : exécuter `sql/001_diary_schema.sql`
puis `sql/002_matches.sql` dans le SQL Editor.

**Sur chaque poste** :

1. Installer [Node.js](https://nodejs.org) s'il n'y est pas.
2. Cloner le dépôt.
3. Copier `diary/.env.example` vers `diary/.env` et y mettre
   `VITE_SUPABASE_URL` et `VITE_SUPABASE_KEY` (mêmes valeurs que Limitless).
   Ce fichier est gitignoré : il ne voyage pas avec le dépôt, c'est voulu.
4. Double-cliquer sur `diary.bat` — il installe les dépendances au premier
   lancement, puis ouvre l'app.

Les deux `.bat` vérifient Node et le `.env` et expliquent quoi faire s'il
manque quelque chose.

**`diary-sync.bat` n'a besoin de rien d'autre que Node** : ni `npm install`,
ni l'overlay. Tout ce qu'il lui faut est versionné dans `sync/`, et il
n'utilise que des modules natifs (le `fetch` global de Node, `chokidar` chargé
uniquement par l'overlay). Un poste peut donc se contenter de collecter.

## Lancement

Double-clic sur `diary.bat` à la racine du repo, ou :

```bash
cd diary
npm run dev
```

Le navigateur s'ouvre sur <http://localhost:5174> (Limitless reste sur 5173,
les deux peuvent tourner en même temps).

La fenêtre de terminal doit rester ouverte : c'est elle qui héberge le serveur.

**Accès depuis le téléphone** (même wifi, PC allumé) :
`npm run dev -- --host`, puis ouvrir `http://<ip-du-pc>:5174`.

## Sécurité

Outil perso. La clé anon Supabase est publique par nature (inlinée dans le
bundle Vite), donc RLS est activé avec des policies ouvertes en lecture et en
écriture.

La seule protection réelle : **aucune policy `DELETE` sur `diary_events` et
`diary_notes`**. Ces deux tables portent le contenu irremplaçable, la
suppression y passe par `deleted_at` (soft delete). Les tables re-générables
(picks, pool, versions de deck, rapports) autorisent le `DELETE` pour permettre
les corrections.

## Autonomie vis-à-vis de l'overlay

`arena-overlay/` est gitignoré : il n'existe pas dans un clone frais. Le parser
de log, le collecteur et le suivi des matchs vivent donc dans `diary/sync/`,
qui est versionné — c'est l'overlay qui les importe de là, et non l'inverse.

Conséquence : `diary-sync.bat` fonctionne sur n'importe quel poste ayant Arena
et Node. L'overlay n'apporte que la collecte en temps réel pendant le draft.

## Réutilisation du code Limitless

`@limitless/*` pointe vers `../src/*`. **N'importer que des modules sans
dépendance React** — aujourd'hui `utils/deckAnalysisCore.ts` (`parseMtgaDeck`)
et à terme `utils/helpers.ts` (`calculateGrade`).

`tailwind.config.js` inclut ces fichiers dans son `content` : `calculateGrade()`
renvoie des chaînes de classes Tailwind qui ne seraient pas générées sinon.

## Structure

```
diary/
├── sql/001_diary_schema.sql   # schéma + RLS
└── src/
    ├── App.tsx                # navigation à trois onglets, rien d'autre
    ├── constants.ts           # formats et sections de commentaire
    ├── queries/               # hooks React Query + mutations
    └── components/
        ├── DiaryView.tsx      # onglet Diary : extensions, création, liste
        ├── StatsView.tsx      # onglet Stats
        ├── WeeklyReportView.tsx # onglet Rapport hebdo
        ├── EventCard.tsx      # une entrée : score, récaps, dépliage
        ├── MatchesPanel.tsx   # matchs, adversaires, score en parties
        ├── PickPanel.tsx      # revue de picks pack par pack
        ├── NewEventForm.tsx   # création (deck + pool sealed)
        ├── DeckPanel.tsx      # deck + bascule entre versions
        └── NotesEditor.tsx    # sections qualitatives, save au blur
```

## Feuille de route

- [x] **1. Schéma + journal manuel** — créer une entrée, coller le deck, noter
      le score, remplir les sections.
- [x] **2. Collecteur overlay** — `arena-overlay/src/diary-collector.js` écrit
      picks, score et deck au fil de l'eau. Voir « Ce que le log contient ».
- [x] **3. Revue visuelle des picks** — pack par pack, langage visuel de Draft
      Practice, decks en piles de CMC via `CmcStack`.
- [x] **4. Onglet stats** — WR global et évolution, filtres format/extension,
      cartes les plus jouées et écarts 17Lands.
- [x] **5. Synthèse LLM hebdo** — `backend/etl_diary_weekly.py` (Gemini),
      déclenché par `.github/workflows/diary_weekly.yaml`.

## Rapport hebdomadaire

Généré chaque lundi 07:00 UTC par le workflow **Diary Weekly Report**, qui
couvre la semaine écoulée complète. La clé Gemini reste dans les secrets du
dépôt — elle ne touche jamais le navigateur, contrairement à ce qui se
passerait avec un appel depuis le front.

Pour générer une semaine à la demande : onglet Actions du dépôt → *Diary Weekly
Report* → *Run workflow*, avec un lundi au format `YYYY-MM-DD` (vide = semaine
écoulée). Relancer une semaine déjà traitée la remplace (upsert sur
`week_start`).

Le prompt reçoit les données brutes de la semaine — scores, matchs, adversaires,
commentaires, cartes jouées avec leur GIH 17Lands — et il lui est explicitement
demandé de ne pas présenter comme une tendance ce qui n'apparaît qu'une fois, ni
de traiter l'écart 17Lands comme une mesure.

## Ce que le log Arena contient (vérifié, ne pas re-supposer)

- `DraftStatus`/`Complete` **n'apparaît jamais** → l'événement `draft-end` ne se
  déclenche pas. D'où l'écriture au fil de l'eau, un upsert par pick.
- Le score et le deck construit vivent dans une charge `{"Courses":[...]}`, pas
  dans les événements de draft. **`CourseId` n'est pas le `draftId`** : le
  rattachement se fait par recouvrement du deck avec le pool drafté (89-91 %
  pour la bonne paire contre 8-16 %, seuil à 60 %).
- Arena **omet le champ quand la valeur vaut 0** : un 0-1 est logué avec
  `CurrentWins` absent.
- Les matchs vivent dans `matchGameRoomStateChangedEvent` :
  `reservedPlayers` (noms, `systemSeatId`, `teamId`) et `finalMatchResult.resultList`
  (une entrée `MatchScope_Game` par partie, puis `MatchScope_Match`). C'est la
  seule source du score en parties, invisible dans le score de la course.
- Les cartes jouées par chacun sont dans
  `greToClientEvent.greToClientMessages[].gameStateMessage.gameObjects`
  (`grpId` = arena_id, `ownerSeatId` = siège). Les cartes adverses donnent son
  archétype ; les miennes rattachent le match au bon draft et identifient mon
  siège — le log ne relie aucun match à un draft autrement.
- Vérification croisée sur un log réel : les couleurs déduites des cartes
  correspondent aux terrains de base joués (UB/UB, BR/BR, WR/WR…).
- Le log vit dans `%USERPROFILE%\AppData\LocalLow\...` sur les builds Steam et
  standalone.

## Couleurs des graphes

Validées avec `validate_palette.js` contre la surface `#0f172a` :
série `#3987e5`, écarts `#34d399` / `#f43f5e` (CVD deutan ΔE 12.0). L'écart
porte toujours son signe et une flèche — la couleur ne véhicule jamais seule
l'information.

## Trophées et BO3

Un trophée n'est pas 7 victoires partout : en Traditional (BO3) la course
s'arrête à **3-0**. Le seuil vit dans `TROPHY_WINS` (`src/constants.ts`).

Sur les formats BO3, les stats affichent **deux mailles** : le WR en matchs et
le WR en parties. Un 2-1 en matchs peut cacher un 5-4 en parties.

## Limites connues

- Le pool sealed se colle à la main : Arena ne le logue pas de façon exploitable.
- Pas de mode hors-ligne, la base est distante.
- Un match dont le draft est sorti de la fenêtre du log n'est rattaché à rien :
  en dessous de 60 % de recouvrement on préfère l'ignorer plutôt que de
  l'attribuer au mauvais événement.
- `ArenaDirect_Sealed` est traité comme du BO1 (seuil 7) faute de l'avoir
  vérifié — à corriger dans `TROPHY_WINS` si besoin.
