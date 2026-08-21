const fs = require('fs');
const EventEmitter = require('events');
const { parseCoursesLine } = require('./course-tracker');

// chokidar n'est charge qu'au demarrage du watcher, jamais par la synchro en
// ligne de commande. Cela permet de rejouer un log avec un `node` nu, sans
// aucune dependance installee — le cas d'un poste ou seul le diary est clone.
let chokidar = null;

/**
 * Parser pour les logs MTGA
 * Détecte les événements de draft en temps réel
 */
class LogParser extends EventEmitter {
  constructor(logPath) {
    super();
    this.logPath = logPath;
    this.watcher = null;
    this.lastPosition = 0;
    this.currentDraft = null;
    this.currentPool = [];      // [{arenaId, name, colors}]
    this.packHistory = [];      // [{packNumber, pickNumber, cards: [{name, colors, alsa}]}]
    this.buffer = '';
    this.pendingEventName = null; // EventName from EventJoin (ex: "PremierDraft_ECL_20260120")

    // État du commit
    this.commitState = {
      isCommitted: false,
      archetypeColors: null,     // Set(['W', 'U']) une fois commit
      consecutiveColors: null,   // Les 2 couleurs des picks consécutifs en cours
      consecutiveCount: 0,       // Nombre de picks consécutifs dans ces couleurs
      commitReason: null,        // 'consecutive' ou 'percentage'
    };
  }

  start() {
    if (!fs.existsSync(this.logPath)) {
      console.error(`[LogParser] Log file not found: ${this.logPath}`);
      return;
    }

    // Position initiale à la fin du fichier (ignorer l'historique)
    const stats = fs.statSync(this.logPath);
    this.lastPosition = stats.size;

    console.log(`[LogParser] Starting watch at position ${this.lastPosition}`);

    // Scanner les dernières lignes pour trouver un EventJoin récent
    this.scanForRecentEventJoin();

    // Watcher pour détecter les modifications
    if (!chokidar) chokidar = require('chokidar');
    this.watcher = chokidar.watch(this.logPath, {
      persistent: true,
      usePolling: true,
      interval: 250,
    });

    this.watcher.on('change', () => this.readNewContent());
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
  }

  readNewContent() {
    const stats = fs.statSync(this.logPath);

    // Le fichier a été tronqué (nouveau lancement d'Arena)
    if (stats.size < this.lastPosition) {
      console.log('[LogParser] Log file reset detected');
      this.lastPosition = 0;
      this.resetDraft();
    }

    // Lire les nouvelles données
    const stream = fs.createReadStream(this.logPath, {
      start: this.lastPosition,
      encoding: 'utf8',
    });

    stream.on('data', (chunk) => {
      this.buffer += chunk;
      this.processBuffer();
    });

    stream.on('end', () => {
      this.lastPosition = stats.size;
    });
  }

  processBuffer() {
    // Traiter ligne par ligne
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Garder la dernière ligne incomplète

    for (const line of lines) {
      this.parseLine(line);
      // Les matchs vivent dans des messages que parseLine ne regarde pas.
      // Cet evenement permet a la synchro de les suivre en direct, avec la
      // meme logique qu'en rejeu complet.
      this.emit('raw-line', line);
    }
  }

