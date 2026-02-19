## Bug References

- Draft-row highlight disappearing during arrow navigation (canvas updates but blue list highlight vanishes):
  reproducing tests in `tests/e2e/wordlist-scroll.spec.ts`:
  `narrow desktop viewport arrows keep draft row highlight visible when selected`
  and `mobile arrows keep draft row highlight visible when selected`.
  Final fix commit: `c463672`.

- Row highlight disappeared when navigating with right-side up/down arrows (canvas changed but blue list highlight was gone):
  reproducing tests in `tests/e2e/wordlist-scroll.spec.ts`:
  `narrow desktop viewport arrows keep draft row highlight visible when selected`
  and `mobile arrows keep draft row highlight visible when selected`.
  Final fix commit: `bb9d99e` (ensure selected/focus row styles also color input backgrounds).

- Up-arrow navigation could leave the selected row just off-screen above the sticky header when list was scrolled:
  reproducing test in `tests/e2e/wordlist-scroll.spec.ts`:
  `mobile up arrow keeps newly active row visible when scrolling upward`.
  Final fix commit: `8fedd22` (reuse keyboard-style one-row scrolling for button-driven selection changes).
