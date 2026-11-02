// Written by scripts/rebrand.sh. Edit there, or by hand.
export const BRAND = {
  name: "Fieldkit AI",
  feedbackEmail: '',
  repoUrl: 'https://github.com/bth0mp/fieldkit-ai',
};

// Folder name for files the app saves (e.g. Pictures/<folder>): BRAND.name minus path-unsafe characters.
export const BRAND_FOLDER = BRAND.name.replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'Images';
