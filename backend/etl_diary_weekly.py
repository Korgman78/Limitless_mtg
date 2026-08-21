"""
Synthese hebdomadaire du Training Diary.

Agrege les evenements de la semaine (score, commentaires qualitatifs, cartes
jouees, adversaires) et demande a Gemini d'en tirer un bilan : ce qui revient
souvent dans les notes, les ecarts avec les stats 17Lands, les tendances de WR.

Ecrit dans diary_weekly_reports (une ligne par semaine, upsert sur week_start).

Usage :
    python backend/etl_diary_weekly.py            # semaine ecoulee (lundi -> dimanche)
    python backend/etl_diary_weekly.py 2026-08-17 # semaine commencant ce lundi-la
"""

import os
import sys
import json
from datetime import date, datetime, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

GEMINI_MODEL = "gemini-3.1-flash-lite-preview"

root_dir = Path(__file__).parent.parent
load_dotenv(dotenv_path=root_dir / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("[ERREUR] SUPABASE_URL / SUPABASE_KEY manquants.")
    sys.exit(1)

if not GEMINI_API_KEY:
    print("[ERREUR] GEMINI_API_KEY manquant (secret GitHub Actions ou .env local).")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# Sections de commentaire, dans l'ordre ou elles sont posees a l'utilisateur.
SECTION_LABELS = {
    "pick_phase": "Bilan phase de pick",
    "deck_choice": "Bilan choix de deck",
    "deck_quality": "Qualite du deck construit",
    "gameplay": "Erreurs et reussites en jeu",
    "overperformers": "Overperformers",
    "underperformers": "Underperformers",
    "other": "Autres commentaires",
}

# Un trophee ne vaut pas 7 victoires partout : en Traditional la course est BO3
# et s'arrete a 3-0. Doit rester aligne sur TROPHY_WINS (diary/src/constants.ts).
TROPHY_WINS = {
    "PremierDraft": 7,
    "Sealed": 7,
    "TradDraft": 3,
    "TradSealed": 3,
    "ArenaDirect_Sealed": 7,
}


# ==============================================================================
# 2. FENETRE TEMPORELLE
# ==============================================================================

def resolve_week(argument: str | None) -> tuple[date, date]:
    """Renvoie (lundi, dimanche) de la semaine visee."""
    if argument:
        monday = datetime.strptime(argument, "%Y-%m-%d").date()
        monday -= timedelta(days=monday.weekday())
    else:
        # Par defaut : la semaine ecoulee. Lance un lundi, elle couvre la
        # semaine precedente, complete.
        today = date.today()
        monday = today - timedelta(days=today.weekday() + 7)

    return monday, monday + timedelta(days=6)


# ==============================================================================
# 3. COLLECTE
# ==============================================================================

def fetch_events(start: date, end: date) -> list:
    """Evenements joues dans la fenetre, avec tout ce qui y est rattache."""
    select = (
        "id,set_code,format,event_type,played_at,wins,losses,"
        "diary_notes(section,body),"
        "diary_matches(games_won,games_lost,won,opponent_colors),"
        "diary_deck_versions(version_no,decklist_raw)"
    )
    url = (
        f"{SUPABASE_URL}/rest/v1/diary_events"
        f"?select={select}"
        f"&deleted_at=is.null"
        f"&played_at=gte.{start.isoformat()}"
        f"&played_at=lte.{end.isoformat()}T23:59:59"
        f"&order=played_at"
    )
    resp = requests.get(url, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    return resp.json()


def fetch_gih_wr(set_codes: set[str]) -> dict:
    """GIH WR 17Lands, cle (set_code, format, card_name)."""
    if not set_codes:
        return {}

    codes = ",".join(sorted(set_codes))
    url = (
        f"{SUPABASE_URL}/rest/v1/card_stats"
        f"?select=card_name,gih_wr,set_code,format"
        f"&set_code=in.({codes})&filter_context=eq.Global"
    )
    resp = requests.get(url, headers=HEADERS, timeout=60)
    resp.raise_for_status()

    return {
        (row["set_code"], row["format"], row["card_name"]): row["gih_wr"]
        for row in resp.json()
        if row.get("gih_wr") is not None
    }


def lookup_gih(gih: dict, key) -> float | None:
    """
    GIH d'une carte, avec repli sur la face avant.

    17Lands ne connait que la face avant des recto-verso ("Smaug, the Great
    Calamity") la ou card_list stocke le nom complet ("... // Spew Flame").
    Sans ce repli, toutes les DFC sortent du rapport sans point de comparaison.
    """
    if key is None:
        return None
    if key in gih:
        return gih[key]

    set_code, fmt, name = key
    if " // " in name:
        return gih.get((set_code, fmt, name.split(" // ")[0].strip()))
    return None


def parse_decklist(raw: str) -> list[tuple[int, str]]:
    """Export MTGA -> [(quantite, nom)]. Ignore l'en-tete et les lignes vides."""
    cards = []
    for line in (raw or "").splitlines():
        line = line.strip()
        if not line or line.lower() in ("deck", "sideboard"):
            continue
        head, _, name = line.partition(" ")
        if head.isdigit() and name:
            cards.append((int(head), name.strip()))
    return cards


# ==============================================================================
# 4. MISE EN FORME POUR LE PROMPT
# ==============================================================================

def build_digest(events: list, gih: dict) -> tuple[str, dict]:
    """Construit le resume factuel envoye au modele, plus quelques totaux."""
    lines = []
    total_w = total_l = 0
    total_gw = total_gl = 0
    trophies = 0
    card_plays: dict[str, dict] = {}
    opponents: dict[str, int] = {}

    for event in events:
        wins, losses = event["wins"], event["losses"]
        if wins + losses == 0:
            continue

        total_w += wins
        total_l += losses
        if wins >= TROPHY_WINS.get(event["format"], 7):
            trophies += 1

        matches = event.get("diary_matches") or []
        gw = sum(m.get("games_won") or 0 for m in matches)
        gl = sum(m.get("games_lost") or 0 for m in matches)
        total_gw += gw
        total_gl += gl

        played_on = event["played_at"][:10]
        header = f"### {played_on} — {event['format']} {event['set_code']} — {wins}-{losses}"
        if matches:
            header += f" (parties {gw}-{gl})"
        lines.append(header)

        for match in matches:
            colors = match.get("opponent_colors") or "?"
            opponents[colors] = opponents.get(colors, 0) + 1
            issue = "gagne" if match.get("won") else "perdu"
            lines.append(
                f"- match {issue} {match.get('games_won', 0)}-"
                f"{match.get('games_lost', 0)} contre {colors}"
            )

        # Cartes du dernier build : c'est celui qui a fini l'evenement.
        versions = sorted(
            event.get("diary_deck_versions") or [],
            key=lambda v: v.get("version_no", 0),
        )
        if versions:
            for qty, name in parse_decklist(versions[-1].get("decklist_raw", "")):
                entry = card_plays.setdefault(
                    name, {"events": 0, "wins": 0, "losses": 0, "key": None}
                )
                entry["events"] += 1
                entry["wins"] += wins
                entry["losses"] += losses
                entry["key"] = (event["set_code"], event["format"], name)

        notes = {
            n["section"]: (n.get("body") or "").strip()
            for n in (event.get("diary_notes") or [])
        }
        for section, label in SECTION_LABELS.items():
            body = notes.get(section)
            if body:
                lines.append(f"- **{label}** : {body}")

        lines.append("")

    # Cartes les plus jouees, avec l'ecart 17Lands quand il est connu.
    ranked = sorted(card_plays.items(), key=lambda kv: -kv[1]["events"])[:15]
    if ranked:
        lines.append("### Cartes les plus jouees cette semaine")
        for name, stat in ranked:
            games = stat["wins"] + stat["losses"]
            wr = (stat["wins"] / games * 100) if games else 0
            reference = lookup_gih(gih, stat["key"])
            gap = f", GIH 17Lands {reference:.1f}%" if reference else ""
            lines.append(
                f"- {name} : {stat['events']} event(s), WR match {wr:.1f}%{gap}"
            )
        lines.append("")

    if opponents:
        faced = ", ".join(f"{c} x{n}" for c, n in sorted(opponents.items(), key=lambda kv: -kv[1]))
        lines.append(f"### Archetypes affrontes\n{faced}\n")

    totals = {
        "events": sum(1 for e in events if e["wins"] + e["losses"] > 0),
        "wins": total_w,
        "losses": total_l,
        "games_won": total_gw,
        "games_lost": total_gl,
        "trophies": trophies,
    }
    return "\n".join(lines), totals


PROMPT_TEMPLATE = """Tu es un coach de Magic: The Gathering Limited. Voici le journal
d'entrainement d'un joueur pour la semaine du {start} au {end}.

Bilan chiffre : {events} evenements joues, {wins}-{losses} en matchs,
{games_won}-{games_lost} en parties, {trophies} trophee(s).

DONNEES BRUTES
{digest}

Redige une synthese en francais, en markdown, avec exactement ces sections :

## Bilan de la semaine
Deux a trois phrases sur le win rate et son evolution. Reste factuel, cite les chiffres.

## Ce qui revient dans tes notes
Identifie les motifs RECURRENTS dans les commentaires qualitatifs — erreurs repetees,
reussites systematiques, hesitations sur les memes types de decisions. Si un theme
n'apparait qu'une fois, ne le presente pas comme une tendance. S'il n'y a pas assez
de commentaires pour degager un motif, dis-le franchement.

## Cartes et ecarts 17Lands
Compare les cartes les plus jouees a leur GIH WR 17Lands. Attention : le WR du joueur
est un taux au MATCH, celui de 17Lands un taux en PARTIE quand la carte est en main.
Ces metriques ne se comparent pas terme a terme — traite l'ecart comme un signal de
tendance, jamais comme une mesure, et dis-le si tu t'en sers.

## A travailler la semaine prochaine
Deux ou trois axes concrets et actionnables, tires de ce qui precede. Pas de conseils
generiques valables pour n'importe quel joueur.

Regles : n'invente aucun chiffre absent des donnees. Si un echantillon est trop petit
pour conclure, dis-le plutot que de meubler. Tutoie le joueur.
"""


# ==============================================================================
# 5. APPEL GEMINI
# ==============================================================================

def call_gemini(prompt: str) -> str | None:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.6, "maxOutputTokens": 4096},
    }
    try:
        resp = requests.post(url, json=payload, timeout=120)
        if resp.status_code != 200:
            print(f"[ERR] Gemini {resp.status_code}: {resp.text[:300]}")
            return None
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as exc:
        print(f"[ERR] Appel Gemini echoue : {exc}")
        return None


