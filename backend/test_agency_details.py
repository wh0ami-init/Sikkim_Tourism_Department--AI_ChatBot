"""
test_agency_details.py

Tests the exact scenario you described: ask the chatbot for full DETAILS
of one specific named travel agency in Gangtok, then details of one
specific named travel agency in another district — back to back — and
print both replies so we can see exactly where it breaks.

It pulls one REAL agency name per district straight from your own
/api/admin/travel-agencies endpoint (so we're not guessing names), then
asks the chatbot about each by name.

USAGE:
    pip install requests
    python test_agency_details.py

Fill in BASE_URL / ADMIN_USERNAME / ADMIN_PASSWORD below first.
"""

import json
import requests
from requests.auth import HTTPBasicAuth

# ── EDIT THESE ───────────────────────────────────────────────────────────
BASE_URL = "http://localhost:8000"
ADMIN_USERNAME = "admin"       # your admin login
ADMIN_PASSWORD = "TourismAdmin000"    # your admin password
# ─────────────────────────────────────────────────────────────────────────

DISTRICTS = ["Gangtok", "Mangan", "Namchi", "Soreng", "Gyalshing", "Pakyong"]
AUTH = HTTPBasicAuth(ADMIN_USERNAME, ADMIN_PASSWORD)


def get_sample_agency(district: str) -> dict | None:
    """Pull one real agency record for this district via the admin endpoint."""
    resp = requests.get(
        f"{BASE_URL}/api/admin/travel-agencies",
        params={"district": district, "limit": 1},
        auth=AUTH,
        timeout=15,
    )
    resp.raise_for_status()
    rows = resp.json()
    return rows[0] if rows else None


def create_conversation() -> str:
    resp = requests.post(f"{BASE_URL}/api/conversations", timeout=15)
    resp.raise_for_status()
    return resp.json()["conversation"]["id"]


def send_message(conversation_id: str, message: str) -> str:
    """Send one message, read the streamed SSE response, return full text."""
    url = f"{BASE_URL}/api/conversations/{conversation_id}/chat"
    full_reply = ""
    with requests.post(url, json={"message": message}, stream=True, timeout=60) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            payload = line[len("data:"):].strip()
            if not payload:
                continue
            try:
                chunk = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if "text" in chunk:
                full_reply += chunk["text"]
    return full_reply


def main():
    print(f"Connecting to backend at {BASE_URL} ...\n")

    # 1. Grab one real agency name per district straight from the DB.
    samples = {}
    for district in DISTRICTS:
        try:
            agency = get_sample_agency(district)
        except Exception as exc:
            print(f"[!] Could not fetch a sample agency for {district}: {exc}")
            agency = None
        samples[district] = agency
        if agency:
            print(f"{district:10} sample agency -> {agency.get('name')!r}")
        else:
            print(f"{district:10} sample agency -> NONE FOUND (empty district in DB?)")
    print()

    # 2. Ask the chatbot about each one, in a single running conversation —
    #    Gangtok first (the one that works), then each other district right
    #    after it, exactly like your real usage pattern.
    conversation_id = create_conversation()
    ordered_districts = ["Gangtok"] + [d for d in DISTRICTS if d != "Gangtok"]

    for district in ordered_districts:
        agency = samples.get(district)
        if not agency or not agency.get("name"):
            print("=" * 80)
            print(f"DISTRICT: {district} — skipped, no sample agency available")
            continue

        name = agency["name"]
        question = f"Can you give me the details of {name} travel agency?"

        print("=" * 80)
        print(f"DISTRICT: {district}")
        print(f"Q: {question}")
        try:
            reply = send_message(conversation_id, question)
        except Exception as exc:
            reply = f"[ERROR calling backend: {exc}]"
        print(f"A: {reply}\n")


if __name__ == "__main__":
    main()