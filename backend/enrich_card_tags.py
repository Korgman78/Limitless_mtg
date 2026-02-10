import requests
import os
import re
import sys
import time
from dotenv import load_dotenv
from pathlib import Path

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

TARGET_SET = "ECL"

# --- ENVIRONNEMENT ---
current_dir = Path(__file__).parent
root_dir = current_dir.parent
env_path = root_dir / '.env'
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERREUR: Variables d'environnement SUPABASE_URL ou SUPABASE_KEY manquantes.")
    sys.exit(1)

HEADERS_SUPABASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

# --- REMOVAL PATTERNS ---
REMOVAL_PATTERNS = [
    re.compile(r'\bdestroy target\b.*\b((nonland|nonartifact|nonenchantment)\s+)?(creature|permanent|planeswalker)\b', re.IGNORECASE),
    re.compile(r'\bexile target\b.*\b((nonland|nonartifact|nonenchantment)\s+)?(creature|permanent|planeswalker)\b', re.IGNORECASE),
    re.compile(r'\bexile (up to )?(one )?target\b.*\b((nonland|nonartifact|nonenchantment)\s+)?(creature|permanent|planeswalker)\b', re.IGNORECASE),
    re.compile(r'\bdeals? \d+ damage\b.*\btarget\b', re.IGNORECASE),
    re.compile(r'\btarget\b.*-\d+/-\d+', re.IGNORECASE),
    re.compile(r'\btarget creature gets -\d+', re.IGNORECASE),
    # Counter-based shrink/exile style effects (e.g. "Put four -1/-1 counters on target creature")
    re.compile(r'\bput\b.*-\d+/-\d+\s+counters?\s+on\b.*\btarget\b.*\b((nonland|nonartifact|nonenchantment)\s+)?(creature|permanent|planeswalker)\b', re.IGNORECASE),
    re.compile(r'\bfights?\b', re.IGNORECASE),
    re.compile(r'\breturn target\b.*\bto (its|their) owner', re.IGNORECASE),
    # "Put target permanent on top/bottom of library" style hard interaction.
    re.compile(r'\bput target\b.*\b((nonland|nonartifact|nonenchantment)\s+)?(creature|permanent)\b.*\b(on top of|on the bottom of|into)\b.*\blibrary\b', re.IGNORECASE),
    re.compile(r'\bowner of target\b.*\b((nonland|nonartifact|nonenchantment)\s+)?(creature|permanent)\b.*\bputs it\b.*\blibrary\b', re.IGNORECASE),
    re.compile(r'\bsacrifice\b.*\btarget\b', re.IGNORECASE),
    re.compile(r'\bgain control of target\b', re.IGNORECASE),
    re.compile(r'\bdestroy all\b', re.IGNORECASE),
    re.compile(r'\bexile all\b', re.IGNORECASE),
    re.compile(r"can't attack or block", re.IGNORECASE),
]

VALID_MANA_COLORS = set("WUBRG")
FIXER_ONLY_EXPLICIT_NAMES = {
    "Firdoch Core",
    "Springleaf Drum",
}

# Words captured by regex that are NOT creature types
EXCLUDED_DEPENDENCY_WORDS = {
    # Game zones / card types
    'creature', 'permanent', 'spell', 'card', 'token', 'source', 'artifact',
    'enchantment', 'instant', 'sorcery', 'planeswalker', 'land', 'aura',
    # Articles / pronouns captured by loose patterns
    'another', 'other', 'target', 'each', 'all', 'any', 'that', 'this', 'the',
    # Numbers
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    # Basic land types
    'forest', 'swamp', 'mountain', 'island', 'plains',
    # Keywords / attributes
    'color', 'nonland', 'noncreature', 'basic', 'tapped', 'untapped',
    'mana', 'damage', 'life', 'power', 'toughness', 'counter', 'type',
    'combat', 'attack', 'block', 'flying', 'trample', 'haste',
    # Extra false positives caught in testing
    'among', 'enchant', 'those', 'nontoken', 'attacking', 'ability', 'them',
    'elk', 'worm', 'shapeshifter', 'copy', 'rest', 'chosen', 'number',
}

