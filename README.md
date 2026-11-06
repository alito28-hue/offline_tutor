# Amara

Amara is a prototype AI tutor for children aged 8 to 14. It runs entirely on a laptop, with no Wi-Fi and no cloud. It explains primary-school maths and science step by step, shows the article each answer came from, and asks a question back.

It is a working prototype. **It has not been tested in a school, and children should use it with an adult nearby.**

- `tutor/`: the tutor (Node.js, [QVAC SDK](https://www.npmjs.com/package/@qvac/sdk)). Technical details, in Spanish, are in [`tutor/README.md`](tutor/README.md).
- `web/`: the project website, in English, Spanish and Portuguese. Static pages plus one function for the pilot form.
- `web-src/`: the templates and translations that generate those pages.

## Run it without internet

You need macOS 14 or later on Apple Silicon, Node.js `^22.21` or `>=24.9`, and about 3 GB of free disk space. It has only been run on one Mac so far; other systems are not supported yet.

Set it up once, with internet:

```bash
npm ci
node tutor/tools/fetch_models.mjs   # downloads 2.8 GB to ~/.qvac/models
```

Then, with or without internet:

```bash
./tutor/run.sh               # opens the tutor full screen
./tutor/run.sh --no-browser  # server only, at http://127.0.0.1:8788
./tutor/run.sh --test        # fast tests
./tutor/run.sh --test-all    # also runs the real models inside the network sandbox
```

Keep the folder on a local disk, not in Dropbox or iCloud: those services can leave files in the cloud only, and the tutor would not start offline.

## How it works

1. **Safety check.** A word filter screens the question. Inappropriate topics are redirected, and questions about self-harm or abuse point to a trusted adult. The model never sees them.
2. **Search.** The question is compared with every passage in the library, on the device. If no single article covers it, the tutor says "I don't know" without calling the model.
3. **Answer.** Qwen3 4B writes 2 or 3 steps and a question back, using only that article as material. The output is checked before it reaches the screen.
4. **Source.** The app attaches the source, not the model.

**Keeping it offline.** On macOS, `sandbox-exec` blocks IPv4, IPv6, UDP and DNS for the tutor and its child processes, and the tutor stops if the block does not work at startup. A separate monitor checks the tutor's sockets every 0.5 s from outside the block. The browser is not covered by the sandbox, so turn the Wi-Fi off too if you need the whole machine offline.

## Measured results

Measured on 2026-11-05 on one MacBook with an Apple M1 Pro and 16 GB of memory, on macOS 26.4, with the network blocked by the sandbox and swap almost full because other apps were open.

| Measure | Result |
|---|---|
| Time to first word, 5 demo questions | 1.5 to 1.8 s |
| Time to first word, 60 questions on the 30 topics | median about 1.7 s, maximum 2.0 s in the last run |
| Full answer, demo questions | 4.7 to 7.1 s |
| Answer length, demo questions | 82 to 96 words |
| Right source, 60 questions on the 30 topics | 60 of 60 |
| Declined, 18 questions outside the library | 18 of 18 |
| Automated tests, with the real models | 52 of 52 pass |

**Read these numbers with care:**

- The 60 and 18 evaluation questions were also used to tune the system, so new questions may do worse.
- A right source does not mean a right answer. Answer quality was reviewed by hand on only 20 answers, and the 5 demo questions were chosen from them.
- In two earlier runs with swap almost exhausted, a few questions took between 1 and 5.6 minutes to produce the first word. Memory pressure is the likely cause, but this is not proven. Close other apps first.

## Limits

- **Not ready for children to use unsupervised.** The filters look for words in Spanish and English. They can be worked around and are not an evaluated safety system.
- **It can be wrong or add details.** Citing a source does not guarantee that every sentence comes from it. In tests the model said a volcano grows before erupting, mixed up a magnet's poles and a nail, and misspelled words.
- **It can't tell a student whether their answer is right.** In tests the model marked a correct answer as wrong, so it now thanks the student and shows how to check.
- **Spanish and English only.** Swahili answers were unusable with both the 4B and 8B models, so the tutor shows a notice instead of generating text. The screen text is in Spanish.
- **The format isn't always kept.** In the last evaluation, 17 of 60 answers fell outside the 80 to 120 word target.
- **A small library.** It covers 30 topics in each language. Outside them, or when a valid question uses different words, it says "I don't know".
- **macOS only,** because of `sandbox-exec`, which macOS lists as deprecated.

## The website

Vercel serves `web/` with no build step (Framework: Other, Root Directory: `web`). After changing a template or translation, regenerate the pages and commit the result:

```bash
node web-src/build.mjs
node --test web-src/web.test.mjs
```

The domain lives in `web-src/site.json`. The pilot form calls `web/api/pilot.mjs`, which needs two environment variables in Vercel: `RESEND_API_KEY` and `PILOT_TO_EMAIL`. `PILOT_FROM_EMAIL` is optional, and is needed once the site sends from its own domain.

## Licences

| What | Licence |
|---|---|
| Code | [Apache-2.0](LICENSE) |
| Learning materials in `tutor/content/` | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), adapted from Wikipedia. Each file's source and revision are in [`tutor/content/LICENSES.md`](tutor/content/LICENSES.md) |
| Illustrations and video in `web/assets/` | Generated with AI. Not covered by the Apache-2.0 licence |
| Andika font in `web/assets/fonts/` | [SIL Open Font License](web/assets/fonts/OFL.txt) |
| QVAC SDK | Apache-2.0, installed by npm |
| Qwen3 4B Q4_K_M | Apache-2.0, not included in this repository |
| EmbeddingGemma 300M Q8_0 | [Gemma Terms of Use](https://ai.google.dev/gemma/terms), not included in this repository |

## Credits

Built by Alex Smith ([LinkedIn](https://www.linkedin.com/in/alexinteractive)). Learning materials by Wikipedia contributors. On-device AI by Tether's QVAC.

Amara is an independent prototype. It is not affiliated with Tether or any school.
