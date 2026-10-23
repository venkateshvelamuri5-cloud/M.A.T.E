"""
M.A.T.E PII redaction service.

Runs Microsoft Presidio on our own server so user documents are redacted before any text is
stored as chunks or sent to a third-party LLM. POST /redact {"texts": [...]} -> {"texts": [...]}.
"""
import os

from fastapi import Depends, FastAPI, Header, HTTPException
from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig
from pydantic import BaseModel

API_TOKEN = os.environ.get("REDACTION_SERVICE_TOKEN", "")

ENTITIES = [
    "PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER", "LOCATION", "CREDIT_CARD", "IBAN_CODE",
    "IP_ADDRESS", "US_SSN", "IN_PAN", "IN_AADHAAR", "IN_PASSPORT", "MARINER_CDC",
]

analyzer = AnalyzerEngine()
analyzer.registry.add_recognizer(PatternRecognizer(
    supported_entity="MARINER_CDC",
    patterns=[Pattern("cdc", r"\b(?:MUM|CAL|KOL|CHN|MAA|DEL|KOC|GOA|VSK)\s?-?\s?\d{5,7}\b", 0.6)],
    context=["cdc", "discharge", "seaman", "book"],
))
anonymizer = AnonymizerEngine()
operators = {"DEFAULT": OperatorConfig("replace", {"new_value": "[REDACTED]"})}
operators.update({e: OperatorConfig("replace", {"new_value": f"[{e}_REDACTED]"}) for e in ENTITIES})

app = FastAPI(title="M.A.T.E redactor")


class RedactRequest(BaseModel):
    texts: list[str]


def check_token(authorization: str = Header(default="")) -> None:
    if API_TOKEN and authorization != f"Bearer {API_TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid token")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/redact", dependencies=[Depends(check_token)])
def redact(req: RedactRequest) -> dict:
    supported = set(analyzer.get_supported_entities(language="en"))
    entities = [e for e in ENTITIES if e in supported]
    out = []
    for text in req.texts:
        results = analyzer.analyze(text=text, language="en", entities=entities, score_threshold=0.5)
        out.append(anonymizer.anonymize(text=text, analyzer_results=results, operators=operators).text)
    return {"texts": out}