HARD_DEPENDENCY_PATTERNS = [
    # Triggered / conditional support checks
    re.compile(r'(?:whenever|if)\s+(?:(?:an?|another)\s+)?([A-Z][a-z]+)\s+(?:creature\s+)?you control', re.IGNORECASE),
    re.compile(r'(?:whenever|if)\s+(?:(?:an?|another)\s+)?([A-Z][a-z]+)\s+(?:you control\s+)?dies', re.IGNORECASE),
    re.compile(r'(?:whenever|if)\s+you\s+cast\s+(?:an?\s+)?([A-Z][a-z]+)\s+spell', re.IGNORECASE),
    re.compile(r'if there is (?:an?\s+)?([A-Z][a-z]+)\s+card in your graveyard', re.IGNORECASE),
    re.compile(r'\b([A-Z][a-z]+)\s+cards?\s+(?:in|from)\s+your graveyard', re.IGNORECASE),
    re.compile(r'if you control (?:an?\s+)?([A-Z][a-z]+)\b', re.IGNORECASE),
    re.compile(r'for each\s+(?:other\s+)?([A-Z][a-z]+)\s+', re.IGNORECASE),
    re.compile(r'\bother\s+([A-Z][a-z]+)s?\s+you control\b', re.IGNORECASE),
    re.compile(r'\bnumber of\s+([A-Z][a-z]+)s?\b', re.IGNORECASE),
    re.compile(r'\btarget\s+(?:\w+\s+)?([A-Z][a-z]+)\s+you control\b', re.IGNORECASE),
    re.compile(r'\btap\s+\w+\s+untapped\s+([A-Z][a-z]+)s?\s+you control\b', re.IGNORECASE),
    re.compile(r'\b([A-Z][a-z]+)\s+spells?\s+(?:you cast\s+)?(?:cost|have|or\s+activate)', re.IGNORECASE),
    re.compile(r'\baffinity for\s+([A-Z][a-z]+)s?\b', re.IGNORECASE),
    re.compile(r'\b([A-Z][a-z]+)\s+creatures?\s+you control\b', re.IGNORECASE),
    re.compile(r'\banother\s+([A-Z][a-z]+)\s+(?:or\s+\w+\s+)?you control\b', re.IGNORECASE),
    re.compile(r'\banother\s+\w+\s+or\s+([A-Z][a-z]+)\s+you control\b', re.IGNORECASE),
]

GENERIC_THRESHOLD_PATTERNS = [
    # Spell-matters style thresholds
    (re.compile(r'\binstant or sorcery spell', re.IGNORECASE), "instant_sorcery", 6),
    (re.compile(r'\bnoncreature spell', re.IGNORECASE), "noncreature_spell", 6),
    # Mana value threshold dependencies
    (re.compile(r'mana value\s+(\d+)\s+or greater', re.IGNORECASE), "mv_ge", 4),
]

# ==============================================================================
# 2. SCRYFALL FETCH
# ==============================================================================

def fetch_scryfall_set(set_code):
    """Recupere toutes les cartes d'un set depuis Scryfall avec pagination."""
    print(f"Recuperation du set {set_code} sur Scryfall...")
    cards = []
    url = f"https://api.scryfall.com/cards/search?q=set:{set_code}"

    while url:
        resp = requests.get(url)
        if resp.status_code != 200:
            print(f"Erreur Scryfall: {resp.status_code}")
            break

        data = resp.json()
        for c in data.get('data', []):
            card = _extract_card_data(c, set_code)
            if card:
                cards.append(card)

        url = data.get('next_page')
        if url:
            time.sleep(0.1)

    print(f"  {len(cards)} cartes recuperees depuis Scryfall.")
    return cards


def _extract_card_data(c, set_code):
    """Extrait les champs utiles d'une carte Scryfall."""
    name = c.get('name')
    if not name:
        return None

    oracle_text = c.get('oracle_text', '')
    produced_mana = c.get('produced_mana', [])
    type_line = c.get('type_line', '')

    # Gestion DFC : si pas d'oracle_text au top level, prendre la face avant
    if 'card_faces' in c:
        faces = c['card_faces']
        if not oracle_text and faces:
            oracle_text = faces[0].get('oracle_text', '')
        # Concatener le texte des deux faces pour la detection removal
        all_text = " ".join(face.get('oracle_text', '') for face in faces)
    else:
        all_text = oracle_text

    # produced_mana : filtrer sur WUBRG uniquement
    produced_colors = [m for m in (produced_mana or []) if m in VALID_MANA_COLORS]
    is_mana_producer = len(produced_colors) > 0
    produced_colours_str = "".join(sorted(produced_colors, key=lambda x: "WUBRG".index(x))) if produced_colors else None

    # Detection removal
    is_removal = _detect_removal(all_text)
    dependency_tags, dependency_min_support, dependency_scope = _detect_dependencies(all_text)
    is_fixer_only = _detect_fixer_only(
        name=name,
        type_line=type_line,
        oracle_text=all_text,
        is_mana_producer=is_mana_producer,
        produced_colors=produced_colors,
    )
    if is_fixer_only:
        if "fixer_only" not in dependency_tags:
            dependency_tags = sorted([*dependency_tags, "fixer_only"])

    return {
        "card_name": name,
        "set_code": set_code,
        "oracle_text": oracle_text or None,
        "is_removal": is_removal,
        "is_mana_producer": is_mana_producer,
        "produced_colours": produced_colours_str,
        "dependency_tags": dependency_tags,
        "dependency_min_support": dependency_min_support,
        "dependency_scope": dependency_scope,
    }


