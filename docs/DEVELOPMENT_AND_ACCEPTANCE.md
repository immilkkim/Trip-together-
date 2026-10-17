# Development and acceptance workflow

## Responsibility

| Role | Work |
| --- | --- |
| Owner + planning conversation | Set scope, prioritize changes, define acceptance, review evidence |
| Codex Cloud | Read source, implement one task, test, diagnose failures, produce a branch/PR and report |
| Friend contributor | Same workflow through a fork or authorized feature branch |
| Owner | Use the preview for UX acceptance and choose whether to merge/release |
| Sites release task | Port accepted public-code changes into the live Site while preserving private configuration/data; test and publish |

The owner should not have to repeat terminal checks that Cloud can run. Manual
acceptance focuses on what the traveler sees and whether the flow makes sense.
Technical checks are evidence for acceptance, not a substitute for it.

## Stages

| Stage | Cloud task | Acceptance gate |
| --- | --- | --- |
| C0: environment | Install, start services, local D1/R2, report baseline | Preview opens and saving survives reload; actual check results available |
| C1: baseline audit | Exercise existing core flows; add targeted regression tests and list concrete bugs | Evidence per scenario, clearly separating tested behavior from assumptions |
| C2: focused fixes | One PR per verified bug; prioritize state loss and vote/publish defects | Reproduction fails before fix and passes after; relevant regression checks pass |
| C3: mobile refinement | Improve confirmed UX issues at phone and desktop sizes | Owner can complete the core flow on phone; timeline scaling/overlap remain correct |
| C4: release | Review and port accepted changes into Sites | Existing member names, dates, invitation, data, and uploads preserved; live checks pass |

C1 must inspect concurrency: the current API accepts a client revision but
unconditionally upserts the complete state, so conflict protection must not be
assumed. GET silently falls back to demo state on database errors; check that
the preview is genuinely persistent. These are audit targets, not completed
fixes. Multi-trip creation also needs implementation verification: the current
state route uses one fixed demo trip ID.

## Core acceptance scenarios

| Scenario | Required result |
| --- | --- |
| Invite entry | Valid path reaches name selection; invalid invite cannot read/write trip APIs |
| Name editing | Editing a member's own name survives reload and appears in another session |
| Basket activity | Create/edit/delete with time, description, links, selected invitees, and uploaded photo |
| Basket permissions | Creator, leader, invitees see authorized controls; unrelated member cannot perform an unauthorized write through the API under the agreed trusted-group model |
| Voting | Invited member can choose yes/maybe/no; non-invited member cannot vote for the activity |
| Conflict | A yes vote for 10:30–11:30 warns about an existing 10:00–12:00 item; exact adjacent boundaries do not overlap |
| Leader publication | Voting alone makes no confirmed card; publication adds cards only for yes voters, with matching date/time/members |
| Repeat publication | No duplicate cards; changed votes/republication handled consistently |
| Daily edits | Related members and leader can edit/delete; daily creation has no photo field |
| Timeline | 10:00–12:00 spans two hours; concurrent groups appear side by side |
| Two sessions | Updates are visible in another session; stale writes do not silently erase another member's work |
| Upload failure | Unsupported/oversize files and storage failures show clear errors without losing entered data |
| PWA/offline | Installability checked on supported browsers; loaded itinerary readable offline; reconnect behavior clearly reported |

Name-only login deliberately permits identity switching by invite holders.
Server checks can enforce permissions for the selected session identity; they
cannot prove that a person is the chosen member. Report that distinction without
silently adding PINs, email login, or changing the confirmed product decision.

## Task template

```text
Task: [one concrete bug or feature]
Read AGENTS.md and the relevant workflow docs first.
Goal and scope: [observable before/after behavior]
Acceptance: [specific examples]
Implement on one focused branch. Run appropriate checks and tests, and verify
the relevant UI flows. Use only public demo data and local DB/R2. Do not deploy
or merge. Hand off the PR/diff, exact check results, preview/screenshot evidence,
remaining risks, and no more than five owner acceptance steps.
```

## C1 prompt — baseline audit, after C0 passes

```text
Audit Trip Together's existing implementation against the core scenarios in
docs/DEVELOPMENT_AND_ACCEPTANCE.md. Confirm what actually works rather than
assuming previously reported features are complete. Run relevant existing
checks, exercise two separate sessions with local D1/R2, and add a minimal set
of useful regression tests where the project lacks coverage. Reproduce and
prioritize defects around stale saves, API permissions, yes-vote time conflicts,
publication, duplicate cards, and phone timeline layout. Do not implement broad
product redesigns or feature fixes in this audit task. Produce a reviewable PR
for any test additions and a report of pass/fail/blocked evidence, recommended
focused fix tasks, and five short owner acceptance steps. Do not merge or deploy.
```

## Release notes

The public repository intentionally has different demo identity/date/config
values from the live Site and a separate Git history. Do not replace the live
checkout wholesale or merge unrelated histories. Apply the accepted feature
diff to the existing Site and preserve its private settings. A GitHub PR merge
does not update the production website.
