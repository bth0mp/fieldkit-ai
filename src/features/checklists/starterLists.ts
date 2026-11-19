/**
 * Lists a new checklist can start from. Each is a public list from a United States government page: copied item
 * for item, or, where the page's items are too long for a line, cut down in the page's own words and marked
 * "Adapted from". `source` names the page and how recent it was when read. A list another organisation devised
 * is not used, whoever reprints it. An item longer than the checklist limit would be cut short when the list is
 * made; a test holds every item under it.
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
    // https://www.ready.gov/car, read 19 November 2026: "keep an emergency supply kit in your car with these
    // automobile extras". They are additions to a kit, with no water, food or first aid kit among them, so the
    // name, the button and the source line all say "extras".
    name: 'Car kit extras',
    label: 'Start from the Ready.gov car extras',
    source: 'Ready.gov, Emergency Kit for the Car, as updated 12 March 2026. Extras to keep in the car with an emergency kit.',
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
    // https://www.ready.gov/pets, read 19 November 2026. The page's ten items are a name and a sentence or two
    // of explanation, too long for a line here, and a bare name loses what to pack ("Sanitation needs"). So
    // each item is the name with the page's own words cut down, and its two long items (identification;
    // sanitation) are split into the things they name. Nothing is added. The source line says "Adapted from".
    source: 'Adapted from Ready.gov, Build a Kit for Your Pet, as updated 20 March 2026',
    items: [
      "Food (several days' supply in an airtight, waterproof container)",
      "Water (a water bowl and several days' supply of water)",
      'Medicine (an extra supply of the medicine your pet takes regularly, in a waterproof container)',
      'First aid kit (talk to your veterinarian about what is most appropriate for your pet)',
      'Collar with ID tag and a harness or leash',
      'Backup leash, collar and ID tag',
      "Copies of your pet's registration information and other relevant documents in a waterproof container",
      'The same documents available electronically',
      'Traveling bag, crate or sturdy carrier, ideally one for each pet',
      'Grooming items (pet shampoo, conditioner and other items)',
      'Pet litter and litter box (if appropriate)',
      'Newspapers, paper towels, plastic trash bags and household chlorine bleach',
      'A picture of you and your pet together',
      'Familiar items (favorite toys, treats or bedding)',
    ],
  },
];
