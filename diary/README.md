# MTG Training Diary

Journal d'entraînement Limited, en trois onglets :

- **Journal** — bilan de l'extension en cours (assiduité, cadran de win rate,
  trophées) puis une entrée par draft/sealed : score, phase de pick, deck (avec
  versions), matchs joués et commentaires qualitatifs.
- **Statistiques** — win rate et son évolution, trophées et trophy rate,
  archétypes (joués ou affrontés, au choix), table de matchups et cartes les
  plus pickées.
- **Rapport hebdo** — synthèse IA hebdomadaire du journal.

**Tous les contrôles vivent dans la barre latérale** — extensions, filtres,
semaines, création d'entrée. La zone principale ne contient que des cartes de
données, jamais de barre d'outils : c'est ce qui tient le langage visuel
debout. Conséquence assumée : l'état d'interface des trois onglets est porté
par `App.tsx`, pas par chaque vue.

Projet **indépendant de Limitless** — front séparé, port séparé — mais qui
partage le même projet Supabase (tables préfixées `diary_*`) et réutilise la
logique pure de Limitless via l'alias Vite `@limitless`.

## Mise en place

**Une seule fois, sur le projet Supabase** : exécuter `sql/001_diary_schema.sql`
puis `sql/002_matches.sql` dans le SQL Editor.

**Sur un nouveau poste** : cloner le dépôt, double-cliquer sur `diary.bat`.

Il prend en charge le reste tout seul, une seule fois :

- **Node absent** → il propose de l'installer via `winget` (livré avec
  Windows 11). Il faut relancer le `.bat` après, le temps que le PATH soit à jour.
- **Pas de config** → il demande l'URL Supabase et la clé anon, puis écrit
  `diary/.env`. Ce fichier est gitignoré : il ne voyage jamais avec le dépôt,
  c'est voulu.
- **Dépendances manquantes** → `npm install` automatique.

Ensuite, chaque double-clic sur `diary.bat` :

1. relit le `Player.log` pour rattraper ce qui a été joué depuis la dernière fois,
2. lance une surveillance continue dans une fenêtre réduite — les drafts et
   matchs joués pendant que l'app est ouverte remontent tout seuls,
3. ouvre le journal dans le navigateur.

Le `Player.log` est trouvé automatiquement, y compris sur la version Steam.

`diary-sync.bat` fait la synchro seule, sans ouvrir l'app. Il **n'a besoin que
de Node** : ni `npm install`, ni l'overlay. Tout ce qu'il lui faut est versionné
dans `sync/` et n'utilise que des modules natifs (`fetch` global, `chokidar`
chargé uniquement par le watcher).

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
├── tailwind.config.js         # tokens du thème (papier, encre, vert, ombres)
└── src/
    ├── App.tsx                # coquille + état d'interface des trois onglets
    ├── index.css              # classes composants (.card, .pill-*, .btn-*…)
    ├── constants.ts           # formats et sections de commentaire
    ├── queries/               # hooks React Query + mutations
    └── components/
        ├── Sidebar.tsx        # colonne de gauche + blocs contextuels
        ├── ui.tsx             # CardTitle, ErrorBox — partagés par les vues
        ├── DiaryView.tsx      # onglet Journal : bilan + flux d'entrées
        ├── WinRateDial.tsx    # cadran de WR (0-100 % sur un tour complet)
        ├── ActivityGrid.tsx   # heatmap d'assiduité, 14 semaines
        ├── StatsView.tsx      # onglet Statistiques
        ├── StatsFilters.tsx   # filtres de périmètre, rendus dans la sidebar
        ├── WinRateChart.tsx   # courbe de WR cumulé
        ├── WeeklyReportView.tsx # onglet Rapport hebdo
        ├── EventCard.tsx      # une entrée : score, récaps, dépliage
        ├── MatchesPanel.tsx   # matchs, adversaires, score en parties
        ├── PickPanel.tsx      # revue de picks pack par pack
        ├── NewEventForm.tsx   # création (deck + pool sealed)
        ├── DeckPanel.tsx      # deck + bascule entre versions
        ├── DeckScorePanel.tsx # score et suggestions, moteur "Test my deck"
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
      archétypes comparés au métagame, matchups, cartes les plus pickées.
- [x] **5. Synthèse LLM hebdo** — `backend/etl_diary_weekly.py` (Gemini),
      déclenché par `.github/workflows/diary_weekly.yaml`.
