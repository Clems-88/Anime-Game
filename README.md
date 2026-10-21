# AniGuess

A daily "guess the anime character" game, like Wordle. Everyone gets the same character each day.

Plain HTML, CSS and JavaScript. No backend, no build step.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page |
| `style.css` | The look |
| `game.js` | The game logic |
| `characters.json` | The character list (edit this to add characters) |
| `mascot.svg` | Kitsu, the original fox-spirit mascot (used in the logo) |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | Browser tab and home-screen icons |
| `og-image.png` | The 1200×630 picture shown in WhatsApp/social link previews |

## Run it locally

The game loads `characters.json` with `fetch`, so open it through a small local web server rather than double-clicking `index.html`.

From the project folder, run one of these:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then open http://localhost:8000 (for `npx serve`, use the address it prints).

To test on your phone, make sure it is on the same Wi-Fi and open `http://<your-computer's-IP>:8000`.

### Testing tips

- **Play again today:** your progress is saved in the browser. To reset, open DevTools → Application → Local Storage and delete `aniguess-state` (today's game) and/or `aniguess-stats` (your stats). Or use a private/incognito window.
- **See the How to Play popup again as a new player:** delete `aniguess-seen-help` the same way (or use a private window). Anyone can also reopen it with the **?** button.
- **Check another day's character:** change your computer's clock (the game uses the UTC date).

## Add characters

Open `characters.json` and add an entry **at the end of the list** (before the final `]`, with a comma after the previous entry):

```json
{
  "name": "Character Name",
  "anime": "Anime Title",
  "added": "2026-11-02",
  "clues": [
    "Hardest clue",
    "Harder clue",
    "Easier clue",
    "Easiest clue"
  ]
}
```

- **`added` is required for every new character.** Set it to today's date (UTC, written `YYYY-MM-DD`). The character can only be picked from the **day after** that date, so today's puzzle and every past puzzle stay exactly the same.
- Never use a date in the past for `added`. That would rewrite puzzles people have already played.
- The 24 launch characters have no `added` date. Only they may leave it out.
- Every character needs exactly 4 clues, hardest first.
- Names must be unique (they power the autocomplete).
- Write the anime title the same way each time (e.g. always `"One Piece"`), so the game knows which characters share a show.
- Text clues only. Don't add images, official artwork or logos.
- Fixing a typo in a clue is fine. **Don't rename or delete characters** once the game is live, because that changes past puzzles.

### How the daily schedule works

The game works out the character for each day in order, starting from launch day:

- Every character is used once before any character repeats. Then it loops around.
- Two characters from the same anime never come up back to back.
- A new character joins the rotation from the day after its `added` date and comes up at some point in the following days.
- Each day's pick depends only on the characters that existed on that day, so adding characters only ever affects future days.

## Settings

At the top of `game.js`:

- `GAME_NAME`: the name shown in the share text.
- `SITE_URL`: the link on the second line of the share text.
- `LAUNCH_DATE`: the UTC date of puzzle #1.
- `SHUFFLE_SEED`: picks the daily order. **Don't change it after launch**, because it would change past puzzles.

To rename the game, also change the `<title>` and the logo in `index.html`.

## Deploy (free)

It's a static site: upload all the files in this folder and you're done.

**GitHub Pages**
1. Push this repo to GitHub.
2. Repo → Settings → Pages → Source: "Deploy from a branch", pick your branch and the `/ (root)` folder.
3. Your site appears at `https://<username>.github.io/<repo>/`.

**Netlify**
1. "Add new site" → "Import an existing project" → pick the repo (or drag the folder onto app.netlify.com/drop).
2. Leave the build command empty and set the publish directory to `.` (root).

**Render**
1. New → Static Site → connect the repo.
2. Leave the build command empty and set the publish directory to `.`.

After deploying, put your real URL in `SITE_URL`.
