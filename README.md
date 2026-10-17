# Keres · Practical Chess Endings — interactive study edition

A local app for working through Paul Keres' *Practical Chess Endings* with a live board:
every diagram is a real position, every move printed in the text is clickable, and each
position can be trained ("guess the moves") or played out against Stockfish.

For personal use. The book's text and diagrams are extracted on this machine from your
PDF into `app/public/content/` and `app/public/qa/`. Both folders are git-ignored, so the
book's content is never committed or published.

## Run it

```bash
./start.sh
```

On the first run this sets up the Python pipeline, extracts the book from the PDF (about
15 seconds), installs the app and opens it in your browser. Later runs only rebuild and
serve the app.

- `./start.sh --dev` runs the Vite dev server with hot reload (http://localhost:5317).
- `./start.sh --rebuild-content` re-extracts everything from the PDF.
- If the PDF is not at its default Desktop location, use `KERES_PDF=/path/to/book.pdf ./start.sh`.

## Using the app

- **Read**: the board column sits next to the book text. Click any move or diagram, or
  use the keys: `←` `→` move through the line, `↑` `↓` jump between diagrams,
  `Home`/`End` go to the start or end of the line, `F` flips the board.
  - When you scroll the text, the board follows to the diagram you are reading (you can
    switch this off in Settings).
  - Moves you play on the board follow the book's tree. If you play a move the book doesn't
    give, a dashed "your analysis" line starts, and `Esc` returns to the book.
  - The arrow button shows the book's moves from the current position.
- **Guess**: start from any diagram ("Guess the moves" under it, or the *Guess* tab).
  - You play one side of the main line. A wrong move is rejected. A move Keres only
    examines as a side line is recognised as such.
  - Hints highlight the piece to move, then show the move itself.
  - The commentary is revealed as you find the moves, and later moves stay hidden. Scores
    are kept per diagram.
- **Play**: play the current position out against Stockfish 19 (WASM, offline).
  - You can take moves back, switch sides, and show an evaluation bar.
  - The strength is set in Settings. The panel shows whether the game is still following
    the book.
- **Settings** (gear icon): Paper or Night theme, board style (Wood, Book print, Slate),
  coordinates, sounds, and engine strength.
- **Content check** (`/qa`, linked from the home page): every printed diagram beside the
  position recognised from it, plus the notation that could not be tied to a position.

Progress (sections read, diagrams studied, guess scores, last position) is kept in the
browser's local storage.

## How it is built

```
pipeline/            Python: PDF -> JSON (one-time, reproducible)
  extract.py         reading-order stream: headings (from the PDF outline), paragraphs with
                     bold/italic runs, main-line table rows, diagram images
  diagrams.py        diagram image -> position: board frame detection, 8x8 cells,
                     shift-tolerant template matching (templates/), split double diagrams
  notation.py        figurine notation -> move trees: every sequence is attached to the
                     position it starts from by trying likely parents and checking legality
                     (printed "+" must be check; lines resume after bracketed asides; a
                     skipped reply is filled in as a pass or, after a check, a forced move)
  positions.py       builds hypothetical positions ("king on c6", "one file to the left")
  overrides.json     manual fixes: replaced diagrams and the hypothetical positions the text
                     describes; each entry is matched to its paragraph by page + text
  build.py           writes app/public/content/{toc.json, sections/*.json, qa.json}
  debug_unit.py      prints the text around a diagram with what was recognised
  tests/             pytest
app/                 Vite + React 19 + TypeScript, Tailwind CSS v4, chessground, chessops,
                     zustand, motion, Stockfish 19 lite (single-threaded WASM worker)
```

Current extraction results: 879 diagrams become 893 positions (14 diagrams print two
positions). 549 of them are confirmed independently, because the book's moves lead exactly to
the printed diagram. 98.5% of the printed moves (17,580 of 17,855) are linked to a board
position.

36 hypothetical positions that the text describes but does not print ("with the white king
on f2…", "moved one file to the left") are built from their diagrams (see
`pipeline/overrides.json`). Their lines are clickable too, and the board labels them as
*Hypothetical*. Replies the book skips ("8 ♕f8+ followed by 9 ♕g7+") appear greyed in the
move list.

The 72 sequences still not linked are shown in grey and are not clickable. They are mostly
variations inside other hypotheticals ("if Black's rook were now on the b-file…"), lines that
are illegal on purpose ("preventing 2 ♔e2"), and a few tangles in deeply nested analysis.
The `/qa` page lists them. Two misprinted diagrams in the book (138 and 485) are detected, and
the board shows the position the moves actually reach.

Performance: section files are lazy-loaded and the next one is prefetched. All positions
are precomputed, so stepping through a line costs well under a millisecond of main-thread
work. Chessground updates the board outside React's render cycle, and the engine only loads
when Play mode is opened.

## Tests

```bash
cd pipeline && .venv/bin/python -m pytest -q
cd app && npm test
```

## Credits

Chess pieces: cburnett set by Colin M. L. Burnett (CC BY-SA 3.0). Board: chessground (GPL-3.0).
Move logic: chessops (GPL-3.0). Engine: Stockfish via stockfish.js (GPL-3.0).
