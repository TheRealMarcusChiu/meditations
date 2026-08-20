// Meditations index. Two jobs:
//   1. the header text (title / eyebrow / tagline) shown on the site
//   2. the list of meditation files to load — one date per line
//
// To publish a new meditation: create meditations/<date>.js (see any file here
// for the shape), then add its date to the MEDITATIONS list below.

window.MEDITATIONS_SITE = {
  title: 'Meditations',
  eyebrow: 'www.marcuschiu.com',
  tagline: 'Prayers and meditations, kept here as they come — a page each. Hover the underlined lines to see where a thought was borrowed, or where it began.',
};

window.MEDITATIONS = [
  '2025-01-15',
  '2025-07-09',
  '2026-08-02',
  '9999-12-31',
];
