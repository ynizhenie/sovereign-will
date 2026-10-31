import { LANGUAGES } from '../../../content/language/index.js';
import { loadSetting } from '../../../engine/platform/storage.js';

export function generateUnitName(faction, female, units = [], petKind = null) {
  const fallback = LANGUAGES.en.names.unitNames;
  const language = LANGUAGES[loadSetting('language', 'en')] || LANGUAGES.en;
  const pools = language.names.unitNames || fallback;
  const names = petKind ? (pools.pets?.[petKind] || fallback.pets[petKind]) : (pools[faction] || fallback.humans);
  const pool = female ? names.female : names.male;
  const used = new Set(units.map(unit => typeof unit.name === 'string' ? unit.name.trim().toLowerCase() : '').filter(Boolean));
  const available = pool.filter(name => !used.has(name.toLocaleLowerCase()));
  const base = (available.length ? available : pool)[Math.floor(Math.random() * (available.length ? available : pool).length)];
  if (!used.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (used.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix++;
  return `${base} ${suffix}`;
}

function isFactionName(name) {
  const normalized = name.toLowerCase();
  return Object.values(LANGUAGES).some(language =>
    Object.values(language.names.unitNames).some(pool =>
      pool.male?.some(candidate => candidate.toLowerCase() === normalized) ||
      pool.female?.some(candidate => candidate.toLowerCase() === normalized)
    )
  );
}

export function ensureUnitName(unit, faction, units = []) {
  const petKind = { dog: 'dog', beast: 'beast', ghost: 'ghost' }[unit.type] || null;
  const hasName = typeof unit.name === 'string' && !!unit.name.trim();
  if (unit.nameGenerated !== false && (!hasName || (petKind && unit.nameGenerated !== true && isFactionName(unit.name)))) {
    unit.name = generateUnitName(faction, !!unit.look?.female, units.filter(other => other !== unit), petKind);
    unit.nameGenerated = true;
  }
  return unit.name;
}
