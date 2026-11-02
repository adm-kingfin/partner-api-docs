---
title: Quotes WebSocket
---

# Quotes WebSocket — Integration Guide

Real-time prices of the trading pairs over a WebSocket. You subscribe to the pairs you need, or to all of them, and receive the mid price each time it changes.

The socket uses the same credentials as the Partner API: your **API key** and your **whitelisted server IPs**. No user token is needed — quotes are not tied to a user.

Endpoint: `wss://partner-ws.1f3d4.tech/`

---

## Connecting

Open a WebSocket to the endpoint with your API key in a header:

| Header | Value |
|--------|-------|
| `X-API-Key` | Your API key — the same one you use for the Partner API |
| `User-Agent` | Any value that identifies your application, e.g. `acme-quotes/1.4`. Some generic library defaults are rejected at the network edge (Python's `Python-urllib`), so set your own. |

The connection must come from one of your whitelisted IPs. `Origin` is not checked — the socket is meant for server-to-server use.

**Connections per key.** One connection carries any number of pairs; one or two connections are usually enough. Keep it under 10 concurrent connections per API key: above that, new connections may be refused with `connection_limit`.

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

## Errors

A failed request gets a response with `err` and no `d`. The connection stays open.

```json
[{"e": 12, "t": 3, "uuid": "sub-1", "err": [{"mess": "unknown pair: XYZ", "code": "invalid_request"}]}]
```

| `code` | When |
|--------|------|
| `invalid_request` | The frame is not a JSON array, the data does not match the event, or a pair is unknown. If the frame could not be parsed at all, the response has `e: 0` and no `uuid` |
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

**Planned restart.** The server sends event `220` and closes the connection a few seconds later with close code `1012` (`Reconnect required`). Reconnect right away — another server accepts the connection — and subscribe again.

```json
[{"e": 220, "d": []}]
```

**Any other disconnect.** Reconnect with an exponential backoff: start at about 1 second, double on each failed attempt, cap at 30–60 seconds, reset after a connection that lived for a while. Do not retry `invalid_key`, `ip_not_allowed` or `inactive` in a loop — they will not pass until the setup is fixed.

### Close codes

| Code | Reason | What to do |
|------|--------|------------|
| `1008` | `missing_key`, `invalid_key`, `ip_not_allowed`, `inactive`, `connection_limit` | The connection was refused — see [Refused connection](#refused-connection) |
| `1008` | `card changed: <reason>` | Your access changed while connected: the key was revoked (`invalid_key`), suspended (`inactive`) or this IP was removed (`ip_not_allowed`). Fix the setup before reconnecting |
| `1008` | `too many pending responses` | Too many requests were sent without reading the responses. Read the socket continuously |
| `1009` | — | A frame you sent is larger than 64 KiB |
| `1012` | `Reconnect required` | Planned restart — reconnect |
| none | — | The connection was dropped (network, or the client stopped reading) — reconnect with backoff |

---

## Events reference

Generated from the service code. Every event travels inside a frame — a JSON array.

| Code | Name | Direction | Summary |
|------|------|-----------|---------|
| `1` | `tick:change` | push | Quote tick (mid price) |
| `12` | `ticks:subscribe` | request → response | Subscribe to ticks |
| `13` | `ticks:unsubscribe` | request → response | Unsubscribe from ticks |
| `220` | `connection:closing` | push | The connection is about to close: reconnect |

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

### 220 · connection:closing

**The connection is about to close: reconnect.**

The service is restarting. A few seconds later the connection is closed with code `1012` (`Reconnect required`); reconnect and subscribe again.

```json
[{"e": 220, "d": []}]
```


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
            if reason in FATAL or reason.startswith("card changed"):
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
