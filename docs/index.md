---
hide: [navigation, toc]
---

<div class="kf-hero" markdown>

# Build on <span>Kingfin</span> Partner API

Server-to-server API for Kingfin partners: register traders from your product, sign them in to the platform with one link, open deals on their behalf, and stream live quotes.

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

-   **Real-time quotes**

    ---

    A WebSocket with live prices of the trading pairs: subscribe to the pairs you need, or to all of them.

    [Read more](quotes-socket.md)

-   **For AI assistants**

    ---

    A compact version of the guide for coding assistants: [`llms.txt`](llms.txt).
    OpenAPI spec for Postman and codegen: [`openapi.yaml`](openapi.yaml).

</div>

## Getting access

API keys are issued to contracted Kingfin partners. Send your Kingfin manager your server IP addresses and a default country for new users — see [Onboarding](guide.md#onboarding).