- [x] **6. Refonte UX** — thème papier, vert de marque, barre latérale de
      contrôles. Voir « Langage visuel ».

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
- Les **terrains de base n'existent dans aucun `card_list`** : leur arena_id
  dépend de l'illustration possédée par le joueur. Le log est la seule source
  qui les identifie, via `subtypes` sur les objets de jeu — d'où
  `readBasicLandIds()`. Sans ça un deck s'enregistre amputé de ses 17 terrains.
- Le log vit dans `%USERPROFILE%\AppData\LocalLow\...` sur les builds Steam et
  standalone.
- Arena **fait tourner son log a chaque redemarrage** : le fichier courant
  repart de zero et l'ancien devient `Player-prev.log`. Un draft joue avant le
  dernier lancement n'a donc plus ni `draft-start` ni picks dans le log courant,
  alors que sa course et ses matchs, eux, continuent d'y passer. C'est le piege
  qui fait qu'un draft en cours cesse silencieusement de se synchroniser : sans
  picks, pas de pool, donc plus aucun rattachement possible. Deux parades, les
  deux en place : le rejeu couvre `Player-prev.log` puis `Player.log` dans le
  meme parser, et `DiaryCollector.rehydratePools()` recharge les pools depuis
  `diary_picks` avant toute lecture.

## Langage visuel

Style « papier » : encre noire sur crème quadrillé, bordures pleines de 2 px,
ombres dures sans flou. Tout est piloté par des tokens — `tailwind.config.js`
pour les couleurs, ombres et rayons, `src/index.css` pour la quinzaine de
classes composants (`.card`, `.card-tint`, `.well`, `.plate`, `.pill-*`,
`.btn-*`, `.field`). Un changement d'apparence se fait là, pas dans les
composants.

Les classes de `index.css` sont écrites **à plat**, sans `@apply` de l'une sur
l'autre : Tailwind résout mal les composants qui s'appliquent entre eux, et un
build cassé coûte plus cher que quelques déclarations répétées.

**Le vert `#10B981` est décliné en quatre rôles**, parce qu'un seul ton saturé
ne tient pas sur de grandes surfaces de crème :

| Token | Valeur | Rôle |
|---|---|---|
| `brand-wash` | `#EFF9F3` | blocs internes, listes |
| `brand-soft` | `#DFF3E7` | lavis des cartes héros |
| `brand` | `#10B981` | remplissage de signal (CTA, barres, jauges) |
| `brand-ink` | `#05614A` | texte et états actifs sur lavis |

Le noir se pose sur `brand`, jamais le blanc (≈ 9:1 contre 2,5:1).

**Plaques sombres** (`.plate`) : les visuels de cartes Magic et `CmcStack` sont
dessinés pour du fond noir, le crème les délave. On assume une insertion sombre
bordée comme le reste, plutôt que de redessiner un composant partagé.

**Graphes** : la courbe est tracée à l'encre `#141310`, l'aire sous la courbe en
`brand-soft`, les marqueurs en `brand` cerclés d'encre. Une ligne verte sur
crème perdrait en lisibilité ce qu'elle gagnerait en cohérence. Le seuil 50 %
est en pointillés — un seuil n'est pas une grille.

Dans le cadran (`WinRateDial`), l'échelle 0–100 % tombe juste sur un tour
complet : **50 % est exactement le demi-tour**, le seuil de rentabilité se lit
sans annotation. Son `viewBox` déborde volontairement du cercle : le curseur est
centré *sur* le rayon, sans marge il se fait rogner à 0, 25, 50 et 75 %.

## Score du deck

Bouton **« Voir le score du deck »** dans le panneau deck. Il appelle
`analyzeDeckText` puis `scoreDeckAnalysis` de
`src/utils/analyzeDeckPipeline.ts` — le moteur exact de « Test my deck », via
l'edge function `deck-analysis`. Rien n'est recalculé côté diary.

Note sur 100 : 50 % puissance des cartes, 25 % couverture des core cards, 15 %
équilibre créatures, 10 % adéquation de courbe. Les suggestions de coupes et
d'ajouts viennent de `lowSynergyCards` / `potentialAdds` du même résultat.

**Le deck enregistré doit contenir sa réserve.** `potentialAdds` ne pioche que
dans `parsedDeck.sideboardCards` : sans section `Sideboard`, l'analyse n'a aucun
candidat et ne propose jamais rien à ajouter. En Limited la réserve, c'est le
reste du pool drafté — le collecteur l'écrit depuis `CourseDeck.Sideboard`.

Le rendu est propre au diary : le panneau vit dans une carte d'événement, pas
dans une modale plein écran comme Test my deck. Seule la présentation diffère,
les seuils (55 solide, 72 trophée) et les pondérations sont ceux de Limitless.

## Archétypes : deux règles, volontairement différentes