# ==============================================================================
# 6. ECRITURE
# ==============================================================================

def save_report(week_start: date, body_md: str, event_count: int) -> None:
    """Upsert sur week_start : relancer une semaine deja traitee la remplace."""
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/diary_weekly_reports?on_conflict=week_start",
        headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
        data=json.dumps(
            {
                "week_start": week_start.isoformat(),
                "body_md": body_md,
                "event_count": event_count,
                "generated_at": datetime.utcnow().isoformat() + "Z",
            }
        ),
        timeout=60,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Ecriture du rapport impossible : {resp.text[:300]}")


# ==============================================================================
# MAIN
# ==============================================================================

if __name__ == "__main__":
    start, end = resolve_week(sys.argv[1] if len(sys.argv) > 1 else None)
    print(f"Semaine ciblee : {start} -> {end}")

    events = fetch_events(start, end)
    played = [e for e in events if e["wins"] + e["losses"] > 0]
    print(f"Evenements joues : {len(played)}")

    if not played:
        print("Rien a synthetiser cette semaine, aucun rapport genere.")
        sys.exit(0)

    gih = fetch_gih_wr({e["set_code"] for e in played})
    digest, totals = build_digest(played, gih)

    prompt = PROMPT_TEMPLATE.format(
        start=start, end=end, digest=digest, **totals
    )
    print(f"Prompt : {len(prompt)} caracteres")

    body = call_gemini(prompt)
    if not body:
        print("[ERREUR] Aucune reponse du modele.")
        sys.exit(1)

    save_report(start, body, totals["events"])
    print(f"Rapport enregistre pour la semaine du {start}.")
