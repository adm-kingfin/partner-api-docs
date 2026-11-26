---
title: Changelog
---

# Changelog

Changes to the Partner API that affect integrations. Newest first.

## 2026-11

- Partner WebSocket: new account channel — deal closes and balance changes of all your users. See [Account events](quotes-socket.md#account-events).
- FTT pairs: pairs not yet released are excluded from the list; a deal on a pair unavailable to a particular user gets `422` `pair unavailable`.
- Documentation published at this site.
