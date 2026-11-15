import { test } from 'node:test';
import { expect } from './expect.mjs';
import './game.mjs';
import { LANGUAGES } from '../../www/js/content/language/index.js';

const factions = ['humans', 'demons', 'undead'];
const pets = ['dog', 'beast', 'ghost'];
const poolSize = pool => pool.male.length + pool.female.length;

test('every faction and pet has ten more names in every language', () => {
  for (const language of Object.values(LANGUAGES)) {
    for (const faction of factions) expect(poolSize(language.names.unitNames[faction])).toBe(34);
    for (const pet of pets) expect(poolSize(language.names.unitNames.pets[pet])).toBe(26);
    const total = factions.reduce((sum, faction) => sum + poolSize(language.names.unitNames[faction]), 0) +
      pets.reduce((sum, pet) => sum + poolSize(language.names.unitNames.pets[pet]), 0);
    expect(total).toBe(180);
  }
});

test('requested names are available in Russian and their localized equivalents', () => {
  expect(LANGUAGES.ru.names.unitNames.humans.male).toContain('Артур');
  expect(LANGUAGES.ru.names.unitNames.humans.male).toContain('Денис');
  expect(LANGUAGES.ru.names.unitNames.demons.male).toContain('Клауд');
  expect(LANGUAGES.en.names.unitNames.humans.male).toContain('Arthur');
  expect(LANGUAGES.en.names.unitNames.humans.male).toContain('Denis');
  expect(LANGUAGES.en.names.unitNames.demons.male).toContain('Claude');
});

test('a hired unit gets an unused name before a name is reused', () => {
  const pool = LANGUAGES.ru.names.unitNames.humans.male;
  const used = pool.slice(0, -1).map(name => ({ name }));
  expect(globalThis.generateUnitName('humans', false, used)).toBe(pool.at(-1));
});
