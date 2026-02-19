## Commit Checkpoints
Commit after every completed checkpoint before doing more work.

## Bug Fix Protocol
When a prompt reports a bug (the word `bug` is mentioned), follow this workflow:

1. Create a focused test that reproduces the reported behavior.
2. If the behavior cannot be reproduced, stop and ask clarifying questions until reproduction is possible.
3. Once reproducible, attempt fixes.
4. Use the new test to verify each fix.
5. If a fix attempt still fails the test, revert that fix before trying the next approach.
6. After finding a working fix, review the related code changes for unnecessary or duplicative edits.
7. Remove unnecessary code, using the test as a regression guard while pruning.
8. If the bug was complicated to diagnose (multiple fix attempts), add a BUGS note with the reproducing test and final fix commit hash for future reference.

## Bug References
See `BUGS.md` for historical bug references (repro tests + fix commits).
