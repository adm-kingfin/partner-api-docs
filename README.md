# Kingfin Partner API — documentation site

Source of the public documentation site for the Kingfin Partner API:
https://adm-kingfin.github.io/partner-api-docs/

| Path | What |
|---|---|
| `docs/guide.md`, `docs/openapi.yaml`, `docs/llms.txt` | Generated — do not edit here, changes are overwritten |
| `docs/index.md`, `docs/changelog.md`, `docs/reference.md` | Site pages |

Preview locally:

```bash
pip install -r requirements.txt
mkdocs serve        # http://127.0.0.1:8000
```

Every push to `main` is published to GitHub Pages by GitHub Actions.
