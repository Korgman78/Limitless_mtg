import requests
import os
import re
import json
import time
import feedparser
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================

RSS_FEED_URL = (
    "https://rss-bridge.org/bridge01/?action=display&bridge=FeedMergeBridge"
    "&feed_name=Veille+Magic+Limited"
    "&feed_1=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3DUCeClyXNkHLRxS3vzRVCNHZQ"
    "&feed_2=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3DUCLzE7jLdn7dqxK-0OdXeuaw"
    "&feed_3=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3DUCT22Ehr7vuRpIAaJ7dEkApg"
    "&feed_4=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3DUC1iaQ8aFrDS6n_lytS4fBBA"
    "&feed_5=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3DUCG5KmWI7Yr71rbn0lOwcrfw"
    "&feed_6=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3DUCheVPpgNql8JjZlYGcbjyGw"
    "&feed_7=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3DUCkfWtgQSg3yp7vmIj3Z5W0A"
    "&feed_8=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3DUC9LX2KnB85WKpcotB0iEa2Q"
    "&limit=15&format=Atom"
)

GEMINI_MODEL = "gemini-3.1-flash-lite-preview"
MAX_TRANSCRIPT_CHARS = 60000
MAX_VIDEO_AGE_DAYS = 3
DELAY_BETWEEN_CALLS = 4  # seconds — Gemini free tier: 15 RPM

# --- ENVIRONNEMENT ---
current_dir = Path(__file__).parent
root_dir = current_dir.parent
env_path = root_dir / '.env'
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

HEADERS_SUPABASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

# --- PROMPT GEMINI ---
GEMINI_PROMPT_TEMPLATE = """LANGUAGE: English only (including all headers and titles)

# ROLE
You are an expert "Magic: The Gathering" analyst, specialized in Limited formats (Draft and Sealed). You are also a seasoned web writer capable of synthesizing complex information into clear, engaging, and visually structured articles.

# TASK
Transform the provided raw YouTube transcript into a structured, deep-dive summary written entirely in ENGLISH.

# VIDEO INFO
- Title: {video_title}
- Channel: {channel_name}

# INPUT DATA (TRANSCRIPT):
{transcript}

# FORMATTING CONSTRAINTS (CRITICAL)
1. **Format**: Use exclusively **Markdown**.
2. **Length**: Target 600-800 words (~4 min read).
3. **Visual Style**:
    * Use **H2 (##)** for major sections.
    * Use **bullet points** to keep the text airy.
    * **Bold** all card names (e.g., **Sheoldred, the Apocalypse**).
    * Use **emojis** to illustrate points (see guide below).
4. **Tone**: Professional yet passionate "gamer" tone (use terms like: curve, tempo, bomb, removal, value, engine).

# EMOJI GUIDE
* Mana Colors: ⚪ (White), 🔵 (Blue), ⚫ (Black), 🔴 (Red), 🟢 (Green).
* Evaluation: 💎 (Gem/Sleeper), 💣 (Bomb/Top Tier), ⚠️ (Trap), 🗑️ (Chaff).
* Concepts: 🛡️ (Defense/Stability), ⚔️ (Aggro/Tempo), 🧠 (Control/Strategy).

# EXPECTED STRUCTURE
Start directly with the content (no H1 title).

## ⚡ TL;DR: 3 Key Takeaways
(3 bullet points summarizing the most important advice from the video).

## 📊 Archetypes & Meta Analysis
(Detail the colors and strategies that dominate or underperform. Use color emojis).

## 🃏 Key Cards Spotlight
(In-depth analysis of mentioned cards. Explain WHY they are good or bad).
* **Card Name**: Speaker's insight...
* **Card Name**: Speaker's insight...

## 💡 Strategic Tips & Draft Advice
(Gameplay advice, pick order changes, or deck-building tricks mentioned).

## 🏁 Conclusion
(One-sentence synthesis).

# DATA ANALYSIS (CRITICAL - JSON)
At the very end of your response, add ONLY the JSON block. No introductory text, no "Here is the JSON".

```json
{{
  "tags": ["#Tag1", "#Tag2"],
  "strategic_score": 8,
  "set_tag": "TLA",
  "cards": ["Official English Name 1", "Official English Name 2"]
}}
```

SPECIFIC JSON INSTRUCTIONS:
- tags: Choose 3-5 from (#Draft, #Sealed, #TierList, #Gameplay, #Strategy, #ArenaDirect).

- strategic_score: Density of actionable advice (1-10). STRICT SCALE:
    1-3: Low value, entertainment only or obvious basics, OR not limited content (constructed formats like standard, historic, pioneer, etc.).
    4-6: Good overview, lacks deep play patterns or specific meta-shifts.
    7-8: High level, specific interactions and precise pick-order justifications.
    9-10: Master level, reveals hidden meta-shifts or advanced pro-level strategies.
    BE CRITICAL: If the video is too generic or too specific (only focused on gameplay), stay below 6.

- set_tag: Identify the set code. Known codes: FIN, VOW, NEO, TLA, EOE, TDM, MH3, OTJ, ECL, TMT, SOS. If unknown, use "UNKNOWN".
- cards: List 5-20 most important cards. Use official US English names only. Fix transcript typos using your internal MTG database knowledge."""


