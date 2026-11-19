/**
 * Lists a new checklist can start from. Each is a public list from a United States government page, copied item
 * for item; `source` names the page and how recent it was when read. A list another organisation devised is
 * not used, whoever reprints it.
 */
interface StarterList {
  id: string;
  /** The name the new checklist gets. */
  name: string;
  /** The button that makes it. */
  label: string;
  source: string;
  items: string[];
}

export const STARTER_LISTS: StarterList[] = [
  {
    id: 'ready-basic-kit',
    name: 'Emergency kit',
    label: 'Start from the Ready.gov emergency kit',
    // https://www.ready.gov/kit, read 18 November 2026.
    source: 'Ready.gov, Basic Disaster Supplies Kit, as updated 1 July 2026',
    items: [
      'Water (one gallon per person per day for several days, for drinking and sanitation)',
      'Food (at least a several-day supply of non-perishable food)',
      'Battery-powered or hand crank radio and a NOAA Weather Radio with tone alert',
      'Flashlight',
      'First aid kit',
      'Extra batteries',
      'Whistle (to signal for help)',
      'Dust mask (to help filter contaminated air)',
      'Plastic sheeting, scissors and duct tape (to shelter in place)',
      'Moist towelettes, garbage bags and plastic ties (for personal sanitation)',
      'Wrench or pliers (to turn off utilities)',
      'Manual can opener (for food)',
      'Local maps',
      'Cell phone with chargers and a backup battery',
    ],
  },
];
