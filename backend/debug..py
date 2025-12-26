import requests
import json
from datetime import date

# --- CIBLE PRÉCISE ---
CARD_NAME = "Great Divide Guide"
SET_CODE = "TLA"
FORMAT = "ArenaDirect_Sealed"
COLORS = "WG"
START_DATE = "2025-11-18"
TODAY = date.today().strftime("%Y-%m-%d")

def inspect_raw_data():
    print(f"🕵️‍♂️ INSPECTION BRUTE : {CARD_NAME} ({COLORS})")
    
    # On reproduit exactement l'URL générée par votre ETL actuel
    url = (
        f"https://www.17lands.com/card_ratings/data?"
        f"expansion={SET_CODE}&"
        f"event_type={FORMAT}&"
        f"start_date={START_DATE}&"
        f"end_date={TODAY}&"
        f"colors={COLORS}&"
        f"combine_splash=false"
    )
    
    print(f"📡 GET URL : {url}")
    
    try:
        r = requests.get(url)
        data = r.json()
        
        # On cherche la carte dans le tas
        card_data = next((c for c in data if c['name'] == CARD_NAME), None)
        
        if card_data:
            print("\n✅ DONNÉES BRUTES RECUES DE 17LANDS :")
            print(json.dumps(card_data, indent=4))
            
            # Analyse spécifique du Win Rate
            gih = card_data.get('ever_drawn_win_rate')
            print(f"\n👉 Win Rate brut (ever_drawn_win_rate) : {gih}")
            print(f"👉 Type de donnée : {type(gih)}")
            
            if gih is None:
                print("\n🚨 ANALYSE : 17Lands renvoie 'null' pour le Win Rate.")
                print("   C'est la source du problème. Même avec des games, ils ne calculent pas le WR.")
            else:
                print("\n🟢 ANALYSE : Le Win Rate existe !")
                print("   Le problème vient donc de votre fonction 'safe_float' ou de l'insertion SQL.")
                
        else:
            print(f"❌ Carte '{CARD_NAME}' introuvable dans le JSON reçu.")
            
    except Exception as e:
        print(f"❌ Erreur technique : {e}")

if __name__ == "__main__":
    inspect_raw_data()