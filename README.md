# Meditations

A minimal, dependency-free static site for a collection of prayers and
meditations. Plain HTML/JS — no build step, no framework, no server. It works on
any static host, and even when opened directly from disk (`file://`).

Lives at [www.marcuschiu.com](http://www.marcuschiu.com).

## Structure

```
index.html            single-page app: the index + the one-per-page reader
support.js            shared runtime (do not edit)
favicon.ico
meditations/
  manifest.js         header text + the list of meditation files to load
  2024-12-28.js       one meditation per file, named by its date
  2025-01-15.js
  ...
```

There is no database and no admin tool — a meditation is just a small `.js` file.

## Adding a meditation

1. Create `meditations/<date>.js`, e.g. `meditations/2026-05-18.js`:

   ```js
   (window.PRAYERS = window.PRAYERS || []).push({
     slug: '2026-05-18',        // url id — opens at index.html#/2026-05-18
     title: 'A Short Prayer',
     date: '2026-05-18',        // YYYY-MM-DD (sets order + the reader date)
     // hidden: true,          // optional — true keeps it out of the public list
     body:
   `First paragraph.

   Second paragraph.`,
   });
   ```

2. Add its date to the list in `meditations/manifest.js`.

Reload the page — that's it. Meditations are ordered by `date` automatically.

## Citations (the hover feature)

Wrap any phrase in the `body` to attach a source that shows on hover:

```
[[ shown text || source ]]
```

The source can be:

- plain words — `[[dance||Perichoresis — the mutual indwelling…]]`
- a link — `[[Genesis 1:26||https://www.biblegateway.com/...]]`
- a label + link — `[[here||Reflections on the Psalms::https://…]]`
  (text before `::` is the shown label; after it is the url)

A line beginning with `> ` becomes an indented epigraph / scripture line.

## Admin mode

Press **⌘E** (macOS) / **Ctrl+E** (Windows/Linux) to toggle admin mode. It shows
the same site plus:

- an **edit** button on every meditation (and in the reader), opening an in-page
  editor for the date, title, prayer body + citations, and a **hidden** toggle;
- **hidden** meditations, which are dimmed here and omitted from the public site;
- a floating **+** to create one (date pre-filled to today, hidden by default);
- a **⚙ settings** button to point the editor at a different server endpoint
  (default `https://git.prayers.lan/`, remembered in `localStorage`).

Editing requires the server (`node server/server.mjs`) running at that endpoint.
Every save writes the flat `meditations/<date>.js` file, updates `manifest.js`,
and **git commits + pushes** the change. The admin API has **no authentication** —
only run it on a trusted network.

## Header text

The site title, eyebrow link, and tagline live at the top of
`meditations/manifest.js` in `window.MEDITATIONS_SITE`.

## Deploy

Serve the folder as static files. No server-side code is required.

## Optional: local server helper

The site runs fine from `file://`, but `server/server.mjs` is a zero-dependency
convenience (Node only, no npm install):

```sh
node server/server.mjs                       # serve at http://127.0.0.1:8787
node server/server.mjs --new 2026-05-18 "A Short Prayer"
```

The `--new` command scaffolds `meditations/<date>.js` and registers its date in
`manifest.js` for you. `server/meditations-admin.service` (systemd unit) and
`server/update-local.sh` (deploy helper) run it on a host.

