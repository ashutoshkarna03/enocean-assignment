# AI_USAGE.md

## AI Tool Usage Disclosure

AI tools are allowed in this assessment.

We care about engineering judgment, verification, and ownership of the result — not whether you used AI.

If you used any AI assistant (ChatGPT, Copilot, Claude, etc.), document it here.

If you did not use AI tools, state that explicitly.

---

## Tools Used

List all AI tools used:

- Tool name: Codex (CLI coding assistant)
- Version / model (if known): GPT-5 family (session model)
- How frequently used: heavy

Example:

- ChatGPT (GPT-5.x), occasional
- GitHub Copilot, heavy

---

## What AI Was Used For

Describe what the AI helped with:

- Code generation
- Refactoring
- Debugging ideas
- Test scaffolding
- Documentation
- Architecture reasoning
- Other

Be specific.

Example:

- Implemented and refined `BufferService` race-condition fix with per-device single-flight flush semantics
- Added Kafka DLQ support (`KAFKA_DLQ_TOPIC`, producer publish on processing failures)
- Implemented Task 2 history endpoint with filtering, pagination, and validation
- Implemented Task 3 aggregation endpoint with Mongo pipeline and interval bucketing
- Added/expanded unit and integration tests for worker and API behavior
- Updated README endpoint documentation and maintained `AI_CODE_SUMMARY.md` entries

---

## Verification Process

Explain how you verified AI-generated output:

- Tests written or updated
- Manual reasoning
- Logs / debugging
- Code review
- Stress testing
- Reruns for determinism

Example:

- Ran `corepack yarn build` after each implementation step
- Ran unit tests via `corepack yarn test` after endpoint and validation changes
- Ran integration tests via `corepack yarn test:integration` (with Docker deps up/wait)
- Re-ran integration after environment-related timeouts to ensure true behavioral verification
- Reviewed query behavior and response contracts against Task acceptance criteria

---

## Corrections Made to AI Output

If AI produced incorrect or unsafe suggestions:

- What was wrong?
- How did you fix it?

Example:

- Initially implemented a more complex flush-loop/in-flight map approach for Task 1
- Replaced it with a simpler requested `flushing` boolean lock + buffer swap approach in `BufferService`
- Fixed transient TypeScript issues in new tests (resolver typing and API test helper imports)
