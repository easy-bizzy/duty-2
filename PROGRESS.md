# ORACLE — release notes, 2026-11-19

Repository: easy-bizzy/duty-2. PR #1 merged into main on 2026-11-19; GitHub Pages deployment succeeded. Version 20-ORACLE updates loading team membership.

## User requirements
- 6 workers. Same person may do loading and location on same day; multiple location trips per day are legitimate. Manual trips override automatic order and remain in history.
- Loading team 1: Репин, Печерских, Сабуров. Team 2: Сурнин, Торопов, Осинкин. Teams alternate; absent worker is replaced; manual worker counts toward total requested places.
- Keep local phone history, settings and counters. Existing origin and dutyApp key must stay. First legacy transition requires manual export. Later versions offer backup and update UI.
- Brand ORACLE: Operational Rotation And Crew Load Equalizer. Slight mobile redesign; dark blue, teal, orange for loading.
- Desired future location algorithm: fewer trips means mild priority; returnee must catch up gradually, never get every trip consecutively. Previous proposed rule: wait for 4 distinct available peers for lagging worker / 5 for ordinary worker, then minimum cumulative count. THIS RULE HAS A GROUP DEADLOCK: peers travelling together and staggered groups can leave everyone ineligible. Do not blindly deploy it. Resolve scheduling semantics and test group scenarios before changing location logic.

## Implemented
- Protected storage, original-byte backup before normalization, previous-save backup, explicit errors, optimistic stale-tab guard, import/reset backups.
- Waiting service worker, backup download and confirmation UI, online/version indication, scoped offline caching.
- ORACLE mobile styling, app title, manifest name/icon, acronym in settings, online/offline badge. Removed dead UI 'Хотят на отгрузку': old code never rendered or used its list.
- Correct team composition; manual loading person excluded from automatic candidates; manual-only loading records team; latest prior dated group chosen independent of journal insertion order.
- 12 node tests currently pass (storage, worker, loading).

## Still pending
- Location algorithm stays legacy pending resolution of group deadlock. Do not claim it is implemented.
- Browser visual + real service worker update tests remain blocked here: Playwright default binary absent; installed /usr/bin/chromium fails with socket() Operation not permitted. Do not claim visual/Android testing passed. Use a permitted browser test environment.
- Real Android/export validation and first migration with user's data before publishing main.
- No user history file has been provided; tests use synthetic data only.
- Backup localStorage is not safe from user clearing browser data; downloadable export is essential. Browser cannot verify that file download was saved, hence user confirmation.

## Resume
Read this file and UPDATE-NOTES.md, inspect draft branch diff. Run `node --test tests/*.cjs`. Do not redo completed repository discovery or re-create PR. Save new checkpoints in this branch. Preserve main until ready for safe rollout.

2026-11-19: Claude audit supplied in upload/file8.zip. Local uncommitted fixes in script.js: preserve dayOffs/onlyLoadToday after distribution; avoid empty location journal entries and show shortages; todayIso uses local calendar. 12 old tests pass, new regression tests and GitHub sync pending. Audit notes critical manual silent drop, storage migration failure, recovery UX, and algorithm fairness not yet addressed. Do not deploy.

2026-11-19 continuation: Prior fixes committed as a7cf318. Manual unavailable worker now blocks entire distribution with an explanation and retains pending entries. Settings and emergency overlay list local backups; restore validates a selected copy and saves exact current bytes first. Explicit backups now have distinct names, version/cache bumped to 16-ORACLE, legacy journal validation allows older entry shapes. All 14 node tests pass. Remaining: test actual old phone export/import and browser migration; improve location fairness and multiple automatic same-day assignments; investigate quota and malformed legacy journal compatibility. Do not merge/deploy main yet.

2026-11-19 release preparation: Replaced the -300 vacation bonus with a capped 1.5 day queue age advantage, active only while below team average. Same-day/yesterday trips rank after other workers; if all have travelled, the algorithm still assigns. Reuse across distinct locations in a single click when needed, recording separate journal entries. The old fixed 4/5 peer-wait rule is not used. 19 Node tests pass, including 1-place, 7-place, returnee and repeat-day cases. Main has not yet been updated at this checkpoint. A real phone export and offline reload remain post-publication user checks; no access to phone data in workspace.

2026-11-19 post-publication: Main merged at 2fc4a7f; Pages build succeeded and live ORACLE 16 was observed after closing the legacy tab. Found and fixed restoration overwrite on beforeunload; version/cache bumped to 17. A real phone's history remains untested because no phone data or session is available. The user must export JSON on each phone, then verify history/settings and offline startup after updating.

2026-11-19 next release: Version 18 introduces a 30-calendar-day vacation catch-up plan. Priority becomes urgent only when actual trips lag behind a linear target; daily trips are allowed then. Under synthetic 10-day vacation + 3 trips/day, after 30 days all six have 20 trips, with occasional consecutive days. Under 5 trips/day to one location, catch-up cannot complete because the returnee already goes every day; UI displays remaining deficit. Manual assignments override soft no-location/no-loading preferences but still stop on actual vacation/full-day absence. Manual location assignments now count toward requested places, like manual loading assignments. 24 Node tests pass. Preserve dutyApp and update via waiting service worker; real phone data still not accessible here.

2026-11-19 correction from field use: Version 18 promoted an overdue returnee ahead of peers, causing consecutive trips. Version 19 moves an overdue returnee only into the lower half of the unused queue and limits extra priority to 1.5 times the peer trip rate after return. The 30-day target can therefore be impossible under fixed three-of-six daily demand; UI reports remaining gap. Removed location-specific counts from sorting; only global queue controls assignment, while location counts remain in statistics. Saved per-person reasons now appear with each new journal entry and at distribution time. Existing journal entries remain unchanged and have no reconstructed reasons. The app reads persisted dutyApp counts/journals, but no actual phone export was provided to diagnose Surnin/Repin counts. 26 Node tests pass before publishing.

2026-11-19 loading teams: Swap Сабуров into team 1 and Осинкин into team 2. Preserve historical loadingJournal entries; only future assignments use new membership. Version/cache 20-ORACLE.

Version 21: calendar-safe vacation return detection on delayed distribution; processed return marker prevents restarting completed plans; new vacation replaces an expired older plan. Backup retention keeps recent version copies and eight dated copies plus the newly created copy; preserves live state, previous save, selected restore source and unrelated keys. 31 tests pass with TZ=Europe/Samara. +50% remains a priority allowance, not a hard ban on ordinary/manual assignments. Real phone migration still needs verification.

Version 22: backup cleanup runs only after verified successful write of a structurally valid copy; keeps newest valid older copy in each managed category and restore source. No cleanup for corrupt data or failed write. Catch-up is inactive before start and after deadline. Editing/removing the vacation linked to the active plan invalidates that plan and its processed marker; next distribution recalculates actual return dates. Unrelated future vacation edits preserve the current plan. 37 tests pass in Europe/Samara; Android update with actual phone data remains untested.
