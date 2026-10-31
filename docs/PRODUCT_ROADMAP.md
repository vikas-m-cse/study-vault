# StudyVault Product Roadmap

**Status:** Proposed roadmap informed by the product owner's stated preferences and external learning-science evidence. It is not a report of a representative student survey.

## Evidence labels

- **Owner preference:** Explicit product direction from the StudyVault owner.
- **External research:** Published research that informs the learning design; it does not prove that every feature will be preferred by StudyVault users.
- **Qualitative signal:** Anecdotal public feedback from other study products; useful for hypotheses, not population-level conclusions.
- **Needs validation:** A hypothesis that must be tested with real StudyVault users and product telemetry.

## Product direction

StudyVault should help students **remember what they learn**, not merely store more material. Revision is the primary learning workflow. Students should have both smart recommendations and manual control, presented through a simple, calm interface.

### Owner-stated preferences (not poll results)

1. Biggest pain: forgetting.
2. Most valuable feature: revision.
3. Revision preference: both guided/smart revision and manual topic selection.
4. Interface preference: simple.

These are the product owner's stated preferences only. No representative student poll or user survey has been completed as part of this roadmap.

## Roadmap and acceptance criteria

### P0 — Reliability and data safety

- [ ] Run TypeScript/build, lint, unit tests and relevant browser smoke tests.
- [ ] Verify notes and resources persist across reloads and app restarts.
- [ ] Verify review schedules, mastery records and revision recaps survive reloads.
- [ ] Verify storage failures do not crash the core note-taking workflow.
- [ ] Check for runtime errors, broken navigation, overflow, keyboard traps and unreadable contrast.
- [ ] Add regression tests for review scheduling and revision-session progression.
- **Done when:** the production build and automated checks pass, core flows have been manually smoke-tested, and known failures are documented.

### P1 — Revision Center (highest product priority)

- [ ] One clear starting point for today's revision: due, overdue, recently studied and weak concepts.
- [ ] "Revise what I learned today" checkpoint after returning to the app.
- [ ] Smart mode ranks concepts using due date and evidence of difficulty; manual mode allows subject/topic selection.
- [ ] A simple session-size choice, progress indicator, pause/exit and resume behavior.
- [ ] Recall first, reveal the source-backed answer, then rate performance.
- [ ] Important points drawn from the original note, with a link back to that note.
- [ ] Explain review ratings in plain language so students know how they affect the next review.
- [ ] Handle empty states honestly: no due topics, no notes yet, or filters with no matches.
- **Done when:** a user can start a smart or manual session, leave and return without losing persisted progress, review a concept, and reach its source note.

### P1 — Effective learning loop

- [ ] Retrieval before answer reveal.
- [ ] Corrective feedback that identifies missed points against the source, without inventing facts.
- [ ] Support recall, definitions, why/how, comparisons, applications and teach-back prompts where the source supports them.
- [ ] Let users edit generated concepts and correct bad splits.
- [ ] Track confidence separately from observed answer outcome.
- [ ] Use spaced review and learning evidence to recommend the next action.
- **Done when:** a user can explain why a concept is due and see source-grounded feedback after an attempt.

### P1 — Simple, actionable progress

- [ ] Show mastery, due work and weak topics only when they lead to a useful next action.
- [ ] Distinguish attempts, accuracy, confidence and estimated mastery.
- [ ] Avoid unsupported "exam-ready" or retention guarantees.
- [ ] Recommend one clear next action rather than overwhelming users with charts.
- **Done when:** progress screens are understandable in a short usability test and every prominent metric has a clear definition.

### P2 — Exam preparation and planning

- [ ] Connect topics to subjects, syllabus modules and exam dates.
- [ ] Create a realistic revision plan with catch-up handling.
- [ ] Generate exam-style questions grounded in selected notes.
- [ ] Offer timed practice and mock tests only after core revision is reliable.
- **Done when:** the plan links each task to a syllabus topic/source and adapts when tasks are missed.

### P2 — Connected workspace and usability

- [ ] Link notes, resources, subjects, review and timetable consistently.
- [ ] Improve search, backlinks and navigation to source material.
- [ ] Add accessible keyboard behavior, responsive layouts and clear empty states.
- [ ] Provide safe export/backup and recovery guidance for local-first data.
- [ ] Finish the approved light Champagne Gold & Ivory theme after functional checks.
- **Done when:** common tasks are discoverable, accessible and tested on desktop and mobile widths.

## Measurement plan

These are proposed metrics, not current results:

- Revision-session completion rate.
- Return-to-revision rate after leaving the app.
- First-attempt recall outcome by concept.
- Repeated-error rate and later performance on previously missed concepts.
- Time and number of actions required to start a revision session.
- Task success and confusion reports during usability testing.
- Persistence/regression test pass rate.

Avoid treating session length, streaks or number of cards viewed as evidence of learning by themselves.

## Validation plan

1. Conduct short usability sessions with students from different courses and levels.
2. Ask participants to find today's revision, choose topics manually, complete a recall, inspect feedback and resume later.
3. Collect feedback on clarity, trust, perceived usefulness and missing controls.
4. Report sample size and participant mix. Label results as exploratory when the sample is small or self-selected.
5. Compare proposed features against observed problems before expanding scope.

## Scope guardrails

- Prefer reliability and revision over adding unrelated features.
- Keep the default interface simple; reveal advanced controls progressively.
- Preserve existing user data and local-first behavior.
- Do not merge design work into `main` until the owner approves the visuals.
- Do not claim a build, test, browser check, poll, or learning outcome unless it has actually been completed and evidenced.
