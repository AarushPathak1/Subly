Run the full 4-agent pipeline on the following task: $ARGUMENTS

Execute the agents in this exact order. Do not start the next stage until the current one is complete. Pass all relevant output explicitly between stages.

---

## Stage 1 — Planner

Invoke the `planner` agent with the task above.

The planner will explore the codebase and produce a detailed spec. Capture its full output.

---

## Stage 2 — Coder

Invoke the `coder` agent with:
- The original task
- The planner's complete spec

The coder will implement every change in the spec and produce an implementation report. Capture its full output.

---

## Stage 3 — Tester

Invoke the `tester` agent with:
- The original task
- The planner's spec
- The coder's implementation report

The tester will write and run all tests and produce a test report. Capture its full output.

---

## Stage 4 — Reviewer

Invoke the `reviewer` agent with:
- The original task
- The planner's spec
- The coder's implementation report
- The tester's test report

The reviewer will inspect the diff and either:

**APPROVED** → commit using the exact commit message the reviewer provides, then push to origin/main.

**BLOCKED** → stop. Report the reviewer's required fixes to the user. Do not commit. Do not push. Wait for the user to decide whether to re-run the pipeline with the fixes applied.

---

At the end, summarize:
1. What was built (one paragraph)
2. Files changed (list)
3. Tests added (count and names)
4. Reviewer verdict and commit hash (if approved)
