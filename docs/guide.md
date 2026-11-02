---
title: Integration guide
---

# Partner API — Integration Guide

S2S API for contracted partners: Telegram bots, external trading platforms, custom web-services.

Base URL: `https://gw.olymptrade.com/partner`

---


## Onboarding

To get access, send your manager:

| What | Why |
|---|---|
| **Server IP addresses** (single IPs or CIDR ranges) | Only requests from these addresses are accepted — see [Authentication](#authentication) |
| **Default country** (ISO 3166-1 alpha-2, e.g. `BR`) | Used when you register a user without `country` in [`POST /users/v1`](#post-usersv1) |

In return you receive:

- your **API key**;
- your [partner identifier](#your-partner-identifier) — affiliate ID or ref.

Check the setup with [`GET /ping/v1`](#get-pingv1) before going live. To change the IP list or the default country later, contact your manager.

---

## Authentication

Every request requires two things:

**1. API key** — sent as a header:
```
X-API-Key: <your-api-key>
```

**2. Whitelisted IP** — requests must originate from IPs agreed upon during onboarding. Requests from unlisted IPs return `403` even with a valid key.

A missing or unknown API key returns `401` / `unauthorized`.

### Your partner identifier

During onboarding you get one identifier:

- **affiliate ID** — for affiliate partners;
- **ref** (for example `inf_…` or `cpa_…`) — for influencer and CPA partners.

It decides which field you see in responses — `partner_id` (your affiliate ID) or `partner_ref` (your ref) — in `GET /ping/v1`. Users registered through the API are attributed to you by this identifier, as are users who arrive through your own referral links. You can issue tokens and SSO links only for users attributed to you.

### User-scoped requests

Some endpoints act on behalf of a specific user (accounts, deals). These additionally require a **Partner JWT**:

```
Authorization: Bearer <partner-jwt>
```

The JWT is issued by `POST /partner/token/v1`. It is:
- Valid for **15 minutes**
- No refresh token — issue a new one when it expires; a missing, invalid or expired token returns `401` / `unauthorized`
- Opaque: pass it as is, do not parse it or rely on its contents

A token is bound to your partner identifier: a token issued to another partner returns `403`.

The user's account state is re-checked on every user-scoped request as well. Once the account is blocked or deleted, a token issued before that gets `403 access_denied`, even before it expires. If the state cannot be checked, the request is refused the same way and can be retried. The refusal is not final: after the account is unblocked or restored, requests pass again.

---

## Error Format

All errors use the same JSON envelope regardless of status code:

```json
{
  "error": {
    "id": "invalid_request",
    "msg": "email already registered",
    "ctx": {
      "code": "email_exists"
    },
    "tid": "4bf92f3577b34da6"
  }
}
```

| Field | Description |
|-------|-------------|
| `id` | Machine-readable error category (see table below) |
| `msg` | Human-readable explanation |
| `ctx` | Optional details: `ctx.code` — specific error code within the category; some errors add more fields (`deal_id` — see [Idempotency](#idempotency), `limit` / `expired` — see [Rate Limits](#rate-limits)) |
| `tid` | Request trace ID — quote it when contacting support |

Branch on `id`, HTTP status and `ctx.code`. `msg` is for humans: its wording may change, do not parse it.

**Error categories (`id`):**

| `id` | HTTP | Meaning |
|------|------|---------|
| `invalid_request` | 400, 409, 422 | Bad input, validation failure, business rule violation |
| `unauthorized` | 401 | Missing or unknown API key; missing, invalid or expired partner JWT |
| `access_denied` | 403 | IP not whitelisted, your API access suspended (contact your manager), user belongs to another partner, user's account is blocked or deleted |
| `throttling` | 429 | Rate limit exceeded |
| `internal` | 500, 502 | Server-side error, retry with backoff |

---

## Typical Integration Flow

Most partner integrations follow this sequence:

```
1. [Once at onboarding]
   Send your server IPs and default country → receive API key

2. [When a new user arrives at your product]
   POST /partner/users/v1          → get user_id
   POST /partner/token/v1          → get partner JWT (15 min)

3. [When user wants to log into the platform]
   POST /partner/users/sso-link/v2 → get one-time URL
   Redirect user to that URL       → platform session created on the domain of the
                                     user's country, user lands on redirect_url

4. [When you need to trade on behalf of a user]
   POST /partner/token/v1          → get (or reuse) partner JWT
   GET  /partner/ftt/pairs/v1      → pick a pair
   GET  /partner/accounts/v1       → get account_id and check balance
   POST /partner/ftt/deals/v1      → open deal
   GET  /partner/ftt/deals/v1?ids= → poll result
```

---

## Endpoints

### GET /ping/v1

Connectivity check. Use this to verify your API key and IP are accepted before going live.

**Auth:** `X-API-Key`

**Response `200`:**
```json
{ "status": "ok", "partner_id": 42 }                // affiliate partner
{ "status": "ok", "partner_ref": "inf_example" }    // influencer or CPA partner
```

The response carries [your partner identifier](#your-partner-identifier). Use it to confirm you are identified correctly.

---

### POST /users/v1

Registers a new user on the platform on your behalf. No captcha, no email verification required.

**Auth:** `X-API-Key`

**Request:**
```json
{
  "email":    "user@example.com",
  "password": "optional-password",
  "country":  "RU"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `email` | Yes | Must be a valid email, 3–255 chars |
| `password` | No | If omitted, a random password is set — the user signs in through an [SSO link](#post-userssso-linkv2) |
| `country` | No | ISO 3166-1 alpha-2. If omitted, the default country agreed during onboarding is used |

The registered user is attributed to you by [your partner identifier](#your-partner-identifier). Two accounts are created for them: a real and a demo account, both in USD.

**Response `201`:**
```json
{
  "user_id": 123456
}
```

Save this `user_id` — you will need it for token issuance, SSO links, and deal operations.

**Errors:**

| HTTP | `ctx.code` | Meaning |
|------|-----------|---------|
| 400 | — | Malformed body or invalid field (e.g. bad email format); details in `msg` |
| 409 | `email_exists` | Email already registered on the platform |
| 403 | `country_not_allowed` | Registration is blocked for this country |
| 422 | `validation` | Registration data rejected by the platform |

---

### POST /token/v1

Issues a short-lived Partner JWT for a user. Required before calling user-scoped endpoints.

**Auth:** `X-API-Key`

**Request:**
```json
{
  "user_id": 123456
}
```

**Response `200`:**
```json
{
  "token":      "eyJhbGciOiJSUzI1NiJ9...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

`expires_in` is in seconds (900 = 15 minutes). There is no refresh — call this endpoint again when the token expires.

**Access rules:**
- The user must be [attributed to you](#your-partner-identifier).
- The user's account must be active: blocked or deleted accounts are refused. The state is read on every call, so a refusal is not final — once the account is unblocked or restored, the token is issued again.

Violations return `403` without revealing which check failed (to avoid user enumeration).

---

### POST /users/sso-link/v2

Generates a one-time URL that signs the user in to the platform on the domain that serves their country and redirects them to a specific page.

**Auth:** `X-API-Key`

**Request:**
```json
{
  "user_id":      123456,
  "redirect_url": "/payin"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `user_id` | Yes | Must be [attributed to you](#your-partner-identifier) |
| `redirect_url` | Yes | Relative path only (e.g. `/payin`, `/trading`). Absolute URLs are rejected with `400`. |

**Access rules:** the same checks as `POST /token/v1` — the user is attributed to you and the account is active. Violations return `403`.

**Response `200`:**
```json
{
  "url":        "https://<host>/callback/partner-sso/v2/route?token=abc123",
  "expires_at": 1753700000
}
```

The link carries the token only: `redirect_url` travels inside it and cannot be changed on the way.

The link expires in **3 hours** (`expires_at` is a Unix timestamp) and works **once**. A user has at most one live link: issuing a new one cancels the previous one. Link previews in messengers do not use the link up.

**Usage:** Redirect the user's browser to `url`. The platform will:
1. Validate the one-time token
2. Repeat the access checks: your API access is still active, the user is still yours and the account is still active. If any check fails, no session is created and the browser is redirected to the platform's default page; the link is used up.
3. Refine the user's country from where the link is opened and pick the platform domain for that country
4. Create a platform session on that domain and redirect the browser to `redirect_url`

The country domain is chosen when the link is opened, not when it is issued: do not rely on the host of `url`.

**Rate limit:** max 30 SSO links per user per hour. Exceeding this returns `429`.

---

### GET /accounts/v1

Lists all trading accounts with current balances for the authenticated user.

**Auth:** `X-API-Key` + `Authorization: Bearer <partner-jwt>`

**Response `200`:**
```json
{
  "accounts": [
    {
      "id":       7890001,
      "type":     "real",
      "currency": "USD",
      "balance":  1000.00
    },
    {
      "id":       7890002,
      "type":     "demo",
      "currency": "USD",
      "balance":  10000.00
    }
  ]
}
```

**Account types:**

| `type` | Description |
|--------|-------------|
| `real` | Real money account |
| `demo` | Demo account (virtual funds) |

Use the account's `id` as `account_id` when opening deals.

---

### POST /ftt/deals/v1

Opens a Fixed Time Trade deal for the authenticated user.

**Auth:** `X-API-Key` + `Authorization: Bearer <partner-jwt>`

**Required header:**
```
Idempotency-Key: <unique-string>
```

See [Idempotency](#idempotency) for details.

**Request:**
```json
{
  "account_id": 7890001,
  "amount":     10.00,
  "dir":        "up",
  "pair":       "EURUSD",
  "group":      "real",
  "duration":   60
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `account_id` | Yes | From `GET /accounts/v1` |
| `amount` | Yes | Deal amount in the account's currency, must be > 0 |
| `dir` | Yes | `up` (call) or `down` (put) |
| `pair` | Yes | Pair ID from `GET /ftt/pairs/v1` |
| `group` | Yes | `real` or `demo` — must match the account's type |
| `duration` | Yes | Duration in seconds; must be within the pair's `min_duration`–`max_duration` range |

**Response `201` (new deal):**
```json
{
  "deal": {
    "id":          555001,
    "account_id":  7890001,
    "status":      "proceed",
    "pair":        "EURUSD",
    "dir":         "up",
    "amount":      10.00,
    "group":       "real",
    "win_percent": 82,
    "time_open":   1753700000,
    "time_close":  1753700060
  }
}
```

**Deal fields:**

| Field | Description |
|-------|-------------|
| `id` | Deal ID, use for polling via `GET /ftt/deals/v1?group=real&ids=` |
| `account_id` | Account the deal was opened on. Use it to tell apart deals of two accounts within the same `group` |
| `status` | `proceed` while the deal is open; after `time_close` one of: `win`, `loose` (lost), `standoff` (closed at the opening price), `cancel` (cancelled by the platform), `error` (closed with a platform error — contact support with the deal `id`) |
| `win_percent` | Payout percentage locked at deal open time |
| `time_open` / `time_close` | Unix timestamps |

**Business errors (`422`):**

| `ctx.code` | Meaning |
|-----------|---------|
| `insufficiently funds` | Not enough balance on the account |
| `not enough money to trade`, `common not enough real funds`, `insufficient bonus balance` | The balance does not cover the deal |
| `amount limit` | `amount` is outside the allowed range — see [`GET /ftt/deals/v1/limits`](#get-fttdealsv1limits) |
| `pair amount limit`, `all pairs amount limit`, `pair amount time limit exceed`, `all pairs amount time limit exceed` and their `(minute)` / `(hour)` / `(day)` variants | Trading volume limit for the pair or across all pairs reached |
| `max deal limit exceed` | Too many open deals |
| `invalid duration` | `duration` is outside the pair's `min_duration`–`max_duration` |
| `pair unavailable`, `pair unavailable on open`, `pair unavailable on close`, `quotes not available` | The pair cannot be traded right now |
| `account not found` | `account_id` cannot be used for this deal |
| `location not allowed`, `restricted personally` | Trading is not allowed for this user |
| `validation` | Request data rejected |
| `idempotency_key_conflict` | Same key was used with a different request body |

Codes are lowercase text, some with spaces and parentheses — compare them exactly as listed. Other codes may appear; treat any `422` as "the deal was not opened".

**Other errors:**

| HTTP | `ctx.code` | Meaning |
|------|-----------|---------|
| 400 | `idempotency_key_required` | `Idempotency-Key` header missing or not 8–128 characters |
| 400 | — | Malformed body or invalid field; details in `msg` |
| 409 | `idempotency_key_in_flight` | Same key and body already submitted — see [Idempotency](#idempotency) |

---

### GET /ftt/deals/v1

Fetches deals by their IDs. Only deals belonging to the authenticated user are returned.

**Auth:** `X-API-Key` + `Authorization: Bearer <partner-jwt>`

**Query params:**

| Param | Required | Notes |
|-------|----------|-------|
| `group` | Yes | `real` or `demo` — must match the group the deal was opened with |
| `ids` | No | Comma-separated deal IDs, max 100. Returns empty array if omitted. |

**Example:**
```
GET /partner/ftt/deals/v1?group=real&ids=555001,555002
```

**Response `200`:**
```json
{
  "deals": [
    {
      "id":          555001,
      "account_id":  7890001,
      "status":      "win",
      "pair":        "EURUSD",
      "dir":         "up",
      "amount":      10.00,
      "group":       "real",
      "win_percent": 82,
      "time_open":   1753700000,
      "time_close":  1753700060
    }
  ]
}
```

Use this to poll deal results after `time_close` has passed: poll until `status` is no longer `proceed`.

**Errors:**

| HTTP | `ctx.code` | Meaning |
|------|-----------|---------|
| 400 | `invalid_group` | `group` missing or not `real` / `demo` |
| 400 | `too_many_ids` | More than 100 IDs |
| 400 | `invalid_ids` | An ID is not a positive integer |

---

### GET /ftt/deals/v1/limits

Returns minimum and default deal amounts per currency.

**Auth:** `X-API-Key` + `Authorization: Bearer <partner-jwt>`

**Response `200`:**
```json
{
  "limits": [
    { "currency": "USD", "min": 1.00, "default": 1.00 },
    { "currency": "EUR", "min": 1.00, "default": 1.00 }
  ]
}
```

Validate `amount` against `min` before submitting a deal to avoid `422` errors.

---

### GET /ftt/pairs/v1

Returns all trading pairs currently available for FTT deals.

**Auth:** `X-API-Key` (no user JWT required)

**Response `200`:**
```json
{
  "pairs": [
    {
      "id":           "EURUSD",
      "title":        "EUR/USD",
      "group":        "forex",
      "precision":    5,
      "min_duration": 30,
      "max_duration": 300,
      "time_close":   1790542800,
      "time_open":    1790546400,
      "win_percent":  82
    },
    {
      "id":           "BTCUSD",
      "title":        "BTC/USD",
      "group":        "crypto",
      "precision":    2,
      "min_duration": 60,
      "max_duration": 600
    }
  ]
}
```

**Pair fields:**

| Field | Description |
|-------|-------------|
| `id` | Use as `pair` in deal requests |
| `title` | Display name |
| `group` | Asset class (`forex`, `crypto`, …) — not the same as the deal `group` (`real` / `demo`) |
| `precision` | Number of decimal places in the asset price |
| `min_duration` / `max_duration` | Allowed deal duration range in seconds |
| `time_close` / `time_open` | The pair's next trading break, as Unix timestamps: trading stops at `time_close` and resumes at `time_open`, so `time_close` comes first. Both are usually in the future. A pair with no break scheduled trades 24/7 and has **neither field** in the response (`BTCUSD` above) — check whether the key is present, do not compare it with `0`. |
| `win_percent` | Current payout percentage. Omitted if not available. |

Disabled and locked pairs are excluded from the response automatically: every pair in the list can be traded right now, until its `time_close`. During a break the pair disappears from the list and returns at `time_open`. Cache this list for a few minutes — it changes infrequently, but do not open deals on a cached pair past its `time_close`.

---

## Rate Limits

| Scope | Limit |
|-------|-------|
| Per partner — all endpoints together, per [partner identifier](#your-partner-identifier) | 600 requests per minute |
| Per user — user-scoped endpoints, per user ID | 100 requests per minute |
| SSO links per user | 30 links per hour |

When a limit is exceeded, the response is:
```json
HTTP 429
{
  "error": {
    "id": "throttling",
    "msg": "Too many requests",
    "ctx": { "limit": 600, "expired": 1753700060.123 }
  }
}
```

`ctx.limit` is the limit that was hit, `ctx.expired` is when its window resets (Unix timestamp in seconds, with a fractional millisecond part). Retry after that moment.

---

## Idempotency

`POST /ftt/deals/v1` requires an `Idempotency-Key` header to prevent duplicate deals on retries.

**Rules:**
- Length: 8–128 characters
- Generate a unique key per deal attempt (e.g. UUID, order ID)
- If the same key is submitted again within 24 hours **with the same request body**, the request is rejected with `409` / `idempotency_key_in_flight` — no second deal is created. If the deal was opened, the error carries its ID in `error.ctx.deal_id` — use it to poll `GET /ftt/deals/v1?group=...&ids=<deal_id>`:
  ```json
  HTTP 409
  {
    "error": {
      "id": "invalid_request",
      "msg": "idempotency key in-flight: retry with the same key or poll by deal_id",
      "ctx": { "code": "idempotency_key_in_flight", "deal_id": 555001 }
    }
  }
  ```
- If the same key is submitted with a **different body**, the request is rejected with `422` / `idempotency_key_conflict`
- Keys are scoped to your partner identifier: the same key value used by another partner does not collide with yours.

**Example key generation (Python):**
```python
import uuid
idempotency_key = str(uuid.uuid4())  # "f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

**Recommended retry strategy:**
1. Send the request with an idempotency key
2. On `422` business error (`insufficiently funds`, etc.): the deal was **not** opened — retry with the **same key** is safe
3. On network error or `5xx` / timeout: the outcome is **unknown** — retry with the **same key**, never with a new one. The key stays reserved precisely so that a retry tells you what happened:
   - `201` → the first attempt never reached the platform; the deal is opened now
   - `409` / `idempotency_key_in_flight` → the first attempt got through; see step 4
   A new key after a timeout can open a **second deal** if the first one went through.
4. On `409` / `idempotency_key_in_flight`:
   - `error.ctx.deal_id` present → the deal was opened; poll `GET /ftt/deals/v1?group=...&ids=<deal_id>`
   - `error.ctx.deal_id` absent → the first attempt is still in progress or ended ambiguously; retry with the same key after a few seconds. If `deal_id` still does not appear, treat the deal as unresolved and contact support — do not open it again with a new key
5. On `429`: wait and retry with the **same key**