# ==============================================================================
# 2. HELPERS
# ==============================================================================

def extract_video_id(entry):
    """Extract YouTube video ID from a feedparser entry."""
    # feedparser exposes yt:videoId as yt_videoid
    vid = entry.get("yt_videoid")
    if vid:
        return vid
    # Fallback: parse from link URL
    link = entry.get("link", "")
    match = re.search(r'[?&]v=([a-zA-Z0-9_-]{11})', link)
    if match:
        return match.group(1)
    return None


def fetch_transcript(video_id):
    """Fetch YouTube transcript using free youtube-transcript-api."""
    try:
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id, languages=["en", "en-US"])
        full_text = " ".join(snippet.text for snippet in transcript)
        return full_text[:MAX_TRANSCRIPT_CHARS]
    except Exception as e:
        print(f"    [WARN] No transcript for {video_id}: {e}")
        return None


def call_gemini(prompt):
    """Call Gemini REST API and return the generated text."""
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 4096,
        },
    }
    try:
        resp = requests.post(url, json=payload, timeout=90)
        if resp.status_code != 200:
            print(f"    [ERR] Gemini {resp.status_code}: {resp.text[:200]}")
            return None
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        print(f"    [ERR] Gemini call failed: {e}")
        return None


def parse_llm_response(response):
    """
    Split LLM response into (article_markdown, metadata_dict).
    The JSON block is expected at the end, in ```json fences or raw.
    """
    # Try fenced JSON first
    fence_match = re.search(r'```json\s*(\{[\s\S]*?\})\s*```', response)
    if fence_match:
        json_str = fence_match.group(1)
        article = response[:fence_match.start()].strip()
    else:
        # Fallback: last JSON object in the response
        json_match = re.search(r'(\{[\s\S]*\})\s*$', response)
        if json_match:
            json_str = json_match.group(1)
            article = response[:json_match.start()].strip()
        else:
            return response.strip(), None

    try:
        metadata = json.loads(json_str)
        return article, metadata
    except json.JSONDecodeError:
        print("    [WARN] Failed to parse JSON from LLM response")
        return response.strip(), None


def build_prompt(transcript, video_title, channel_name):
    """Build the full Gemini prompt from template."""
    return GEMINI_PROMPT_TEMPLATE.format(
        transcript=transcript,
        video_title=video_title,
        channel_name=channel_name,
    )


# ==============================================================================
# 3. RSS FEED
# ==============================================================================

def fetch_rss_entries():
    """Fetch and parse the merged RSS feed, return recent entries."""
    print("  Fetching RSS feed...")
    feed = feedparser.parse(RSS_FEED_URL)

    if feed.bozo and not feed.entries:
        print(f"  [ERR] RSS feed error: {feed.bozo_exception}")
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_VIDEO_AGE_DAYS)
    entries = []

    for entry in feed.entries:
        video_id = extract_video_id(entry)
        if not video_id:
            continue

        # Parse published date
        published = entry.get("published_parsed") or entry.get("updated_parsed")
        if published:
            pub_dt = datetime(*published[:6], tzinfo=timezone.utc)
        else:
            pub_dt = datetime.now(timezone.utc)

        if pub_dt < cutoff:
            continue

        entries.append({
            "video_id": video_id,
            "video_url": f"https://www.youtube.com/watch?v={video_id}",
            "title": entry.get("title", "Untitled"),
            "channel_name": entry.get("author", "Unknown"),
            "published_at": pub_dt.isoformat(),
            "thumbnail_url": f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
        })

    print(f"  Found {len(entries)} recent entries (< {MAX_VIDEO_AGE_DAYS} days)")
    return entries


