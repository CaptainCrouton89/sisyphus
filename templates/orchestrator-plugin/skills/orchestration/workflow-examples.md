# Workflow Examples

End-to-end examples showing how the orchestrator structures cycles for real scenarios.

---

## Example 1: Fix a Race Condition in WebSocket Reconnection

**Starting task**: "WebSocket connections sometimes drop messages during reconnection"

### Cycle 1 — Diagnosis
```
roadmap.md:
  ## Bug Fix: WebSocket message loss during reconnection

  - [ ] Diagnose message loss during WebSocket reconnection
  - [ ] Fix root cause
  - [ ] Validate fix under concurrent load
  - [ ] Review fix

Agents spawned:
  debug agent → "Diagnose why WebSocket messages are lost during reconnection.
    Focus on src/ws/client.ts and src/ws/reconnect.ts.
    Check for race conditions between disconnect handler and message queue.
    Look at git blame for recent changes to reconnection logic."
```

### Cycle 2 — Read diagnosis, plan fix
```
Agent report: "Root cause: reconnect() clears the message queue before the new socket
  is ready. Messages sent between disconnect and reconnect are dropped.
  Line 47 of src/ws/reconnect.ts — queue.clear() is called in onDisconnect
  but should be deferred until onReconnect confirms the new socket is live.
  Confidence: High."

roadmap.md updated:
  - [x] ~~Diagnose message loss during WebSocket reconnection~~
  - [ ] Fix root cause — queue.clear() at L47 of reconnect.ts runs too early
  - [ ] Validate fix under concurrent load
  - [ ] Review fix

Agents spawned:
  implement agent → "Fix race condition in src/ws/reconnect.ts.
    Root cause: queue.clear() at line 47 runs on disconnect, dropping pending messages.
    Fix: defer queue drain until reconnect confirms new socket. Buffer messages during
    reconnection window. See existing buffer pattern in src/ws/buffer.ts."
```

### Cycle 3 — Validate
```
Agent report: "Fixed. Moved queue.clear() to onReconnect callback after socket.readyState
  confirms OPEN. Added message buffer during reconnection window. 2 files changed."

roadmap.md updated:
  - [x] ~~Diagnose message loss~~
  - [x] ~~Fix root cause~~
  - [ ] Validate fix under concurrent load
  - [ ] Review fix

Agents spawned:
  validate agent → "Verify WebSocket reconnection fix. Run existing tests in
    src/__tests__/ws/. Manually verify: disconnect simulation should not lose queued
    messages. Check that buffer drains correctly on reconnect."
```

### Cycle 4 — Review and complete
```
Validation: PASS. Existing tests pass, reconnection preserves messages.

roadmap.md updated:
  - [x] ~~Diagnose~~, [x] ~~Fix~~, [x] ~~Validate~~
  - [ ] Review fix

Agents spawned:
  review agent → "Review changes in src/ws/reconnect.ts and src/ws/buffer.ts.
    Focus on: thread safety of the new buffer, memory leak potential if reconnect
    never succeeds, edge case of rapid disconnect/reconnect cycles."
```

### Cycle 5 — Complete
```
Review: Clean. One medium finding — buffer should have a max size to prevent
  memory issues if reconnect fails indefinitely. Not blocking.

All roadmap.md items complete.

Action: complete — "Fixed WebSocket message loss during reconnection. Messages now
  buffered during reconnection window and drained on successful reconnect."
```

---

## Example 2: Add API Rate Limiting

**Starting task**: "Add rate limiting to the REST API — per-user, configurable limits"

### Cycle 1 — Problem exploration
```
roadmap.md:
  ## Feature: API Rate Limiting

  ### Requirements & Design
  - [ ] Problem exploration — understand rate limiting needs
  - [ ] Requirements — define acceptance criteria
  - [ ] Design — architecture for rate limiting
  - [ ] Plan implementation
  - [ ] Review plan

  ### Implementation
  - [ ] Implement rate limiting middleware
  - [ ] Implement rate limit configuration
  - [ ] Implement rate limit headers and error responses

  ### Validation
  - [ ] Validate implementation
  - [ ] Review implementation

Agents spawned:
  problem agent → "Explore the codebase and understand the API rate limiting landscape.
    Check existing middleware patterns in src/api/middleware/.
    Questions to explore: current request handling, existing auth/middleware chain,
    what storage backends are available (Redis?), user identification mechanisms."
```

### Cycle 2 — Spec (after human iterates on problem)
```
Agent report: "Problem document saved to context/problem-rate-limiting.md.
  Current middleware chain uses Express middleware pattern. Redis is already in stack.
  Users are identified by JWT sub claim. No existing rate limiting."

roadmap.md updated:
  - [x] ~~Problem exploration~~
  - [ ] Spec — define acceptance criteria and architecture
  ...

Agents spawned:
  sisyphus:spec → "Run a spec session for per-user API rate limiting. Read context/problem-rate-limiting.md for context."

Later report: "Spec completed.
  Requirements saved to context/requirements-rate-limiting.md.
  Design saved to context/design-rate-limiting.md.
  Covers: per-user limits, endpoint-specific overrides, 429 response format,
  Retry-After headers, and a Redis-backed sliding window approach."
```

### Cycle 3 — Plan (after human reviews spec)
```
Agent report: "Spec outputs approved.
  Approach: Redis-backed sliding window middleware. Per-user with endpoint-specific
  overrides. Standard 429 response with Retry-After header. Config via environment variables."

roadmap.md updated:
  - [x] ~~Problem exploration~~, [x] ~~Spec~~
  - [ ] Plan implementation
  ...

Agents spawned:
  plan agent → "Create implementation plan from context/requirements-rate-limiting.md
    and context/design-rate-limiting.md"
  test-spec agent → "Define behavioral properties for rate limiting from
    context/requirements-rate-limiting.md"
```

