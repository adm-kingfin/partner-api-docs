---
title: Partner WebSocket
---

# Partner WebSocket — Integration Guide

Real-time data over a WebSocket, in two channels you subscribe to independently on the same connection:

- **Quotes** — prices of the trading pairs. You subscribe to the pairs you need, or to all of them, and receive the mid price each time it changes.
- **Account** — deal closes and balance changes of all your users, real and demo. See [Account events](#account-events).

The socket uses the same credentials as the Partner API: your **API key** and your **whitelisted server IPs**. No user token is needed — quotes are not tied to a user, and the account channel carries the events of all your users at once.

Endpoint: `wss://partner-ws.1f3d4.tech/`

---

## Connecting

Open a WebSocket to the endpoint with your API key in a header:

| Header | Value |
|--------|-------|
| `X-API-Key` | Your API key — the same one you use for the Partner API |
| `User-Agent` | Any value that identifies your application, e.g. `acme-quotes/1.4`. Some generic library defaults are rejected at the network edge (Python's `Python-urllib`), so set your own. |

The connection must come from one of your whitelisted IPs. `Origin` is not checked — the socket is meant for server-to-server use.

**Connections per key.** One connection carries any number of pairs and the account channel; one or two connections are usually enough. Keep it under 10 concurrent connections per API key: above that, new connections may be refused with `connection_limit`.

### Refused connection

The handshake always completes (`101 Switching Protocols`). If the connection is not allowed, the server closes it right away, before sending any event, with close code `1008` and the reason as the close message:

| Close reason | Meaning |
|--------------|---------|
| `missing_key` | No `X-API-Key` header |
| `invalid_key` | The key is unknown |
| `ip_not_allowed` | The connection comes from an IP that is not whitelisted for this key |
| `inactive` | API access for this key is suspended — contact your manager |
| `connection_limit` | This server already holds the maximum number of connections for this key |

Read the close code and message from your WebSocket library: an HTTP status is not used for these refusals.

**Connection attempts are rate-limited per IP.** Too many attempts in a short time are rejected before the handshake with an HTTP error (`429`, which may reach you as `502`). Reconnect with a backoff — see [Reconnecting](#reconnecting).

---

## Frames

Every frame, in both directions, is a **JSON array of events**. A frame may carry several events: always process the whole array, never just the first element.

```json
[{"e": 12, "t": 2, "uuid": "sub-1", "d": [{"pair": "EURUSD"}]}]
```

| Field | Description |
|-------|-------------|
| `e` | Event code — see [Events reference](#events-reference) |
| `t` | Event type: `1` push from the server (default when omitted), `2` request from you, `3` response to your request |
| `uuid` | Your request ID; the response carries the same `uuid`. Any string, unique among your pending requests |
| `d` | Event data |
| `err` | Present in a failed response instead of `d` — see [Errors](#errors) |

A response to a request has the same `e` and `uuid` and `t: 3`. Responses to your requests come in the order you sent them.

---

## Subscribing to quotes

Subscribe with event `12`, listing pairs in `d`:

```json
[{"e": 12, "t": 2, "uuid": "sub-1", "d": [{"pair": "EURUSD"}, {"pair": "GBPUSD"}]}]
```

Response:

```json
[{"e": 12, "t": 3, "uuid": "sub-1"}]
```

- **Pair IDs** are the `id` values from [`GET /ftt/pairs/v1`](guide.md#get-fttpairsv1).
- **All pairs:** `{"pair": "*"}` subscribes to every pair, including pairs that appear later.
- **All or nothing:** if any pair in the request is unknown or disabled, the whole request fails with `invalid_request` and your subscriptions do not change.
- **No limit on the number of pairs.** Subscribing to a pair twice, or to a pair and to `*`, does not duplicate ticks.
- **No snapshot:** the first tick of a pair arrives with its next price change, not at the moment you subscribe. Quiet pairs (for example, during a trading break) may send nothing for a long time.

Unsubscribe with event `13` and the same `d`:

```json
[{"e": 13, "t": 2, "uuid": "unsub-1", "d": [{"pair": "GBPUSD"}]}]
```

Unsubscribing from `*` removes only the "all pairs" subscription; pairs you subscribed to by name stay.

Subscriptions belong to the connection: after a reconnect, subscribe again.

---

## Ticks

Each price change of a subscribed pair arrives as event `1`. Several ticks in one frame come as several events — iterate over every event of the frame and over every item of its `d`:

```json
[{"e": 1, "d": [{"p": "EURUSD", "t": 1793633897.821, "q": 1.11976}]}, {"e": 1, "d": [{"p": "GBPUSD", "t": 1793633897.84, "q": 1.33012}]}]
```

| Field | Description |
|-------|-------------|
| `p` | Pair ID |
| `t` | Price time: Unix time in seconds with milliseconds (a number, e.g. `1793633897.821`) |
| `q` | Mid price, rounded to the pair's `precision` |

**Keep the latest tick per pair by `t`.** Ticks of one pair never arrive out of order, but compare `t` if you merge several connections.

### Slow readers

Read the socket continuously and process ticks off the reading thread. If your client falls behind, the server keeps only the **latest** unsent price per pair instead of a queue of stale ones, so you catch up quickly. Data already on its way through the network is still delivered first — after a pause, expect a burst of older ticks before the current ones.

A client that stops reading entirely is disconnected without a close frame: once the network buffers are full, a write that takes more than 10 seconds drops the connection; if nothing is being sent (quiet pairs), the 60-second ping timeout applies — see [Keep-alive](#keep-alive) and [Reconnecting](#reconnecting).

---

## Account events

The account channel pushes two kinds of events about **all your users** — the same users you can access through the Partner API:

| Event | When | Data |
|-------|------|------|
| `400` | A deal of your user is closed | The deal object of [`GET /ftt/deals/v1`](guide.md#get-fttdealsv1) plus `user_id` |
| `300` | The balance of your user's account has changed | The account object of [`GET /accounts/v1`](guide.md#get-accountsv1) plus `user_id` |

Real and demo accounts come in the same channel: open demo deals with a test user to check your integration.

### Subscribing

Subscribe with event `100`. With `d` omitted, `null` or an empty array you subscribe to **every** account event — the ones in the table above and any event added to the channel later:

```json
[{"e": 100, "t": 2, "uuid": "acc-1"}]
```

Response:

```json
[{"e": 100, "t": 3, "uuid": "acc-1"}]
```

To receive only some events, list their codes in `d` — for example, deal closes only:

```json
[{"e": 100, "t": 2, "uuid": "acc-1", "d": [400]}]
```

- You receive the events that happen **after** the response. The first event always comes after it.
- Subscriptions add up: `[300]` and then `[400]` gives both. A `100` without codes after some codes widens the subscription to every event, without a gap.
- The request fails with `invalid_request` and the subscription stays as it was if a code is unknown, is listed twice or is subscribed already, or if you are subscribed to every event already. Events are never duplicated.
- Each subscribed connection receives the events it subscribed to. If you subscribe on two connections, each of them gets them.

Unsubscribe with event `101`. With codes in `d` it stops only those codes, the others keep coming; without `d` (or with `null` or `[]`) it cancels the whole subscription. No event of an unsubscribed code comes after the response. A code you are not subscribed to is skipped, and without a subscription `101` just answers:

```json
[{"e": 101, "t": 2, "uuid": "acc-2", "d": [300]}]
```

Unsubscribing a code from a subscription to every event leaves the other codes the channel has now: events added to the channel later will not come. To get every event again, send `100` without codes.

### Deal close — `400`

```json
[{"e": 400, "d": [{"user_id": 42, "id": 555001, "account_id": 7890001, "status": "win", "pair": "EURUSD", "dir": "up", "amount": 10.00, "group": "real", "win_percent": 82, "time_open": 1753700000, "time_close": 1753700060}]}]
```

The fields, types and values are the same as in `GET /ftt/deals/v1` for this deal, so one parser serves both; `user_id` is added because the channel carries all your users. `status` is one of the final statuses — `proceed` never comes here. Deals of real and demo accounts are numbered separately: identify a deal by `group` **and** `id`.

### Balance change — `300`

```json
[{"e": 300, "d": [{"user_id": 42, "id": 7890001, "type": "real", "currency": "USD", "balance": 1018.2}]}]
```

The fields and values are the same as in `GET /accounts/v1`: `balance` is the balance of the account after the change, main plus bonus. The amount and the kind of the operation are not sent: treat `balance` as the latest state of the account, not as a transaction log.

**Opening a deal does not change the balance** and sends no `300`. The balance changes when the deal is closed — a `300` comes together with the `400` — and on deposits, withdrawals and other operations on the account.

### Delivery guarantees

The account channel is a **live stream**: it speeds up your integration, but **the REST API stays the source of truth**.

- **No replay.** Events that happened while you were not connected or not subscribed are not sent later. There are no sequence numbers and no way to resume from a position.
- **At least once.** While the connection is open and subscribed, every event is delivered, but an event may come **twice**. Process a deal close once per `group` + `id`; for an account, keep the latest `balance`.
- **Order.** Events come in the order they were published for you. A deal close and the balance change it caused may come in either order, and a balance event may briefly show an older value — the next event of that account corrects it.
- **Never dropped on a slow connection.** Unlike ticks, account events are not replaced or skipped. Each connection keeps up to **1000** unsent account events; if your client does not read fast enough and the queue overflows, the connection is closed with `1008` and the reason `lagging`. Ticks of the connection do not wait behind account events.

**Recover with a snapshot.** After every connect, reconnect, `1008 lagging` or unsubscribe:

1. Subscribe with `100` and wait for the response.
2. Then read the current state over REST: `GET /accounts/v1` for the balances and `GET /ftt/deals/v1` for the deals you are waiting for.

Everything after the subscription comes through the channel; everything before it is covered by the snapshot. Events and the snapshot may overlap — deduplicate as above. Reconcile with REST periodically as well: the channel does not promise that no event is ever lost.

---

## Errors

A failed request gets a response with `err` and no `d`. The connection stays open.

```json
[{"e": 12, "t": 3, "uuid": "sub-1", "err": [{"mess": "unknown pair: XYZ", "code": "invalid_request"}]}]
```

| `code` | When |
|--------|------|
| `invalid_request` | The frame is not a JSON array, the data does not match the event, or a pair is unknown. For the account channel: an event code is unknown (`unknown event code: 500`), listed twice (`duplicate event code: 400`) or subscribed already (`already subscribed: 400`; `already subscribed` for a repeated `100` while subscribed to every event). If the frame could not be parsed at all, the response has `e: 0` and no `uuid` |
| `unknown_event` | The event code is not supported |
| `system_error` | Internal error — retry the request; contact support if it persists |

`mess` is a human-readable explanation; build your logic on `code`.

---

## Keep-alive

The server sends a WebSocket ping every 15 seconds. Standard WebSocket libraries answer pings automatically — make sure yours does and that its pong is not blocked by your own processing. A connection that does not answer for about 60 seconds is closed.

You do not need to send anything to keep an idle connection open.

---

## Reconnecting

Connections do not live forever: the service is updated from time to time, and network paths change. Treat a disconnect as normal and reconnect automatically.

**Planned restart.** The server sends event `220` and closes the connection a few seconds later with close code `1012` (`Reconnect required`). Reconnect right away — another server accepts the connection — and subscribe again. With the account channel, take the REST snapshot after subscribing: events between the two connections are not replayed.

```json
[{"e": 220, "d": []}]
```

**Any other disconnect.** Reconnect with an exponential backoff: start at about 1 second, double on each failed attempt, cap at 30–60 seconds, reset after a connection that lived for a while. Do not retry `invalid_key`, `ip_not_allowed` or `inactive` in a loop — they will not pass until the setup is fixed.

### Close codes

| Code | Reason | What to do |
|------|--------|------------|
| `1008` | `missing_key`, `invalid_key`, `ip_not_allowed`, `inactive`, `connection_limit` | The connection was refused — see [Refused connection](#refused-connection) |
| `1008` | `card changed: <reason>` | Your access changed while connected: the key was revoked (`invalid_key`), suspended (`inactive`) or this IP was removed (`ip_not_allowed`). Fix the setup before reconnecting |
| `1008` | `lagging` | Your client did not read account events fast enough — reconnect, subscribe and take the REST snapshot (see [Delivery guarantees](#delivery-guarantees)) |
| `1008` | `card changed: partner_changed` | The [partner identifier](guide.md#your-partner-identifier) of your key has changed (agreed with your manager). Reconnect: the new connection carries the users of the new identifier |
| `1008` | `too many pending responses` | Too many requests were sent without reading the responses. Read the socket continuously |
| `1009` | — | A frame you sent is larger than 64 KiB |
| `1012` | `Reconnect required` | Planned restart — reconnect |
| none | — | The connection was dropped (network, or the client stopped reading) — reconnect with backoff |

**Closing the connection yourself.** When your client closes the connection (code `1000`), the server's answering close frame may not get through the network edge: about a second later your library reports an abnormal closure (`1006`, or end of stream) instead of a clean close. This is a normal shutdown — the connection is closed on the server too; do not treat it as an error and do not reconnect.

---

## Events reference

Generated from the service code. Every event travels inside a frame — a JSON array.

| Code | Name | Direction | Summary |
|------|------|-----------|---------|
| `1` | `tick:change` | push | Quote tick (mid price) |
| `12` | `ticks:subscribe` | request → response | Subscribe to ticks |
| `13` | `ticks:unsubscribe` | request → response | Unsubscribe from ticks |
| `100` | `account:subscribe` | request → response | Subscribe to account events |
| `101` | `account:unsubscribe` | request → response | Unsubscribe from account events |
| `220` | `connection:closing` | push | The connection is about to close: reconnect |
| `300` | `balance:change` | push | Balance change |
| `400` | `deal:close` | push | Deal closed |

### 1 · tick:change

**Quote tick (mid price).**

Sent for the pairs the connection is subscribed to. Carries only the mid price, rounded to the pair precision. There is no snapshot on subscribe: the first tick comes with the next price change. A client that reads slowly gets the latest unsent price per pair, not a queue of older ones.
`t` is Unix time in seconds with milliseconds, e.g. 1645043551.345

```json
[{"e": 1, "d": [{"p": "EURUSD", "q": 1.08412, "t": 1645043551.345}]}]
```

Items of `d`:

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `p` | string | yes | `EURUSD` |
| `q` | number | yes | `1.08412` |
| `t` | number | yes | `1645043551.345` |

### 12 · ticks:subscribe

**Subscribe to ticks.**

Subscribes the connection to the pairs in `d`. `*` means all pairs, including pairs that appear later. There is no limit on the number of pairs. If any pair is unknown or disabled, the whole request fails with `invalid_request` and the subscriptions do not change. Subscribing to a pair twice does not duplicate ticks.

Request:

```json
[{"e": 12, "t": 2, "uuid": "a1", "d": [{"pair": "EURUSD"}]}]
```

Response:

```json
[{"e": 12, "t": 3, "uuid": "a1"}]
```

Items of `d`:

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `pair` | string | yes | `EURUSD` |

### 13 · ticks:unsubscribe

**Unsubscribe from ticks.**

Unsubscribes from the pairs in `d`. Unsubscribing from `*` removes only the all-pairs subscription; pairs subscribed by name stay.

Request:

```json
[{"e": 13, "t": 2, "uuid": "a1", "d": [{"pair": "EURUSD"}]}]
```

Response:

```json
[{"e": 13, "t": 3, "uuid": "a1"}]
```

Items of `d`:

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `pair` | string | yes | `EURUSD` |

### 100 · account:subscribe

**Subscribe to account events.**

Subscribes the connection to the account events of all your users, real and demo accounts alike: balance changes (`300`) and deal closes (`400`). `d` lists the event codes to subscribe to, e.g. `[400]`. An empty array, `null` or no `d` subscribes to every account event, including event codes added to the channel later. Events published after the response come to the connection; there is no replay of earlier ones. After connecting, after a disconnect and after close `1008` `lagging`: subscribe first, then take a snapshot via REST (`GET /partner/accounts/v1`, `GET /partner/ftt/deals/v1`) — events after the subscription come here, everything before it is in the snapshot.
Subscriptions add up: `[300]` and then `[400]` gives both, and an empty `d` after some codes widens the subscription to every event without a gap. The request fails with `invalid_request` and the subscription does not change if a listed code is unknown, is listed twice or is subscribed already, and if every event is subscribed already.
Account events are never dropped while the connection is open. A connection that does not read them fast enough is closed with `1008` and the reason `lagging`; ticks of the connection do not wait for account events.

Request:

```json
[{"e": 100, "t": 2, "uuid": "a1"}]
```

Response:

```json
[{"e": 100, "t": 3, "uuid": "a1"}]
```

`d` is an array of `integer`.

### 101 · account:unsubscribe

**Unsubscribe from account events.**

Unsubscribes from the event codes listed in `d`; the other codes stay. An empty array, `null` or no `d` cancels the whole account subscription. No event of an unsubscribed code comes after the response. Unsubscribing from a code that is not subscribed just answers; an unknown or repeated code fails with `invalid_request`.
Unsubscribing a code from a subscription to every event leaves the other codes the channel has now: event codes added later do not come. Unsubscribing from the last code ends the subscription.

Request:

```json
[{"e": 101, "t": 2, "uuid": "a1"}]
```

Response:

```json
[{"e": 101, "t": 3, "uuid": "a1"}]
```

`d` is an array of `integer`.

### 220 · connection:closing

**The connection is about to close: reconnect.**

The service is restarting. A few seconds later the connection is closed with code `1012` (`Reconnect required`); reconnect and subscribe again.

```json
[{"e": 220, "d": []}]
```

### 300 · balance:change

**Balance change.**

The account of your user after an operation that changed its balance: the `Account` object of `GET /partner/accounts/v1` with the same fields and values, plus `user_id`. `balance` is the main plus the bonus balance after the operation.
An event may come twice: keep the last `balance` of an account. REST stays the source of truth; push speeds things up but does not replace reconciliation.

```json
[{"e": 300, "d": [{"balance": 1018.2, "currency": "USD", "id": 7890001, "type": "real", "user_id": 42}]}]
```

Items of `d`:

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `balance` | number | yes | `1018.2` |
| `currency` | string | yes | `USD` |
| `id` | integer | yes | `7890001` |
| `type` | string | yes | `real` |
| `user_id` | integer | yes | `42` |

### 400 · deal:close

**Deal closed.**

A closed deal of your user, real or demo: the `Deal` object of `GET /partner/ftt/deals/v1` with the same fields and values, plus `user_id`. `status` is never `proceed`: the event is sent only on close. Deals of all your users come, not only those opened via the API.
An event may come twice: drop duplicates by `group` and `id` (real and demo deals are numbered separately). REST stays the source of truth.

```json
[{"e": 400, "d": [{"account_id": 7890001, "amount": 10, "dir": "up", "group": "real", "id": 555001, "pair": "EURUSD", "status": "win", "time_close": 1753700060, "time_open": 1753700000, "user_id": 42, "win_percent": 82}]}]
```

Items of `d`:

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `account_id` | integer | yes | `7890001` |
| `amount` | number | yes | `10` |
| `dir` | string | yes | `up` |
| `group` | string | yes | `real` |
| `id` | integer | yes | `555001` |
| `pair` | string | yes | `EURUSD` |
| `status` | string | yes | `win` |
| `time_close` | integer | yes | `1753700060` |
| `time_open` | integer | yes | `1753700000` |
| `user_id` | integer | yes | `42` |
| `win_percent` | integer | yes | `82` |


---

## Example (Python)

Uses the [`websockets`](https://websockets.readthedocs.io/) library (version 13 or newer):

```python
import asyncio, json, random, time
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, WebSocketException

URL = "wss://partner-ws.1f3d4.tech/"
API_KEY = "your-api-key"
PAIRS = ["EURUSD", "GBPUSD"]
FATAL = {"missing_key", "invalid_key", "ip_not_allowed", "inactive"}

latest = {}  # pair -> (time, price)

async def session():
    async with connect(URL, additional_headers={"X-API-Key": API_KEY},
                       user_agent_header="acme-quotes/1.0") as ws:
        await ws.send(json.dumps([{"e": 12, "t": 2, "uuid": "sub-1",
                                   "d": [{"pair": p} for p in PAIRS]}]))
        async for frame in ws:
            for ev in json.loads(frame):          # always a list
                if ev["e"] == 1:
                    for tick in ev["d"]:
                        prev = latest.get(tick["p"])
                        if prev is None or tick["t"] >= prev[0]:
                            latest[tick["p"]] = (tick["t"], tick["q"])
                elif ev.get("t") == 3 and ev.get("err"):
                    print("request failed:", ev["err"])
                elif ev["e"] == 220:
                    print("server restarting, will reconnect")

async def main():
    delay = 1
    while True:
        started = time.monotonic()
        try:
            await session()
        except ConnectionClosed as e:
            reason = e.rcvd.reason if e.rcvd else ""
            if reason in FATAL or (reason.startswith("card changed") and not reason.endswith("partner_changed")):
                raise SystemExit(f"access refused: {reason}")
            if e.rcvd and e.rcvd.code == 1012:   # planned restart: reconnect at once
                delay = 0
        except (WebSocketException, OSError, asyncio.TimeoutError):  # refused (429/502), network, timeout
            pass
        if time.monotonic() - started > 60:      # the connection lived a while: reset the backoff
            delay = min(delay, 1)
        await asyncio.sleep(delay + random.random())
        delay = min(max(delay * 2, 1), 60)

asyncio.run(main())
```

---

## Checklist

- [ ] Connect from a whitelisted IP with `X-API-Key` and your own `User-Agent`.
- [ ] Parse every frame as an array and handle every event in it.
- [ ] Subscribe after every (re)connect; use pair IDs from `GET /ftt/pairs/v1`.
- [ ] Keep the latest price per pair by `t`; do not expect a snapshot.
- [ ] Read continuously; let your library answer pings.
- [ ] Reconnect on `220`/`1012` at once, otherwise with exponential backoff; do not retry refused keys in a loop.
- [ ] Account channel: subscribe with `100`, then take the REST snapshot — after every (re)connect and `1008 lagging`.
- [ ] Deduplicate deal closes by `group` + `id`; keep the latest `balance` per account; reconcile with REST.
