"""Health check du cookie LANDS17_COOKIE.

Fait un appel sentinel a /api/trophies/ et verifie que la reponse contient
au moins quelques trophees. Exit code != 0 si le cookie semble mort, ce qui
fait echouer le workflow GitHub Actions et envoie un mail d'alerte au
proprietaire du repo (notification par defaut sur les schedules en echec).

Le sentinel par defaut est SOS/PremierDraft. Override possible via les
variables d'environnement LANDS17_SENTINEL_SET et LANDS17_SENTINEL_FORMAT
quand le set actuel change.
"""
import os
import sys
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from pathlib import Path

current_dir = Path(__file__).parent
root_dir = current_dir.parent
load_dotenv(dotenv_path=root_dir / '.env')

COOKIE = os.getenv('LANDS17_COOKIE')
SENTINEL_SET = os.getenv('LANDS17_SENTINEL_SET', 'SOS')
SENTINEL_FORMAT = os.getenv('LANDS17_SENTINEL_FORMAT', 'PremierDraft')

if not COOKIE:
    print('FAIL: LANDS17_COOKIE env var is not set.')
    sys.exit(1)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) Gecko/20100101 Firefox/151.0',
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Origin': 'https://www.17lands.com',
    'Referer': f'https://www.17lands.com/trophy_decks?expansion={SENTINEL_SET}&format={SENTINEL_FORMAT}',
    'Cookie': COOKIE,
}

print(f'Sentinel call: POST /api/trophies/ for {SENTINEL_SET}/{SENTINEL_FORMAT}')
try:
    r = requests.post(
        'https://www.17lands.com/api/trophies/',
        json={
            'expansion': SENTINEL_SET,
            'event_type': SENTINEL_FORMAT,
            'card_names': [],
            'ranks': [],
            'deck_colors': [],
        },
        headers=HEADERS,
        timeout=30,
    )
except requests.RequestException as e:
    print(f'FAIL: network error during sentinel call: {e}')
    sys.exit(1)

if r.status_code != 200:
    print(f'FAIL: HTTP {r.status_code}. Body head: {r.text[:200]!r}')
    sys.exit(1)

try:
    body = r.json()
except ValueError as e:
    # Non-JSON likely means the SPA shell was served — cookie or path rejected
    print(f'FAIL: response is not JSON (cookie probably rejected). Error: {e}')
    print(f'Body head: {r.text[:200]!r}')
    sys.exit(1)

if not isinstance(body, dict) or 'data' not in body:
    print(f'FAIL: unexpected response shape. Keys: {list(body.keys()) if isinstance(body, dict) else type(body).__name__}')
    sys.exit(1)

data = body['data']
if not isinstance(data, list) or len(data) == 0:
    print('FAIL: /api/trophies/ returned an empty list.')
    print('LANDS17_COOKIE has likely expired (Flask remember_token TTL ~30 days).')
    print('Action: extract a fresh cookie from DevTools at')
    print('  https://www.17lands.com/trophy_decks')
    print('then update the GitHub Actions secret LANDS17_COOKIE.')
    sys.exit(1)

# Cookie is valid. Bonus check: any trophy within the last 48h ?
now = datetime.now(timezone.utc)
fresh = 0
for t in data:
    tt = t.get('time')
    if not tt:
        continue
    try:
        dt = datetime.fromisoformat(tt.replace(' ', 'T'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if (now - dt).total_seconds() < 48 * 3600:
            fresh += 1
    except ValueError:
        pass

print(f'OK: {len(data)} trophies returned, {fresh} within last 48h.')

if fresh == 0:
    # Cookie works but data is stale. Probably the sentinel set has ended on
    # Arena. We do NOT fail here — user can switch LANDS17_SENTINEL_SET.
    print(f'WARN: no trophy within last 48h for {SENTINEL_SET}/{SENTINEL_FORMAT}.')
    print('  Cookie is valid but the sentinel set may have ended on Arena.')
    print('  Consider updating LANDS17_SENTINEL_SET to the current Arena set.')

sys.exit(0)