  parseLine(line) {
    // Ignorer les lignes vides
    if (!line.trim()) return;

    try {
      // --- EVENT JOIN (contient le set code) ---
      // [UnityCrossThreadLogger]==> EventJoin {"EventName":"PremierDraft_ECL_20260120",...}
      if (line.includes('EventJoin') && line.includes('EventName')) {
        const jsonMatch = line.match(/\{.*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          // Parser le request qui est un JSON stringifié
          if (data.request) {
            try {
              const request = JSON.parse(data.request);
              if (request.EventName && request.EventName.includes('Draft')) {
                this.pendingEventName = request.EventName;
                console.log('[LogParser] Event joined:', request.EventName);
              }
            } catch (e) {}
          }
        }
      }

      // --- DRAFT START ---
      // [UnityCrossThreadLogger] Draft.Notify {"draftId":"...","SelfSeat":...}
      if (line.includes('Draft.Notify') && line.includes('draftId')) {
        const jsonMatch = line.match(/\{.*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          this.handleDraftStart(data);
        }
      }

      // --- PACK OPENED ---
      // [UnityCrossThreadLogger] Draft.MakePick {"draftId":"...","PackCards":"..."}
      // Ou: DraftPack avec les cartes
      if (line.includes('DraftPack') || (line.includes('Draft.') && line.includes('PackCards'))) {
        const jsonMatch = line.match(/\{.*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          this.handlePackOpened(data);
        }
      }

      // --- CARD PICKED ---
      // Format principal: EventPlayerDraftMakePick avec GrpIds dans le request stringifié
      // Exemple: ==> EventPlayerDraftMakePick {"id":"...","request":"{\"DraftId\":\"...\",\"GrpIds\":[98339],\"Pack\":1,\"Pick\":1}"}
      if (line.includes('EventPlayerDraftMakePick') && line.includes('GrpIds')) {
        const jsonMatch = line.match(/\{.*\}/);
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[0]);

            // Le request est un JSON stringifié
            if (data.request) {
              const req = typeof data.request === 'string' ? JSON.parse(data.request) : data.request;

              // GrpIds est un array, prendre le premier élément
              if (req.GrpIds && req.GrpIds.length > 0) {
                const cardId = req.GrpIds[0];
                const packNumber = req.Pack;
                const pickNumber = req.Pick;

                console.log(`[LogParser] Real pick detected: ${cardId} (P${packNumber}P${pickNumber})`);
                this.handleCardPicked({
                  GrpId: cardId,
                  packNumber,
                  pickNumber,
                });
              }
            }
          } catch (e) {
            console.debug('[LogParser] Failed to parse EventPlayerDraftMakePick:', e.message);
          }
        }
      }

      // --- COURSES (score + deck construit) ---
      // Emis periodiquement par Arena, y compris hors draft. C'est la seule
      // source du score et du deck soumis.
      if (line.includes('{"Courses":')) {
        const courses = parseCoursesLine(line);
        if (courses) this.emit('courses-update', courses);
      }

      // --- DRAFT COMPLETE ---
      if (line.includes('DraftStatus') && line.includes('Complete')) {
        this.handleDraftEnd();
      }

      // --- HUMAN DRAFT SPECIFIC ---
      // LogBusinessEvents HumanDraft
      if (line.includes('HumanDraft') && line.includes('CardsInPack')) {
        const jsonMatch = line.match(/\{.*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          this.handleHumanDraftPack(data);
        }
      }

    } catch (err) {
      // Ignorer les erreurs de parsing (lignes mal formées)
      console.debug('[LogParser] Parse error:', err.message);
    }
  }

  handleDraftStart(data) {
    const newDraftId = data.draftId || data.Id;

    // Ne pas réinitialiser si c'est le même draft (Draft.Notify est émis à chaque pack)
    if (this.currentDraft && this.currentDraft.draftId === newDraftId) {
      console.log('[LogParser] Same draft, skipping reinit');
      return;
    }

    this.currentDraft = {
      draftId: newDraftId,
      setCode: this.extractSetCode(data),
      format: this.extractFormat(data),
      startTime: Date.now(),
    };
    this.currentPool = [];
    this.packHistory = [];

    // Reset commit state
    this.commitState = {
      isCommitted: false,
      archetypeColors: null,
      consecutiveColors: null,
      consecutiveCount: 0,
      commitReason: null,
    };

    this.emit('draft-start', this.currentDraft);
  }

  handlePackOpened(data) {
    if (!this.currentDraft) return;

    // Extraire les cartes du pack
    let cardIds = [];

    if (data.PackCards) {
      // Format: "12345,67890,..."
      cardIds = data.PackCards.split(',').map(id => parseInt(id.trim()));
    } else if (data.CardsInPack) {
      cardIds = Array.isArray(data.CardsInPack) ? data.CardsInPack : [];
    } else if (data.draftPack) {
      cardIds = Array.isArray(data.draftPack) ? data.draftPack : [];
    }

    if (cardIds.length === 0) return;

    const newPackNumber = data.PackNumber || data.SelfPack || 1;
    const newPickNumber = data.PickNumber || data.SelfPick || 1;

    // Stocker le pack/pick courant
    this.currentDraft.currentPackNumber = newPackNumber;
    this.currentDraft.currentPickNumber = newPickNumber;

    this.emit('pack-opened', {
      draftId: this.currentDraft.draftId,
      setCode: this.currentDraft.setCode,
      packNumber: newPackNumber,
      pickNumber: newPickNumber,
      cards: cardIds.map(id => ({ arenaId: id })),
    });
  }

  handleHumanDraftPack(data) {
    if (!this.currentDraft && data.SetCode) {
      // Initialiser le draft si pas encore fait
      this.handleDraftStart({
        draftId: `human-${Date.now()}`,
        SetCode: data.SetCode,
        DraftType: 'HumanDraft',
      });
    }

    const cardIds = data.CardsInPack || [];
    if (cardIds.length === 0) return;

    // Stocker le pack/pick courant
    if (this.currentDraft) {
      this.currentDraft.currentPackNumber = data.PackNumber || 1;
      this.currentDraft.currentPickNumber = data.PickNumber || 1;
    }

    this.emit('pack-opened', {
      draftId: this.currentDraft?.draftId,
      setCode: data.SetCode || this.currentDraft?.setCode,
      packNumber: data.PackNumber || 1,
      pickNumber: data.PickNumber || 1,
      cards: cardIds.map(id => ({ arenaId: id })),
    });
  }

  handleCardPicked(data) {
    if (!this.currentDraft) return;

    const cardId = data.GrpId || data.CardId;
    if (!cardId) return;

    // Récupérer pack/pick depuis data ou depuis currentDraft
    const packNumber = data.packNumber || this.currentDraft.currentPackNumber || 1;
    const pickNumber = data.pickNumber || this.currentDraft.currentPickNumber || 1;

    // Stocker avec structure étendue (name/colors seront ajoutés par main.js)
    this.currentPool.push({
      arenaId: cardId,
      name: null,
      colors: null,
      packNumber,
      pickNumber,
    });

    console.log(`[LogParser] Pool size: ${this.currentPool.length}, Commit state: ${this.commitState.consecutiveCount}/5`);

    this.emit('card-picked', {
      draftId: this.currentDraft.draftId,
      arenaId: cardId,
      packNumber,
      pickNumber,
      poolSize: this.currentPool.length,
    });
  }

  /**
   * Met à jour les infos d'une carte dans le pool (appelé après enrichissement)
   * @param {number} arenaId
   * @param {string} name
   * @param {string} colors
   * @param {Object} extraInfo - { cmc, type, packNumber, pickNumber }
   */
  updatePoolCard(arenaId, name, colors, extraInfo = {}) {
    const card = this.currentPool.find(c => c.arenaId === arenaId);
    if (card) {
      card.name = name;
      card.colors = colors;
      card.cmc = extraInfo.cmc;
      card.type = extraInfo.type;

      // Mettre à jour l'état de commit
      if (extraInfo.packNumber && extraInfo.pickNumber) {
        this.updateCommitState(colors, extraInfo.packNumber, extraInfo.pickNumber);
      }
    }
  }

  /**
   * Ajoute un pack à l'historique (pour l'analyse open colors)
   */
  addPackToHistory(packNumber, pickNumber, cards) {
    this.packHistory.push({
      packNumber,
      pickNumber,
      cards: cards.map(c => ({
        name: c.name,
        colors: c.colors,
        alsa: c.alsa,
      })),
    });
  }

  /**
   * Retourne l'historique des packs pour l'analyse open colors
   */
  getPackHistory() {
    return [...this.packHistory];
  }

  /**
   * Retourne les noms des cartes dans le pool
   */
  getPoolNames() {
    return this.currentPool
      .filter(c => c.name)
      .map(c => c.name);
  }

  /**
   * Retourne les couleurs du pool et l'archétype détecté
   */
  getPoolColors() {
    const colorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };

    for (const card of this.currentPool) {
      if (!card.colors) continue;
      for (const color of ['W', 'U', 'B', 'R', 'G']) {
        if (card.colors.includes(color)) {
          colorCounts[color]++;
        }
      }
    }

    return colorCounts;
  }