### Cycle 4 — Review plan
```
Both agents complete. Plan at context/plan-rate-limiting.md.
Plan has 3 phases: middleware, config, response format.

Agents spawned:
  review-plan agent → "Validate plan at context/plan-rate-limiting.md
    against context/requirements-rate-limiting.md and context/design-rate-limiting.md"
```

### Cycle 5 — Implement phases 1+2 (parallel, low-risk foundation)
```
Plan review: PASS.

roadmap.md updated (plan review done, starting implementation):
  - [x] ~~Spec~~, [x] ~~Plan~~, [x] ~~Review plan~~
  - [ ] Implement rate limiting middleware
  - [ ] Implement rate limit configuration
  - [ ] Critique phases 1-2 — review before integration phase
  - [ ] Implement rate limit headers and error responses
  - [ ] Validate — smoketest rate limiting end-to-end
  - [ ] Final review

Agents spawned (parallel — phases touch different files):
  implement agent → "Implement Phase 1 from context/plan-rate-limiting.md —
    rate limiting middleware in src/api/middleware/rate-limit.ts"
  implement agent → "Implement Phase 2 from context/plan-rate-limiting.md —
    rate limit configuration in src/config/rate-limits.ts"
```

### Cycle 6 — Critique before integration builds on top
```
Both implementation agents complete.

Why critique now: Phase 3 (headers/error responses) integrates the middleware and
  config — if the foundation has issues, they'll cascade. Cheaper to catch now.

roadmap.md updated:
  - [x] ~~Implement middleware~~, [x] ~~Implement config~~
  - [ ] Critique phases 1-2
  ...

Agents spawned:
  review agent → "Review rate limiting middleware and config implementation.
    Focus on: Redis connection handling, sliding window correctness,
    config schema matches what middleware expects."
```

### Cycle 7 — Implement phase 3 + address critique
```
Review: 2 findings — middleware doesn't handle Redis connection failure gracefully,
  config schema allows negative rate limits.

Agents spawned (parallel):
  implement agent → "Fix review findings in reports/agent-008-final.md for
    rate limiting middleware and config."
  implement agent → "Implement Phase 3 from context/plan-rate-limiting.md —
    rate limit headers and 429 error responses in src/api/middleware/rate-limit.ts"
```

### Cycle 8 — Validate end-to-end
```
Phase 3 and fixes complete.

Why validate now: all three phases are done and integrated. This is the checkpoint
  before calling it complete — verify it actually works, not just compiles.

Agents spawned:
  validate agent → "Verify rate limiting end-to-end: start server, send requests
    exceeding limits, confirm 429 responses with correct Retry-After headers.
    Test per-user isolation, endpoint-specific overrides, Redis failover behavior."
```

### Cycle 10 — Complete
```
Validation: PASS. Final review agent confirms no issues.
Complete — "Added per-user API rate limiting with Redis-backed sliding window,
  configurable per-endpoint limits, and graceful Redis failover."
```

---

## Example 3: Refactor Authentication Module

**Starting task**: "Refactor auth — extract token logic from route handlers into dedicated service"

### Cycle 1 — Plan + baseline
```
roadmap.md:
  ## Refactor: Extract Token Service

  - [ ] Plan auth refactor — extract token service
  - [ ] Capture behavioral baseline (run all auth tests)
  - [ ] Create TokenService class with extracted logic
  - [ ] Update route handlers to use TokenService
  - [ ] Update tests to use new service interface
  - [ ] Validate all auth tests still pass
  - [ ] Review for dead code and missed references

Agents spawned (parallel):
  plan agent → "Plan refactor: extract token creation, validation, and refresh
    logic from src/api/routes/auth.ts into a new src/services/token-service.ts.
    Map all token-related functions, their callers, and the extraction plan."
  validate agent → "Run all tests in src/__tests__/auth/ and record results.
    This is the behavioral baseline — these must all pass after refactor."
```

### Cycle 2 — Extract (serial — must happen before consumer updates)
```
Plan complete, baseline captured (47 tests passing).

roadmap.md updated:
  - [x] ~~Plan auth refactor~~
  - [x] ~~Capture behavioral baseline~~ (47 tests passing)
  - [ ] Create TokenService class with extracted logic
  ...

Agents spawned:
  implement agent → "Execute Phase 1 of refactor plan: create TokenService class
    at src/services/token-service.ts. Extract validateToken, createToken, refreshToken
    from src/api/routes/auth.ts. Export the class. Do NOT modify route handlers yet."
```

### Cycle 3 — Update consumers (parallel where possible)
```
TokenService created.

Agents spawned:
  implement agent → "Update route handlers in src/api/routes/auth.ts to import
    and use TokenService instead of inline token logic. Remove extracted functions."
  implement agent → "Update tests in src/__tests__/auth/ to use TokenService
    where they directly tested extracted functions."
```

### Cycle 4 — Validate + review
```
Agents spawned (parallel):
  validate agent → "Run all auth tests. Compare against baseline of 47 passing.
    Every test must still pass."
  review agent → "Review src/api/routes/auth.ts and src/services/token-service.ts.
    Check for: dead code left behind, missed references to old functions, broken imports."
```

### Cycle 5 — Complete
```
All 47 tests passing. Review clean.
All roadmap.md items complete.
Complete — "Extracted token logic into TokenService. All existing tests pass."
```
