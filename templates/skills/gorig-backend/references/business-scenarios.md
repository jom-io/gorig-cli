# Business Scenario Workflow

Use this reference when the user describes a business outcome instead of naming a Gorig component. This file is a workflow, not a rule catalog. Do not keep adding one-off mappings for every module or domain.

The goal is to help the model reason from the user's business language to a small, confirmed backend plan using the target project's actual code and the verified Gorig capabilities.

## Interaction Workflow

When the user asks for a feature in ordinary language, do this before coding:

1. Restate the business outcome.
2. Inspect the existing project model, service, routes, docs, config, and tests that are likely related.
3. Identify the workflow shape:
   - trigger: user action, persisted data change, schedule, external callback, or stream request;
   - wait/ordering: immediate, delayed, periodic, ordered, retryable, or one-shot;
   - durability: may be lost on restart, must survive restart/deploy, or must be auditable;
   - visibility: backend-only, API-visible, browser-real-time, or external-system-visible;
   - consistency: best-effort, at-least-once, exactly-once expected by business, or idempotent enough;
   - state owner: existing table/model, new field, new log table, cache, message payload, token/session manager, external service, or no persisted state;
   - identity/security: anonymous, logged-in user, role/attribute restricted, owner-only, signed external callback, or system-to-system secret;
   - outbound dependency: none, internal service, third-party API, user-provided URL, or webhook/callback.
4. Generate a recommended design using Gorig capabilities already verified for the resolved version.
5. Compare alternatives only when the business requirement has a real tradeoff, such as precision vs. infrastructure, synchronous vs. async, polling vs. streaming, or local vs. cross-process behavior.
6. Recommend the smallest design that satisfies the stated business outcome.
7. Separate current scope from future extensions.
8. Ask only the blocking confirmation questions.
9. Wait for explicit confirmation before editing code.

## Gorig Capability Families

Use these as ingredients during analysis. Do not expose them as choices the user must understand unless a tradeoff depends on them.

- Service-layer logic: synchronous business rules and durable database updates.
- Persistent CRUD: durable business state, audit logs, queryable records, and API-visible resources.
- `cronx` scheduled tasks: periodic checks, background maintenance, delayed work, one-shot work, timeout, panic recovery, and shutdown.
- Redis-backed persistent cron tasks: delayed work that should survive restart/deploy when Redis is available; handlers must be idempotent.
- `messagex`: async fan-out, sequential handling, retry, DLQ, and cross-process events when Redis-backed.
- SSE: browser-visible server push when the user needs live updates.
- Cache: read acceleration, counters, local persistence, and multi-level caching when stale/loss behavior is acceptable.
- Authentication and security middleware: login/logout, protected routes, token refresh/revocation, user context, role/attribute filtering, CORS, and debounce protection.
- Outbound HTTP: external API calls, header/context propagation, timeouts, bad upstream response handling, XML/JSON/form payloads, and controlled image fetching.
- Direct database access: only when `domainx/dx` cannot express the required operation and the risk is justified.

## Candidate Design Guidance

For the recommended design, describe:

- business behavior: what the user will observe;
- data impact: fields, tables, indexes, logs, or no schema change;
- runtime behavior: sync, delayed, scheduled, event-driven, stream, cache;
- security behavior: who can call it, how identity is proven, what data is forbidden, and which secrets/config values are required;
- outbound behavior: external endpoint, timeout, retry/idempotency, and fallback/error behavior;
- failure behavior: restart, duplicate execution, missing dependency, timeout, panic, retry;
- verification: ordinary tests, integration tests, smoke checks, and skipped checks if infrastructure is missing.

When alternatives matter, describe only the meaningful difference. Do not list options just to satisfy a template.

## Assumption Discipline

Do not silently relax a business requirement to make the implementation simpler.

If the recommended design changes any of these properties, state the assumption and ask for confirmation:

- timing precision: exact delay vs. scan/polling drift;
- durability: survives restart/deploy vs. best-effort in-process work;
- consistency: immediate update vs. eventual consistency;
- visibility: real-time push vs. refresh/polling;
- delivery: at-most-once, at-least-once, retry, or possible duplicate execution;
- data ownership: existing business table vs. new field/log table/cache/message payload.

Examples:

- If using periodic scanning for a requirement phrased as "after N minutes", state the maximum expected delay, such as "N minutes plus up to one scan interval", and ask whether that is acceptable.
- If using Redis-backed delayed work, state that Redis is an infrastructure prerequisite and that handlers must be idempotent.
- If skipping SSE for a "future real-time" statement, state that the current feature will be visible through stored data/API only.
- If using cache, state what can be stale and for how long.
- If using memory token, state that sessions are local to the process and not suitable as a cross-instance login store.
- If using Redis token, state the target Gorig version and Redis test requirement before claiming it works.
- If calling a third-party service, state timeout, bad-response behavior, and which headers/secrets are sent.

When a requirement uses strong language such as "must not be lost", "exactly", "immediately", "real-time", or "cannot duplicate", treat it as a blocking confirmation point unless the existing project already proves the behavior.

Avoid these mistakes:

- Do not choose a component only because the user used a word that resembles it.
- Do not replace a stated timing or durability requirement with an unrelated simpler mechanism without explaining the behavior difference.
- Do not expand into full CRUD, public APIs, or SSE just because they might be useful later.
- Do not claim runtime behavior is verified when Redis, MySQL, MongoDB, or other required infrastructure was unavailable.
- Do not forward user tokens to external services unless that is the explicit contract.
- Do not put real secrets, production URLs, raw tokens, or passwords in generated examples or fixtures.
- Do not hard-code one domain's nouns into the plan for another domain.

## Confirmation Plan Shape

Use this structure. Fill it with facts from the target project after inspection.

```text
Business goal:
- <business outcome in user language>

What I found in the project:
- Related modules/models/fields:
- Existing configuration and external dependencies:
- Current gaps:

Scenario breakdown:
- Trigger:
- Delay/order/periodicity:
- Durability requirement:
- User visibility:
- Consistency and idempotency requirement:
- Identity and permission requirement:
- External service dependency:

Recommended design:
- <recommended option and why it best matches the stated business outcome>

Optional tradeoffs:
- <only include when there is a real tradeoff; omit this section when the recommendation is obvious>

Current scope:
- Must implement:
- Out of scope but keep extension points:

Need confirmation:
- <only blocking questions>
- <include any assumption that relaxes timing, durability, consistency, or real-time behavior>

Verification plan:
- Business-effect tests:
- Component/infrastructure tests:
- If a dependency is unavailable, which checks will be skipped and cannot be claimed verified:
```

## Verification Principle

Verification must prove the business effect first and the framework primitive second.

Examples of business-effect assertions:

- An entity that still matches the delayed condition receives the intended action.
- An entity that no longer matches the condition is not changed.
- Duplicate or retried executions are idempotent.
- Audit/log records are created exactly as required.
- Real-time delivery is proven only if it is in current scope.

Component-level checks support the above:

- scheduled/delayed task executes, times out, recovers, or is skipped with an infrastructure reason;
- persistent delayed task handles bad payloads and runs with Redis when available;
- message subscriber receives payload, preserves order when required, retries, and cleans up;
- SSE response has the correct event shape and disconnect cleanup;
- cache hit/miss/expiry/invalidation behavior is proven.

Never mark a feature verified only because the framework primitive compiled.