  /**
   * Détecte l'archétype basé sur les 2 couleurs les plus fréquentes
   * Retourne ex: "WU" ou null si pas assez de cartes
   */
  detectArchetype() {
    const colorCounts = this.getPoolColors();

    // Trier par count décroissant
    const sorted = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1]);

    // Besoin d'au moins 3 cartes dans chaque couleur pour détecter
    if (sorted[0][1] < 3 || sorted[1][1] < 3) {
      return null;
    }

    // Retourner les 2 couleurs principales (triées alphabétiquement pour consistance)
    const colors = [sorted[0][0], sorted[1][0]].sort().join('');
    return colors;
  }

  /**
   * Met à jour l'état de commit après un pick
   * Conditions de commit:
   * A) 5 picks consécutifs dans les mêmes 2 couleurs
   * B) 70% des cartes dans 2 couleurs à la fin du pack 1
   */
  updateCommitState(pickedCardColors, packNumber, pickNumber) {
    // Si déjà commit, ne rien faire
    if (this.commitState.isCommitted) return;

    console.log(`[LogParser] updateCommitState called with colors: "${pickedCardColors}", P${packNumber}P${pickNumber}`);

    // --- Condition A: 5 picks consécutifs ---
    if (pickedCardColors && pickedCardColors.length > 0) {
      const cardColorSet = new Set(pickedCardColors.split(''));

      // Ignorer les cartes incolores pour le tracking consécutif
      if (cardColorSet.size > 0 && !cardColorSet.has('C')) {
        if (this.commitState.consecutiveColors === null) {
          // Premier pick coloré, initialiser
          this.commitState.consecutiveColors = new Set(cardColorSet);
          this.commitState.consecutiveCount = 1;
          console.log(`[LogParser] First colored pick, starting track: ${[...cardColorSet].join('')}`);
        } else {
          // Vérifier si le pick est dans les mêmes couleurs (ou compatible)
          const currentColors = this.commitState.consecutiveColors;

          // Une carte est compatible si toutes ses couleurs sont dans le set actuel
          // OU si le set actuel a moins de 2 couleurs et on peut ajouter cette couleur
          const isInSameColors = [...cardColorSet].every(c => currentColors.has(c));
          const canExpand = currentColors.size < 2 || [...cardColorSet].some(c => currentColors.has(c));

          console.log(`[LogParser] Current colors: ${[...currentColors].join('')}, Card colors: ${[...cardColorSet].join('')}, isInSame: ${isInSameColors}, canExpand: ${canExpand}`);

          if (isInSameColors || (canExpand && currentColors.size < 2)) {
            // Ajouter les nouvelles couleurs si on a de la place
            if (currentColors.size < 2) {
              for (const c of cardColorSet) {
                if (currentColors.size < 2) {
                  currentColors.add(c);
                }
              }
            }
            this.commitState.consecutiveCount++;
            console.log(`[LogParser] Consecutive count: ${this.commitState.consecutiveCount}/5, colors: ${[...currentColors].join('')}`);

            // Vérifier si on a 5 picks consécutifs ET exactement 2 couleurs
            if (this.commitState.consecutiveCount >= 5 && currentColors.size === 2) {
              this.commitState.isCommitted = true;
              this.commitState.archetypeColors = currentColors;
              this.commitState.commitReason = 'consecutive';
              console.log(`[LogParser] COMMIT détecté (5 picks consécutifs): ${[...currentColors].sort().join('')}`);
            }
          } else {
            // Reset - le pick n'est pas dans les couleurs
            console.log(`[LogParser] Breaking consecutive streak, resetting to: ${[...cardColorSet].join('')}`);
            this.commitState.consecutiveColors = new Set(cardColorSet);
            this.commitState.consecutiveCount = 1;
          }
        }
      } else {
        console.log(`[LogParser] Ignoring colorless card for commit tracking`);
      }
    }

    // --- Condition B: 70% à la fin du pack 1 ---
    if (packNumber === 1 && pickNumber >= 13 && !this.commitState.isCommitted) {
      this.checkPercentageCommit();
    }
  }

  /**
   * Vérifie si 70% des cartes sont dans 2 couleurs (fin de pack 1)
   */
  checkPercentageCommit() {
    const colorCounts = this.getPoolColors();
    const sorted = Object.entries(colorCounts)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    if (sorted.length < 2) return;

    const [color1, count1] = sorted[0];
    const [color2, count2] = sorted[1];
    const topTwoTotal = count1 + count2;

    // Compter le total de cartes colorées (pas les incolores)
    const totalColored = this.currentPool.filter(c => c.colors && c.colors !== 'C').length;

    if (totalColored > 0) {
      const percentage = topTwoTotal / totalColored;

      if (percentage >= 0.7) {
        this.commitState.isCommitted = true;
        this.commitState.archetypeColors = new Set([color1, color2]);
        this.commitState.commitReason = 'percentage';
        console.log(`[LogParser] COMMIT détecté (${Math.round(percentage * 100)}%): ${[color1, color2].sort().join('')}`);
      }
    }
  }

  /**
   * Retourne l'état actuel du commit
   */
  getCommitState() {
    return {
      isCommitted: this.commitState.isCommitted,
      archetypeColors: this.commitState.archetypeColors,
      archetype: this.commitState.archetypeColors
        ? [...this.commitState.archetypeColors].sort().join('')
        : null,
      reason: this.commitState.commitReason,
      consecutiveCount: this.commitState.consecutiveCount,
    };
  }

  /**
   * Calcule les stats du pool pour le scoring structure
   */
  getPoolStats() {
    const stats = {
      manaCurve: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      creatureCount: 0,
      spellCount: 0,
      totalNonLand: 0,
    };

    for (const card of this.currentPool) {
      if (!card.name) continue;

      // On a besoin des infos CMC et type qui sont ajoutées lors de l'enrichissement
      const cmc = card.cmc || 0;
      const isCreature = (card.type || '').toLowerCase().includes('creature');
      const isLand = (card.type || '').toLowerCase().includes('land');

      if (isLand) continue;

      stats.totalNonLand++;

      // Mana curve (grouper 6+)
      const cmcKey = Math.min(cmc, 6);
      if (cmcKey >= 1) {
        stats.manaCurve[cmcKey] = (stats.manaCurve[cmcKey] || 0) + 1;
      }

      if (isCreature) {
        stats.creatureCount++;
      } else {
        stats.spellCount++;
      }
    }

    return stats;
  }

  handleDraftEnd() {
    if (!this.currentDraft) return;

    this.emit('draft-end', {
      draftId: this.currentDraft.draftId,
      pool: [...this.currentPool],
      duration: Date.now() - this.currentDraft.startTime,
    });

    this.resetDraft();
  }

  resetDraft() {
    this.currentDraft = null;
    this.currentPool = [];
    this.packHistory = [];
    this.pendingEventName = null;

    // Reset commit state
    this.commitState = {
      isCommitted: false,
      archetypeColors: null,
      consecutiveColors: null,
      consecutiveCount: 0,
      commitReason: null,
    };
  }

  /**
   * Scanne les dernières lignes du log pour trouver un EventJoin récent
   */
  scanForRecentEventJoin() {
    try {
      const stats = fs.statSync(this.logPath);
      // Lire les derniers 500KB du fichier
      const bytesToRead = Math.min(500000, stats.size);
      const startPos = Math.max(0, stats.size - bytesToRead);

      const buffer = Buffer.alloc(bytesToRead);
      const fd = fs.openSync(this.logPath, 'r');
      fs.readSync(fd, buffer, 0, bytesToRead, startPos);
      fs.closeSync(fd);

      const content = buffer.toString('utf8');
      const lines = content.split('\n');

      // Chercher le dernier EventJoin avec Draft
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.includes('EventJoin') && line.includes('Draft')) {
          const jsonMatch = line.match(/\{.*\}/);
          if (jsonMatch) {
            try {
              const data = JSON.parse(jsonMatch[0]);
              if (data.request) {
                const request = JSON.parse(data.request);
                if (request.EventName && request.EventName.includes('Draft')) {
                  this.pendingEventName = request.EventName;
                  console.log('[LogParser] Found recent EventJoin:', request.EventName);
                  return;
                }
              }
            } catch (e) {}
          }
        }
      }

      console.log('[LogParser] No recent EventJoin found');
    } catch (err) {
      console.error('[LogParser] Error scanning for EventJoin:', err.message);
    }
  }

  /**
   * Format de l'evenement (PremierDraft, TradDraft, QuickDraft...).
   * Draft.Notify ne porte pas de DraftType : la seule source fiable est le
   * prefixe de l'EventName capture par EventJoin, ex "TradDraft_HOB_20260810".
   */
  extractFormat(data) {
    if (data.DraftType) return data.DraftType;

    const eventName = data.EventName || this.pendingEventName;
    if (eventName) {
      const prefix = eventName.split('_')[0];
      if (prefix) return prefix;
    }

    return 'PremierDraft';
  }

  extractSetCode(data) {
    // Essayer différents champs
    if (data.SetCode) return data.SetCode;
    if (data.DraftSet) return data.DraftSet;
    if (data.EventName) {
      // Ex: "PremierDraft_MKM_20240101"
      const match = data.EventName.match(/_([A-Z0-9]{3})_/);
      if (match) return match[1];
    }
    // Utiliser le pendingEventName capturé depuis EventJoin
    if (this.pendingEventName) {
      const match = this.pendingEventName.match(/_([A-Z0-9]{3})_/);
      if (match) {
        console.log('[LogParser] Set code from EventJoin:', match[1]);
        return match[1];
      }
    }
    return 'UNK';
  }

  getCurrentPool() {
    return this.currentPool.map(c => c.arenaId);
  }

  getCurrentPoolFull() {
    return [...this.currentPool];
  }
}

module.exports = LogParser;
