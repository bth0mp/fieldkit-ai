/**
 * Lists a new checklist can start from. Each is a public list from a United States government page, copied item
 * for item (the pet kit keeps each item's name only); `source` names the page and how recent it was when read.
 * A list another organisation devised is not used, whoever reprints it.
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
  {
    id: 'ready-car-kit',
    name: 'Car emergency kit',
    label: 'Start from the Ready.gov car kit',
    // https://www.ready.gov/car, read 19 November 2026. The page gives these as extras to the kit above.
    source: 'Ready.gov, Emergency Kit for the Car, as updated 12 March 2026',
    items: [
      'Jumper cables',
      'Flares or reflective triangle',
      'Ice scraper',
      'Car cell phone charger',
      'Blanket',
      'Map',
      'Cat litter or sand (for better tire traction)',
    ],
  },
  {
    id: 'ready-pet-kit',
    name: 'Pet emergency kit',
    label: 'Start from the Ready.gov pet kit',
    // https://www.ready.gov/pets, read 19 November 2026. Each item's name as the page prints it; the page
    // follows each with a sentence of explanation, which is left out.
    source: 'Ready.gov, Build a Kit for Your Pet, as updated 20 March 2026',
    items: [
      'Food',
      'Water',
      'Medicine',
      'First aid kit',
      'Collar with ID tag and a harness or leash',
      'Traveling bag, crate or sturdy carrier, ideally one for each pet',
      'Grooming items',
      'Sanitation needs',
      'A picture of you and your pet together',
      'Familiar items',
    ],
  },
];
