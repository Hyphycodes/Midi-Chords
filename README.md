# Harmonia — MIDI Chord Navigator

A visual, MIDI-controlled harmony navigator for music producers.

## Features

- **Navigator** — Interactive harmony graph. Click nodes or play single MIDI notes to trigger full voiced chords with automatic inversions and smooth voice leading.
- **Chord Shop** — Browse chords by feel. Solo each one. Heart your favorites.
- **Phrase Builder** — Drag and drop your favorite chords into phrase slots. Visualize the tension arc. Play back sequences.

## Getting Started

```bash
npm install
npm run dev
```

## Deploy

Deployed on Vercel. Connect your GitHub repo and Vercel handles the rest.

## MIDI Setup

- Connect a MIDI controller via USB before opening the app
- Allow MIDI access when the browser prompts
- Press any single note — the app maps it to the nearest chord in the current key
- The green MIDI indicator in the top bar shows connection status

## Stack

- React 18
- Vite
- Tone.js (audio, loaded via CDN)
- Web MIDI API (native browser)
