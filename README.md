# Quiz App

**English** | [Türkçe](README.tr.md)

A timed quiz game in plain HTML, CSS and JavaScript, with questions in Turkish and English loaded from JSON files.

> Work in progress. The plan below will become the full README when the project reaches v1.0.

## Features (plan)

**MVP**
- [ ] 8 categories with 25 questions each (general knowledge, science, history, geography, technology, sports, art and literature, cinema and music), with separate Turkish and English files: 400 questions in total
- [ ] A round of 10 random questions from one category or from all categories mixed; answer options are shuffled
- [ ] 20-second timer per question; running out of time counts as a wrong answer
- [ ] Scoring: 10 points for a correct answer plus a speed bonus
- [ ] After each answer the correct option is shown
- [ ] Result screen: score, correct answers, time, and a review of every question
- [ ] Best score per category, kept after a page refresh
- [ ] Keyboard play (1–4 to answer, Enter for the next question) and screen-reader announcements
- [ ] Turkish and English interface, dark and light theme matching my portfolio
- [ ] Quiz logic in separate modules, tested with Node's built-in test runner
- [ ] Deployed on Vercel

**Later**
- 50:50 joker
- Difficulty levels
- Sharing the result

## Tech Stack

- HTML, CSS, JavaScript (ES modules, no framework, no build step)
- `node --test` for unit tests
- Vercel for hosting
