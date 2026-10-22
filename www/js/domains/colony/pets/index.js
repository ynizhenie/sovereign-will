// The door of domains/colony/pets/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { devour, feedPet, haunt, isPetHungry, tickPet } from './pets.behaviours.js';
export { drawPet } from './pets.draw.js';
