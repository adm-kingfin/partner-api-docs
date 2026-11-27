---
title: Changelog
---

# Changelog

Changes to the Partner API and the Partner WebSocket that affect integrations. Newest first.

Both are versioned with [semantic versioning](https://semver.org/): a major version can break
an integration, a minor version adds endpoints, fields, values or events, a patch only clarifies
the documentation. The current version is shown at the top of the
[integration guide](guide.md) and of the [Partner WebSocket](quotes-socket.md) page; see
[Versioning](guide.md#versioning) for how to stay compatible with minor versions.

## API 1.3.0 — 2026-11-27 {#api-1-3-0}

- New endpoint `GET /user/ftt/pairs/v1`: the pairs available to a particular user, by that user's JWT, with the durations and payout percentage that apply to the user. On `422` `pair unavailable` request it again and pick another pair. Counts toward the per-user rate limit. See [GET /user/ftt/pairs/v1](guide.md#get-userfttpairsv1).
- Endpoint paths: new endpoints under `/partner/user/...` (singular) need the JWT of one user, `/partner/users/...` (plural) work on your users with the API key only. See [User-scoped requests](guide.md#user-scoped-requests).

## WebSocket 0.4.3 — 2026-11-27 {#websocket-0-4-3}

- Breaking: event subscription codes changed — subscribe with `67` (`events:subscribe`) and unsubscribe with `68` (`events:unsubscribe`); `100` and `101` are no longer accepted and get `unknown_event`. Payloads of `300` and `400` are unchanged. See [Events](quotes-socket.md#events).

## WebSocket 0.4.2 — 2026-11-27 {#websocket-0-4-2}

- Documented the `invalid_request` errors for unknown, duplicate or already subscribed event codes. See [Errors](quotes-socket.md#errors).

## WebSocket 0.4.1 — 2026-11-26 {#websocket-0-4-1}

- Subscribe to selected account events by listing their codes in `d` of `100`, unsubscribe from single codes with `101` (codes changed in 0.4.3). Without codes the subscription covers every account event, including events added later. See [Subscribing](quotes-socket.md#subscribing).

## WebSocket 0.4.0 — 2026-11-26 {#websocket-0-4-0}

- New account channel — deal closes and balance changes of all your users. See [Events](quotes-socket.md#events).

## WebSocket 0.3.0 — 2026-11-25 {#websocket-0-3-0}

- Partner WebSocket: a stream of quote ticks over one connection authorized by your API key. See [Partner WebSocket](quotes-socket.md).

## API 1.2.0 — 2026-11-24 {#api-1-2-0}

- FTT pairs: pairs not yet released are excluded from the list; a deal on a pair unavailable to a particular user gets `422` `pair unavailable`.

## API 1.1.0 — 2026-11-23 {#api-1-1-0}

- A refusal to act for a user, `403` `access_denied`, carries the reason in `ctx.code`: `user_banned`, `user_deleted`, `user_not_attributed` or `access_check_failed` (the only retryable one). See [User access refusals](guide.md#user-access-refusals).

## API 1.0.0 — 2026-11-02 {#api-1-0-0}

- Documentation published at this site.