# ==============================================================================
# 4. DEDUPLICATION
# ==============================================================================

def fetch_existing_urls():
    """Fetch all existing video_url values from press_articles."""
    url = (
        f"{SUPABASE_URL}/rest/v1/press_articles"
        f"?select=video_url&video_url=not.is.null"
    )
    existing = set()
    offset = 0
    page_size = 1000

    while True:
        paginated = f"{url}&limit={page_size}&offset={offset}"
        resp = requests.get(paginated, headers=HEADERS_SUPABASE)
        if resp.status_code != 200:
            print(f"  [ERR] Dedup query failed ({resp.status_code}): {resp.text[:200]}")
            break
        rows = resp.json()
        for row in rows:
            if row.get("video_url"):
                existing.add(row["video_url"])
        if len(rows) < page_size:
            break
        offset += page_size

    return existing


# ==============================================================================
# 5. PIPELINE
# ==============================================================================

def process_video(entry):
    """Full pipeline for a single video: transcript → LLM → record."""
    video_id = entry["video_id"]
    print(f"\n  Processing: {entry['title'][:70]}")

    # Transcript
    transcript = fetch_transcript(video_id)
    if not transcript:
        return None

    print(f"    Transcript: {len(transcript)} chars")

    # Gemini
    prompt = build_prompt(transcript, entry["title"], entry["channel_name"])
    response = call_gemini(prompt)
    if not response:
        return None

    # Parse
    article_md, metadata = parse_llm_response(response)
    if not article_md:
        print("    [WARN] Empty article, skipping")
        return None

    tags = metadata.get("tags", []) if metadata else []
    strategic_score = metadata.get("strategic_score", 5) if metadata else 5
    set_tag = metadata.get("set_tag", "") if metadata else ""
    cards = metadata.get("cards", []) if metadata else []

    try:
        strategic_score = max(1, min(10, int(strategic_score)))
    except (ValueError, TypeError):
        strategic_score = 5

    return {
        "title": entry["title"],
        "summary": article_md,
        "video_url": entry["video_url"],
        "thumbnail_url": entry["thumbnail_url"],
        "channel_name": entry["channel_name"],
        "published_at": entry["published_at"],
        "tags": tags,
        "strategic_score": strategic_score,
        "set_tag": set_tag,
        "mentioned_cards": cards,
    }


# ==============================================================================
# 6. SUPABASE INSERT
# ==============================================================================

def insert_article(record):
    """Insert an article into press_articles."""
    url = f"{SUPABASE_URL}/rest/v1/press_articles"
    resp = requests.post(url, json=record, headers=HEADERS_SUPABASE)
    if resp.status_code in (200, 201):
        print(f"    ✅ Inserted: {record['title'][:50]}")
        return True
    else:
        print(f"    ❌ Insert failed ({resp.status_code}): {resp.text[:200]}")
        return False


# ==============================================================================
# 7. MAIN
# ==============================================================================

def main():
    print("=" * 60)
    print("  PRESS REVIEW ETL")
    print("=" * 60)

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[ERR] Missing SUPABASE_URL / SUPABASE_KEY")
        return
    if not GEMINI_API_KEY:
        print("[ERR] Missing GEMINI_API_KEY")
        return

    # 1. RSS
    entries = fetch_rss_entries()
    if not entries:
        print("  No entries found. Exiting.")
        return

    # 2. Dedup
    print("\n  Checking existing articles...")
    existing_urls = fetch_existing_urls()
    new_entries = [e for e in entries if e["video_url"] not in existing_urls]
    print(f"  {len(new_entries)} new video(s) to process (skipped {len(entries) - len(new_entries)})")

    if not new_entries:
        print("  Nothing to do. Exiting.")
        return

    # 3. Process
    inserted = 0
    for i, entry in enumerate(new_entries):
        record = process_video(entry)
        if record:
            if insert_article(record):
                inserted += 1
        # Rate limiting
        if i < len(new_entries) - 1:
            time.sleep(DELAY_BETWEEN_CALLS)

    print(f"\n{'=' * 60}")
    print(f"  Done: {inserted}/{len(new_entries)} articles inserted")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
