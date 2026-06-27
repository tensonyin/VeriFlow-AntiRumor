# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd write it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphaned code:
- Delete imports, variables, or functions that became unused due to your changes.
- Do not delete pre-existing dead code unless explicitly requested.

**The test:** Every modified line should be directly traceable to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop and verify until achieved.**

Translate imperative instructions into declarative, verifiable goals:
- Instead of "Add validation" → "Write a test for invalid input, then make it pass."
- Instead of "Fix bug" → "Write a test that reproduces the bug, then make it pass."
- Instead of "Refactor X" → "Ensure all tests pass before and after the refactoring."

For multi-step tasks, lay out a brief plan:
1. [Step] → Verification: [Check]
2. [Step] → Verification: [Check]
3. [Step] → Verification: [Check]

Strong success criteria allow the LLM to execute loops autonomously. Weak criteria ("make it work") lead to constant clarifications.
