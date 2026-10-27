# AI question flow (proposed)

> **Status:** draft design, not built.
>
> The generator half lives in `real-estate-quest-ai-gen` → `docs/ai-question-flow.md` on the `docs/ai-question-flow` branch. The overview and lifecycle diagrams are the same in both repos.

## Principles

- **Repos are the source of truth for anything students see.** Firestore is a copy that can be rebuilt from the repos at any time.
- **`questionsAiPending` is a disposable review queue.** Losing it costs a regeneration, nothing more.
- **AI questions never go into `questions`.** The nightly human import deletes and reimports whole chapters, so anything else in that collection would be wiped.
- **The human questions repo stays read-only everywhere.** Only the new AI repo gets a write token.

## Where things live

There is **one Firebase project**, the existing `real-estate-quest`. There is no separate AI project; the generator, the app, and every collection below live in it.

| | What | Notes |
|---|---|---|
| Firebase project | `real-estate-quest` | The only one. Runs the app, all functions, and Firestore. |
| Functions | `default` codebase from the `real-estate-quest` repo<br>`ai-gen` codebase from the `real-estate-quest-ai-gen` repo | Two repos deploy into the same project. Deploying one never touches the other's functions. |
| Firestore | `questions` (existing), `questionsAi`, `questionsAiPending`, `metadata/aiQuestions` | All in the same database, so no credentials are needed between pieces. |
| GitHub | `real-estate-quest-questions` (existing, human)<br>`real-estate-quest-ai-questions` (new, AI) | Both private. The source of truth for anything students see. |
| External | Claude API | Called only by the generator. |

## Overview

```mermaid
flowchart LR
  subgraph GEN["Step 1: Generate (weekly)"]
    G["generateAiQuestion<br/>(ai-gen codebase)"] <--> CL["Claude API"]
  end

  subgraph REV["Step 2: Review"]
    QP[("questionsAiPending<br/>review queue")] --> ADM["Admin AI tab<br/>approve or reject"]
  end

  subgraph SOT["Step 3: GitHub"]
    HR[("human questions repo")]
    AR[("AI questions repo<br/>(new)")]
  end

  subgraph IMP["Step 4: Import (nightly, and on approve)"]
    I["importChapterFromRepo"]
  end

  subgraph SRV["Step 5: Serve"]
    Q[("questions")]
    QA[("questionsAi")]
    API["getQuestionsByChapter<br/>preloadContent"]
    STU["Student app"]
    Q --> API
    QA -- "user toggle on" --> API
    API --> STU
  end

  G --> QP
  ADM -- "approve = commit" --> AR
  HR --> I
  AR --> I
  I --> Q
  I --> QA
```

The generator also reads `questions` (few-shot examples) and `questionsAi` (to avoid duplicates); see the generation diagram.

## Question lifecycle

```mermaid
stateDiagram-v2
  direction LR
  state "Pending review" as Pending
  state "In AI repo" as InRepo
  state "Live in questionsAi" as Live

  [*] --> Pending: generated and validated
  Pending --> Pending: admin edits
  Pending --> Rejected: admin rejects
  Pending --> InRepo: admin approves (commit)
  InRepo --> Live: imported
  Live --> InRepo: edited or deleted on GitHub
  Rejected --> [*]

  note right of Rejected
    Kept in the queue so the
    generator avoids the topic
  end note
```

## Review and approve (this repo)

```mermaid
sequenceDiagram
  autonumber
  actor A as Admin
  participant UI as Admin page (AI tab)
  participant FN as Admin functions
  participant F as Firestore
  participant GH as GitHub API<br/>(AI repo)

  A->>UI: open AI tab
  UI->>FN: getAiPendingQuestions
  FN->>F: read questionsAiPending
  FN-->>UI: pending questions
  A->>UI: review, optionally edit
  alt approve
    UI->>FN: approveAiQuestion(id, edits)
    FN->>FN: check isAdmin claim, apply edits, validate
    loop retry if the file changed underneath (max 3)
      FN->>GH: GET N.json (content + sha)
      FN->>FN: append question, questionNumber = highest + 1
      FN->>GH: PUT N.json with that sha
    end
    FN->>F: replace chapter N in questionsAi with the committed file, store hash
    FN->>F: mark pending doc approved (commit sha, approvedBy)
  else reject
    UI->>FN: rejectAiQuestion(id, reason)
    FN->>F: mark pending doc rejected
  end
  FN-->>UI: done
```

