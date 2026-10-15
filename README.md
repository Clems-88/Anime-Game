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
- **Check another day's character:** change your computer's clock (the game uses the UTC date).

## Add characters

Open `characters.json` and add an entry to the list:

```json
{
  "name": "Character Name",
  "anime": "Anime Title",
  "clues": [
    "Hardest clue",
    "Harder clue",
    "Easier clue",
    "Easiest clue"
  ]
}
```

- Every character needs exactly 4 clues, hardest first.
- Names must be unique (they power the autocomplete).
- Write the anime title the same way each time (e.g. always `"One Piece"`), so the game knows which characters share a show.
- Text clues only. Don't add images, official artwork or logos.

The daily order is a fixed shuffle that keeps characters from the same anime apart. It's rebuilt from the whole list, so **adding characters changes which character appears on future days** (and can change today's). Add new ones shortly after UTC midnight if you want to avoid changing a puzzle people are mid-way through.

## Settings

At the top of `game.js`:

- `GAME_NAME` – the name shown in the share text.
- `SITE_URL` – the link on the second line of the share text. **Replace the placeholder** once you deploy.
- `LAUNCH_DATE` – the UTC date of puzzle #1. Set this to your real launch day.
- `SHUFFLE_SEED` – change it for a different daily order.

To rename the game, also change the `<title>` and the logo in `index.html`.

## Deploy (free)

It's a static site: upload the four files and you're done.

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
