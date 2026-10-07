# StudyVault

StudyVault is a local-first student knowledge workspace for collecting, organizing, searching, writing, and **actively reviewing** academic material.

## What makes this version different

StudyVault is being designed from learning-science evidence rather than from a generic notes-app feature checklist.

### Evidence-informed principles

- **Active recall first** — the Review workspace asks the student to reconstruct knowledge before revealing the note.
- **Spaced review** — review intervals expand after successful recalls instead of encouraging constant rereading.
- **Self-explanation** — students are prompted to explain ideas in their own words.
- **Structured organization** — subjects, folders, tags, notes, and resources make retrieval easier.
- **Useful dashboards** — progress should lead to a learning action, not become a vanity metric.
- **Local-first privacy** — core notes and resources remain in browser storage.

## Current stack

- React 19
- TypeScript
- Vite
- TipTap
- IndexedDB
- Lucide React
- Vitest + Testing Library

## Current workspace

- Dashboard
- Subjects
- My Resources
- Notes
- Favourites
- **Review — active recall + spaced review**

## Research direction

The product research is based on a broad evidence set spanning retrieval practice, spacing, self-regulated learning, learning analytics, digital information organization, concept mapping, note-taking, time management, and student-facing learning systems.

Important findings include:

- Retrieval practice consistently improves learning in applied classroom research; a 2021 review synthesized 50 experiments and found medium/large benefits in 57% of experiments.
- A 2025 meta-analysis of 44 studies found a small overall advantage for retrieval over several elaborative learning conditions, with feedback substantially increasing the benefit.
- A 2025 applied meta-analysis found distributed practice produced a moderate advantage over massed practice (d = 0.54).
- A 2021 meta-analysis of 49 university SRL-training studies found positive effects on academic performance (g = 0.37), metacognitive strategies (g = 0.40), resource-management strategies (g = 0.39), and motivation (g = 0.35).
- A 2026 meta-analysis of 31 studies involving 13,506 college students found a positive relationship between time management and learning outcomes (r = 0.25), while also highlighting high heterogeneity.
- Research on student-facing learning analytics warns that dashboards work best when they support learning decisions rather than merely displaying analytics.
- Digital-library research repeatedly shows that usefulness, task fit, navigation, and search quality strongly influence whether students actually use academic information systems.
- Note-taking research warns that fast transcription can encourage shallower processing; StudyVault therefore emphasizes recall and explanation instead of simply storing more text.

These findings are design inputs, not guarantees of individual grade improvement. StudyVault will be evaluated with real student usage and outcome data before making causal claims.

## Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Validate:

```bash
npm run lint
npm run test
npm run build
```

## Repository

The canonical repository is maintained on GitHub under the `main` branch.
