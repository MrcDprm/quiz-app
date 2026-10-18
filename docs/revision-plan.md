# Revision plan (v2)

Working notes for the second version of Quiz App. The README describes the live version; it is updated when each part ships.

## Why

- School levels (primary school … master's) do not fit general knowledge: "master's level geography" means little, and most general subjects had only 6–8 hand-written questions per level.
- The question pool is mostly fixed: a hand-written bank plus a few data templates.
- There is no way to play together.

## Part 1: Categories and difficulty

- Levels are replaced by three difficulties: **Easy, Medium, Hard**.
  - Bank questions: primary and middle school → Easy, high school → Medium, university and master's → Hard.
  - Data templates: popularity tiers 1–2 → Easy, 2–3 → Medium, 3–4 → Hard.
- Categories in two groups, chosen from cards instead of drop-down lists:
  - **General knowledge:** History, Geography, Science, Maths, Literature and art, General knowledge (mixed). Sport and Film and music arrive with part 2.
  - **Software:** Coding basics, Algorithms, HTML and CSS, Python, JavaScript, SQL, Git, Web security, C#, Mixed.
- Flow: pick a category → pick a difficulty → play. The last choice is remembered.
- Addresses: `/tarih/kolay`, `/python/zor` … (Turkish slugs as today, `?lang=en` for English); old level addresses such as `/tarih/ortaokul` redirect permanently.
- Saved progress moves to the new keys (best scores and explored topics are merged; "seen" and "my mistakes" lists of the old format are cleared).
- The "Master's" badge becomes "Hard nut": 8 or more correct answers in a Hard round.

## Part 2: Dynamic questions

- **More data templates** (Wikidata and other open data): capitals, rivers, mountains, inventions, films and directors, sports tournaments, historical events. Facts come from the data, not from a model.
- **AI question pool**, refreshed every night by a Vercel cron job:
  1. Gemini writes questions for each category and difficulty, in Turkish and English, with an explanation.
  2. A second model answers each question without seeing the answer. If it disagrees, or more than one option could be right, the question is dropped.
  3. Format, length and duplicate checks; approved questions go to a capped pool in Redis.
- Rounds mix bank, template and pool questions. AI questions are labelled.
- **Report a question:** a button on the answer screen; a reported AI question leaves the pool.
- Code questions stay hand-written and run-verified.

## Part 3: Live game (Kahoot-style)

Runs as a small WebSocket service (`live/`) on an always-on server (Oracle Cloud, next to Zarf), sharing the question code with the main app. Mobile first.

- **Room:** the host picks category, difficulty and number of questions and gets a 6-digit code (and a link / QR code). Players join with the code and a nickname, no account.
- **Room settings:** every option below is chosen on the "create room" screen. Each has a default, so the host can also just tap "Create" and change nothing. Settings are grouped on one mobile-friendly screen (toggles and segmented buttons, "Advanced" section folded).
  - Advance: **manual by default**, the host taps "Next question"; or automatic after the reveal.
  - Time per question: 10 / 20 (default) / 30 / 60 seconds, or no limit (only with manual advance).
  - Question on players' phones: shown (default, for remote play) or only on the host screen (classroom style, phones show coloured answer buttons).
  - Leaderboard: after every question (default) or only at the end.
  - Speed bonus: on (default) / off.
  - Host: plays too (default) or only moderates.
  - Late joining: off (default, the room locks when the game starts) / on.
  - Correct answer and explanation on phones after each question: shown (default) / hidden.
- **Host tools during the game:** pause and resume, skip a question, end early, remove a player. Shown in a compact menu on the host screen.
- **Scoring on the server:** answers never reach the phones before the reveal; points depend on correctness and server-measured speed.
- **Limits:** up to 30 players, nicknames validated and escaped, rate limits, idle rooms close after 30 minutes. Rooms live in memory (a single process).

## Order

Each part in its own branches, tested and released before the next: part 1 → part 2 → part 3 → README, screenshots, SEO, release `v2.0.0`.
