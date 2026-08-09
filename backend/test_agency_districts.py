"""
test_agency_districts.py

Standalone diagnostic — hits your RUNNING backend's real chat API (no code
changes needed) and asks the same travel-agency question for every district,
one after another. Prints the full bot reply for each so you can see, in one
shot, exactly which districts answer correctly and which ones fail.

USAGE:
    pip install requests
    python test_agency_districts.py

If your backend isn't on http://localhost:8000, change BASE_URL below.
"""

import json
import requests

# ── Change this if your backend runs somewhere else ─────────────────────────
BASE_URL = "http://localhost:8000"

DISTRICTS = ["Gangtok", "Mangan", "Namchi", "Soreng", "Gyalshing", "Pakyong"]

# We test two different phrasings per district, since wording can change
# which code path the backend takes.
QUESTION_TEMPLATES = [
    "How many travel agencies are in {district}?",
    "List travel agencies in {district}",
]


def create_conversation() -> str:
    resp = requests.post(f"{BASE_URL}/api/conversations", timeout=15)
    resp.raise_for_status()
    data = resp.json()
    return data["conversation"]["id"]


def send_message(conversation_id: str, message: str) -> str:
    """Send one message, read the streamed SSE response, return full text."""
    url = f"{BASE_URL}/api/conversations/{conversation_id}/chat"
    full_reply = ""
    with requests.post(
            url,
            json={"message": message},
            stream=True,
            timeout=60,
    ) as resp:
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

    results = {}

    for district in DISTRICTS:
        # Fresh conversation per district so history from one district
        # question can't leak into / help the next one.
        conversation_id = create_conversation()

        for template in QUESTION_TEMPLATES:
            question = template.format(district=district)
            print("=" * 80)
            print(f"DISTRICT: {district}")
            print(f"Q: {question}")
            try:
                reply = send_message(conversation_id, question)
            except Exception as exc:
                reply = f"[ERROR calling backend: {exc}]"
            print(f"A: {reply}\n")

            results.setdefault(district, []).append(
                {"question": question, "reply": reply}
            )

    # ── Simple pass/fail heuristic summary ──────────────────────────────────
    print("=" * 80)
    print("SUMMARY (heuristic — 'fail' = reply contains a no-data phrase)")
    print("=" * 80)
    fail_phrases = [
        "do not have", "don't have", "no official record",
        "no data", "not on file", "unable to find", "couldn't find",
    ]
    for district, entries in results.items():
        for entry in entries:
            reply_lower = entry["reply"].lower()
            looks_failed = any(p in reply_lower for p in fail_phrases)
            status = "FAIL?" if looks_failed else "ok"
            print(f"[{status:5}] {district:10} | {entry['question']}")


if __name__ == "__main__":
    main()