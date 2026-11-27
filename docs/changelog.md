---
title: Changelog
---

# Changelog

Changes to the Partner API that affect integrations. Newest first.

## 2026-11

- New endpoint `GET /user/ftt/pairs/v1`: the pairs available to a particular user, by that user's JWT, with the durations and payout percentage that apply to the user. On `422` `pair unavailable` request it again and pick another pair. Counts toward the per-user rate limit. See [GET /user/ftt/pairs/v1](guide.md#get-userfttpairsv1).
- Endpoint paths: new endpoints under `/partner/user/...` (singular) need the JWT of one user, `/partner/users/...` (plural) work on your users with the API key only. See [User-scoped requests](guide.md#user-scoped-requests).
- Partner WebSocket: event subscription codes changed — subscribe with `67` (`events:subscribe`) and unsubscribe with `68` (`events:unsubscribe`); `100` and `101` are no longer accepted and get `unknown_event`. Payloads of `300` and `400` are unchanged. See [Events](quotes-socket.md#events).
- Partner WebSocket: subscribe to selected account events by listing their codes in `d` of `100`, unsubscribe from single codes with `101`. Without codes the subscription covers every account event, including events added later. See [Subscribing](quotes-socket.md#subscribing).
- Partner WebSocket: new account channel — deal closes and balance changes of all your users. See [Events](quotes-socket.md#events).
- FTT pairs: pairs not yet released are excluded from the list; a deal on a pair unavailable to a particular user gets `422` `pair unavailable`.
- Documentation published at this site.