## Nightly import (this repo)

The existing nightly job imports both repos through one shared function, so no new Cloud Scheduler job is needed.

```mermaid
flowchart LR
  J1["nightly job, chapters 1-20<br/>human repo → questions"] --> IMP
  J2["nightly job, chapters 1-20<br/>AI repo → questionsAi"] --> IMP
  APR["approveAiQuestion<br/>one chapter, right after commit"] --> IMP
  IMP["importChapterFromRepo<br/>(repo, file, collection, chapter)"] --> B{"file hash<br/>changed?"}
  B -- no --> SKIP["skip"]
  B -- yes --> C["delete that chapter's<br/>docs in the collection"]
  C --> D["write questions<br/>from the file"]
  D --> E["store new hash<br/>in metadata"]
```

`approveAiQuestion` already has the committed file in hand, so it can skip the fetch and go straight to the replace step.

## Serving (this repo)

```mermaid
flowchart TD
  CALL["getQuestionsByChapter(chapter, includeAi)<br/>or preloadContent"] --> H["load human questions<br/>(premium filter as today)"]
  H --> T{"includeAi on?<br/>(user option)"}
  T -- no --> OUT["return questions"]
  T -- yes --> S{"serve flag on?<br/>(admin switch)"}
  S -- no --> OUT
  S -- yes --> AI["load questionsAi for chapter<br/>(same premium filter)"]
  AI --> MERGE["append after human questions"]
  MERGE --> OUT
  OUT --> CLIENT["client caches per chapter and includeAi,<br/>labels them AI Question N"]
```

Every AI question is `premium: true`, so free users never get them whatever the toggle says.

## Changes in this repo

**Functions** ([functions/index.js](../functions/index.js))

- [ ] Pull the body of `importQuestionsFromRepo` into `importChapterFromRepo(repo, file, collection, chapter)` and have the nightly job call it for both repos.
- [ ] New secrets: a fine-grained GitHub token with contents read/write on the AI repo only, plus the AI repo name. The existing `GITHUB_TOKEN` stays read-only.
- [ ] Admin-only callables, checking the `isAdmin` claim like the existing admin functions: `getAiPendingQuestions`, `approveAiQuestion`, `rejectAiQuestion`, `updateAiSettings` (the `generate` and `serve` flags).
- [ ] `getQuestionsByChapter` and `preloadContent`: accept `includeAi`, check `metadata/aiQuestions.serve`, merge.
- [ ] Give `questionsAi` the same composite indexes `questions` uses (chapter + premium + questionNumber).
- [ ] Make sure Firestore rules deny direct client access to `questionsAiPending` and `questionsAi`; everything goes through functions.

**Frontend**

- [ ] Admin page ([admin.vue](../src/components/admin.vue), [useAdmin.js](../src/composables/useAdmin.js)): AI tab with the pending list, an edit form, approve/reject, the generate/serve switches, and a Generate now button.
- [ ] Options modal ([optionModal.vue](../src/components/optionModal.vue)): an "Include AI-generated questions" switch next to "shuffled". Changing it clears the question cache.
- [ ] [useQuestion.js](../src/composables/useQuestion.js) and [usePreload.js](../src/composables/usePreload.js): pass `includeAi` and include it in the cache key.
- [ ] [questionCard.vue](../src/components/questionCard.vue): show "AI Question N" (or a badge) instead of "Question N", so numbers don't clash with human questions.
- [ ] [useActivityTracker.js](../src/composables/useActivityTracker.js): record `aiGenerated` so stats don't merge AI question 3 with human question 3.
- [ ] Tests for the new composable behaviour in `tests/composables/`.

## Open questions

- Should the toggle default to on or off for pro users?
- Mix AI questions into each chapter (as drawn above), or offer them as a separate practice set?
- Delete rejected questions after a while, or keep them forever for duplicate avoidance?