def _detect_removal(oracle_text):
    """Detection deterministe de removal via regex."""
    if not oracle_text:
        return False
    normalized = oracle_text.replace("−", "-")
    for pattern in REMOVAL_PATTERNS:
        if pattern.search(normalized):
            return True
    return False

def _singularize(tag):
    """Normalize plural creature type to singular (elves->elf, goblins->goblin)."""
    if tag.endswith('ves'):    # elves -> elf
        return tag[:-3] + 'f'
    if tag.endswith('ies'):    # faeries -> faerie (won't happen but safe)
        return tag[:-3] + 'y'
    if tag.endswith('s') and len(tag) > 4:
        return tag[:-1]
    return tag

def _extract_tags_from_patterns(oracle_text, patterns):
    tags = set()
    for pattern in patterns:
        for m in pattern.findall(oracle_text):
            tag = _singularize((m or "").strip().lower())
            if len(tag) >= 3 and tag not in EXCLUDED_DEPENDENCY_WORDS:
                tags.add(tag)
    return tags

def _extract_generic_threshold_tags(oracle_text):
    """
    Generic non-tribal threshold tags.
    Returns list[(tag, min_support)].
    """
    out = []
    text = oracle_text or ""
    for pattern, base_tag, default_min in GENERIC_THRESHOLD_PATTERNS:
        matches = pattern.findall(text)
        if not matches:
            continue
        if base_tag == "mv_ge":
            for m in matches:
                try:
                    mv = int(m)
                except Exception:
                    continue
                # Keep 2..8 only; outliers are usually noise.
                if 2 <= mv <= 8:
                    out.append((f"mv_ge_{mv}", default_min))
        else:
            out.append((base_tag, default_min))
    return out

def _detect_dependencies(oracle_text):
    """Return ONLY hard dependencies with threshold effects."""
    if not oracle_text:
        return [], None, None

    hard_tags = _extract_tags_from_patterns(oracle_text, HARD_DEPENDENCY_PATTERNS)
    generic_threshold_tags = _extract_generic_threshold_tags(oracle_text)

    text = oracle_text.lower()

    if hard_tags or generic_threshold_tags:
        all_tags = set(hard_tags)
        mins = []
        for tag, min_v in generic_threshold_tags:
            all_tags.add(tag)
            mins.append(min_v)

        has_strong_trigger = (
            re.search(r'whenever .+?\b\w+ (?:creature )?you control (?:enters|attacks|dies|becomes)', text) is not None
            or re.search(r'for each (?:other )?\w+ ', text) is not None
            or re.search(r'whenever you cast .* spell', text) is not None
            or re.search(r'number of \w+s? you control', text) is not None
            or re.search(r'tap \w+ untapped \w+ you control', text) is not None
        )
        has_lord = (
            re.search(r'other \w+s? you control (?:get|have|gain)', text) is not None
        )
        has_mild_hook = (
            re.search(r'if there is .* card in your graveyard', text) is not None
            or re.search(r'if you control ', text) is not None
        )

        if has_strong_trigger:
            min_support = 7
        elif has_lord:
            min_support = 5
        elif has_mild_hook:
            min_support = 3
        else:
            min_support = 4

        if mins:
            min_support = max([min_support, *mins])
        return sorted(all_tags), min_support, "tribal"

    return [], None, None


def _detect_fixer_only(name, type_line, oracle_text, is_mana_producer, produced_colors):
    """
    Detect cards that are primarily mana fixers and should be disfavored
    in strict 2-color builds without active splash needs.
    """
    if name in FIXER_ONLY_EXPLICIT_NAMES:
        return True
    if not is_mana_producer:
        return False

    text = (oracle_text or "").lower()
    tline = (type_line or "").lower()
    produced_count = len(produced_colors or [])

    # Pure artifact fixers without board impact.
    if "artifact" in tline and "creature" not in tline:
        if produced_count >= 3 and "add one mana of any color" in text:
            return True

    return False