Un archétype se déduit des cartes, jamais des terrains — une bicolore pose
volontiers un terrain de sa couleur de splash.

**Adversaire** (`sync/match-tracker.js`) : on ne voit qu'un échantillon de son
deck au fil des parties. Une couleur y est principale à partir de **4 cartes
vues** ; en dessous c'est un splash. Seuil absolu, parce que voir 4 cartes d'une
couleur est déjà un signal fort.

**Ton deck** (`src/utils/archetype.ts`) : on a la liste complète, le même seuil
absolu y désignerait un splash comme couleur principale. Vérifié sur un cas
réel : deux cartes bicolores UW en deux exemplaires faisaient passer un deck UB
pour du WUB, alors que sa base de mana ne comportait aucun Plains. La règle est
donc **relative** — les deux couleurs dominantes, plus une troisième seulement
si elle atteint 80 % du compte de la deuxième.

Les deux fichiers se citent mutuellement : toucher l'un sans l'autre rendrait la
table de matchups incohérente.

## Comparaison au métagame

Chaque archétype joué affiche le WR de ce même archétype **dans le format**, lu
dans `archetype_stats`, et l'écart signé entre les deux. C'est la seule
comparaison qui situe un résultat : 60 % sur un archétype qui en fait 64 n'est
pas la même nouvelle que 60 % sur un archétype à 54.

**Piège de raccord, vérifié en base, ne pas re-supposer** : `archetype_stats`
trie ses couleurs **alphabétiquement** (`BU`, `GRW`, `UW`), là où le diary trie
en ordre WUBRG (`UB`, `WRG`, `WU`). Sans recanonicalisation des deux côtés,
aucune clé ne tombe juste — et l'échec est silencieux, la colonne affiche
simplement « format — » partout. C'est le rôle de `metaKey()` dans
`queries/useStats.ts`. Le champ `colors` peut aussi porter un suffixe
`" + Splash"`, et plusieurs lignes retombent alors sur la même clé : on garde la
mieux échantillonnée.

Quand le périmètre mélange plusieurs extensions ou formats, la référence est
moyennée **au prorata de ce que tu y as réellement joué**.

Pas d'écart côté **archétypes affrontés** : ton WR *contre* un archétype et le
WR *de* cet archétype ne mesurent pas la même chose. Seule la référence brute
est affichée — elle dit si tu croises un archétype fort ou faible.

## Cartes les plus pickées

Décompte brut du nombre de fois où chaque carte a été pickée, top 16.

L'ancien tableau « cartes les plus jouées » calculait un WR par carte en lui
attribuant le score de l'événement entier : une carte présente dans un 7-1
héritait de 7 victoires, comme les 22 autres du deck. Le chiffre ne mesurait
rien et il a été retiré, avec la requête `card_stats` qui ne servait qu'à lui.

Les picks sont comptés sur **tous** les événements du périmètre, y compris ceux
sans score enregistré — ils ont été pickés quand même. Un événement sealed ou un
draft joué sans l'overlay n'a aucun pick en base.

## Trophées et BO3

Un trophée n'est pas 7 victoires partout : en Traditional (BO3) la course
s'arrête à **3-0**. Le seuil vit dans `TROPHY_WINS` (`src/constants.ts`).

Sur les formats BO3, les stats affichent **deux mailles** : le WR en matchs et
le WR en parties. Un 2-1 en matchs peut cacher un 5-4 en parties.

## Limites connues

- Le pool sealed se colle à la main : Arena ne le logue pas de façon exploitable.
- Pas de mode hors-ligne, la base est distante.
- Node reste un prérequis, même si `diary.bat` sait l'installer. Pour s'en
  affranchir complètement il faudrait un exécutable autonome (Node SEA), publié
  en Release GitHub — non fait.
- Un match dont le draft est sorti de la fenêtre du log n'est rattaché à rien :
  en dessous de 60 % de recouvrement on préfère l'ignorer plutôt que de
  l'attribuer au mauvais événement. Le pool, lui, survit à la rotation du log
  puisqu'il est rechargé depuis la base — seuls les drafts jamais synchronisés
  une première fois sont définitivement perdus.
- Une version de deck n'est ajoutée que si sa liste exacte n'existe pas déjà
  pour l'événement. Comparer à la seule dernière version rejouerait tout
  l'historique de build à chaque relance de la synchro. Contrepartie : un
  rebuild qui revient exactement à une liste déjà jouée ne crée pas de version.
- `ArenaDirect_Sealed` est traité comme du BO1 (seuil 7) faute de l'avoir
  vérifié — à corriger dans `TROPHY_WINS` si besoin.
