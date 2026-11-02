---
title: Kingfin Partner API
hide: [navigation, toc]
---

<div class="kf-hero" markdown>

# Build on <span>Kingfin</span> Partner API

Server-to-server API for Kingfin partners: register traders from your product, sign them in to the platform with one link, and open deals on their behalf.

[Start integrating](guide.md){ .md-button .md-button--primary }
[API reference](reference.md){ .md-button }

</div>

<div class="grid cards" markdown>

-   **Authentication**

    ---

    API key plus whitelisted IPs for every request; a short-lived JWT for user-scoped calls.

    [Read more](guide.md#authentication)

-   **Typical flow**

    ---

    Register a user → issue a token → send them to the platform via SSO link → trade.

    [Read more](guide.md#typical-integration-flow)

-   **Rate limits & idempotency**

    ---

    Per-partner and per-user limits, and safe retries for opening deals.

    [Read more](guide.md#rate-limits)

-   **For AI assistants**

    ---

    A compact version of the guide for coding assistants: [`llms.txt`](llms.txt).
    OpenAPI spec for Postman and codegen: [`openapi.yaml`](openapi.yaml).

</div>

## Getting access

API keys are issued to contracted Kingfin partners. Send your Kingfin manager your server IP addresses and a default country for new users — see [Onboarding](guide.md#onboarding).
