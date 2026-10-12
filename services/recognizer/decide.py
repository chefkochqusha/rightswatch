"""The app's decision rule (`src/modules/recognition/decide.ts`,
`decideRecognition`) in Python, for offline tests on real music
(`real_test.py`). Both are checked against the same cases
(`decide_cases.json`), so they can't drift apart unnoticed.

MATCH: the top song clearly ahead (ratio), winning at least half the post's
windows, and the melody agrees. CANDIDATE: a suggestion a person confirms.
NO_MATCH: nothing stood out.
"""
from __future__ import annotations

DEFAULTS = {
    "matchRatio": 3.0,
    "candidateRatio": 1.6,
    "minScore": 60.0,
    "minWindowShare": 0.5,
    "ratioFloor": 20.0,
    "minMelodyAgreement": 0.7,
}


def decide(result: dict, t: dict | None = None) -> dict:
    t = {**DEFAULTS, **(t or {})}
    t["candidateRatio"] = min(t["candidateRatio"], t["matchRatio"])
    candidates = result.get("candidates") or []
    top = candidates[0] if candidates else None
    if top is None:
        return {"outcome": "NO_MATCH", "trackId": None, "ratio": 0.0, "score": 0.0}
    # reported even when the score is too low, so a test can see how close it came
    ratio = top["score"] / max(top["nextScore"], t["ratioFloor"])
    if top["score"] < t["minScore"]:
        return {"outcome": "NO_MATCH", "trackId": None, "ratio": ratio, "score": top["score"]}
    windows = result.get("windows") or 0
    share = top["windowsWon"] / windows if windows > 0 else 0.0
    melody = top.get("melodyAgreement")
    strong = ratio >= t["matchRatio"] and share >= t["minWindowShare"]
    if strong and melody is not None and melody >= t["minMelodyAgreement"]:
        outcome = "MATCH"
    elif strong or ratio >= t["candidateRatio"]:
        outcome = "CANDIDATE"
    else:
        return {"outcome": "NO_MATCH", "trackId": None, "ratio": ratio, "score": top["score"]}
    return {"outcome": outcome, "trackId": top["trackId"], "ratio": ratio, "score": top["score"]}