# ==============================================================================
# 3. UPSERT SUPABASE
# ==============================================================================

def upsert_to_supabase(cards):
    """Batch upsert vers card_list (merge-duplicates sur card_name,set_code)."""
    if not cards:
        print("Aucune carte a upserter.")
        return

    print(f"Upsert de {len(cards)} cartes vers card_list...")
    batch_size = 500
    for i in range(0, len(cards), batch_size):
        chunk = cards[i:i + batch_size]
        url = f"{SUPABASE_URL}/rest/v1/card_list?on_conflict=card_name,set_code"
        resp = requests.post(url, json=chunk, headers=HEADERS_SUPABASE)

        if resp.status_code >= 400:
            print(f"  Erreur Batch {i // batch_size + 1}: {resp.text}")
        else:
            print(f"  Batch {i // batch_size + 1} OK.")

# ==============================================================================
# 4. REVIEW MODE
# ==============================================================================

def review_untagged(cards):
    """Dump les cartes NON taguees removal avec leur oracle_text pour revue manuelle."""
    non_removal = [c for c in cards if not c['is_removal'] and c.get('oracle_text')]
    # Filtrer les terrains et cartes sans texte pertinent
    non_removal = [c for c in non_removal if c['oracle_text'] and 'target' in c['oracle_text'].lower()]

    print(f"\n{'='*60}")
    print(f"REVIEW: {len(non_removal)} cartes non-taguees contenant 'target'")
    print(f"{'='*60}")
    for c in sorted(non_removal, key=lambda x: x['card_name']):
        print(f"\n--- {c['card_name']} ---")
        print(f"  {c['oracle_text'][:200]}")

# ==============================================================================
# 5. STATS
# ==============================================================================

def print_stats(cards):
    """Affiche les stats de tagging pour verification."""
    removal_cards = [c for c in cards if c['is_removal']]
    mana_cards = [c for c in cards if c['is_mana_producer']]
    dependency_cards = [c for c in cards if c.get('dependency_tags')]
    hard_dependency_cards = [c for c in dependency_cards if c.get('dependency_min_support') is not None]
    other_dependency_cards = [c for c in dependency_cards if c.get('dependency_min_support') is None]

    print(f"\n{'='*60}")
    print(f"STATS pour {cards[0]['set_code'] if cards else '?'}")
    print(f"{'='*60}")
    print(f"Total cartes : {len(cards)}")
    print(f"Removal       : {len(removal_cards)}")
    print(f"Mana producers: {len(mana_cards)}")
    print(f"Dependency tags: {len(dependency_cards)}")
    print(f"  - hard_dependency (min_support set): {len(hard_dependency_cards)}")
    print(f"  - no-threshold (to clean): {len(other_dependency_cards)}")

    print(f"\n--- Removal ({len(removal_cards)}) ---")
    for c in sorted(removal_cards, key=lambda x: x['card_name']):
        print(f"  {c['card_name']}")

    print(f"\n--- Mana Producers ({len(mana_cards)}) ---")
    for c in sorted(mana_cards, key=lambda x: x['card_name']):
        colors = c['produced_colours'] or '?'
        print(f"  {c['card_name']} -> {colors}")

    print(f"\n--- Dependencies ({len(dependency_cards)}) ---")
    for c in sorted(dependency_cards, key=lambda x: x['card_name']):
        tags = ",".join(c.get("dependency_tags") or [])
        mins = c.get("dependency_min_support")
        scope = c.get("dependency_scope")
        print(f"  {c['card_name']} -> [{tags}] min={mins} scope={scope}")

# ==============================================================================
# MAIN
# ==============================================================================

if __name__ == "__main__":
    target = TARGET_SET.upper()
    review_mode = "--review" in sys.argv

    print(f"Demarrage enrichissement pour le set : {target}")
    start_time = time.time()

    # 1. Fetch Scryfall
    cards = fetch_scryfall_set(target)

    # 2. Stats
    print_stats(cards)

    # 3. Review mode
    if review_mode:
        review_untagged(cards)
    else:
        # 4. Upsert
        upsert_to_supabase(cards)

    print(f"\nTermine en {round(time.time() - start_time, 2)}s.")
