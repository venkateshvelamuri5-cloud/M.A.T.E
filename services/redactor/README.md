# Redactor

Self-hosted PII redaction for user documents, built on Microsoft Presidio. The app sends user
document text here before storing it as searchable sections, so names, phone numbers, emails,
addresses and ID numbers (passport, CDC, Aadhaar, PAN) never reach a third-party LLM.

## Run

```bash
docker build -t mate-redactor services/redactor
docker run -p 8000:8000 -e REDACTION_SERVICE_TOKEN=<random secret> mate-redactor
```

Any small VM works (about 2 GB RAM for the spaCy model). Prefer a region in India if data
residency matters.

## Connect the app

Set these in the Vercel project:

- `REDACTION_SERVICE_URL`: e.g. `https://redactor.example.com`
- `REDACTION_SERVICE_TOKEN`: the same secret as above

Without `REDACTION_SERVICE_URL`, the app falls back to local pattern matching
(`src/services/documents/redaction.ts`), which catches structured IDs, emails and phone numbers
but not names or addresses. The local patterns also run on top of the service's output.

## API

`POST /redact` with `Authorization: Bearer <token>` and `{"texts": ["..."]}` returns
`{"texts": ["..."]}` in the same order. `GET /health` returns `{"ok": true}`.
