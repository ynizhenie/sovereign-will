// Factions and their colours

export const factionsConfig = {
  // ---- Factions: who the colony is, and who the enemy is (chosen in the Endless menu).
  // color: the faction's own (its units are drawn in it, unless another is picked). enemies: the enemy
  // kinds of GAME_CONFIG.enemies its waves are made of; summonEnemy: what its spawners call up.
  // ready: playable yet (the others show as coming soon).
  factions: {
    // units: the settler types it hires (settlerTypes); upgrades: which turns into which; startUnits:
    // the two it starts with; eats: needs food; hall / shelter / spawner: how its town hall, its tents and
    // its enemy tents look (and what they're called); startResources: on top of start.resources;
    // bonesPerSecond: bones its hall and each grave make by themselves; music: its colony's ambients and its
    // waves' battle tracks (GAME_CONFIG.music)
    humans: { id: 'humans', color: '#e9c46a', ready: true, units: ['normal', 'big'], upgrades: { normal: 'big' }, startUnits: 'normal', eats: true,
      enemies: ['raider_club', 'raider', 'brute', 'raider_archer', 'raider_medic'], summonEnemy: 'raider',
      music: { ambient: ['humans_meadow', 'humans_village', 'humans_dusk'], battle: ['humans_battle', 'humans_march', 'humans_charge'] } },
    // portalSpawns: its spawners are portals that open anywhere (but not within minPortalTiles of the
    // town hall) and its waves come out of them instead of the map's edge
    // bowUnits: what a kind becomes when it's given a bow (and back when the bow is taken)
    demons: { id: 'demons', color: '#e8572a', ready: true, units: ['imp', 'demon'], upgrades: { imp: 'demon' }, bowUnits: { imp: 'fire_imp' }, startUnits: 'imp', eats: true,
      hall: 'hellgate', spawner: 'portal', portalSpawns: true, minPortalTiles: 8,
      enemies: ['demon_imp', 'demon_imp_sword', 'demon_brute', 'demon_fire_imp'], summonEnemy: 'demon_imp',
      music: { ambient: ['demons_embers', 'demons_brimstone', 'demons_abyss'], battle: ['demons_inferno', 'demons_drums', 'demons_hellfire'] } },
    // rotPerSecond: rot its hall and graves make; foodInto: what food turns into when it's brought in
    undead: { id: 'undead', color: '#9b59b6', ready: true, units: ['zombie', 'big_zombie'], bowUnits: { zombie: 'skeleton' },
      upgrades: { zombie: 'big_zombie' }, startUnits: 'zombie', eats: false, hall: 'graveyard', shelter: 'grave', spawner: 'grave',
      startResources: { bones: 30, rot: 10 }, bonesPerSecond: { hall: 0.25, grave: 0.1 }, rotPerSecond: { hall: 0.05, grave: 0.1 },
      foodInto: { rawMeat: 'bones', rawFish: 'bones', default: 'rot' },
      enemies: ['undead_zombie', 'undead_zombie_sword', 'undead_big_zombie', 'undead_skeleton', 'undead_necromancer'], summonEnemy: 'undead_zombie',
      music: { ambient: ['undead_crypt', 'undead_fog', 'undead_graves'], battle: ['undead_march', 'undead_bones', 'undead_dirge'] } }
  },

  // the colours either side can pick from; the two sides never share one
  factionColors: ['#e9c46a', '#e8572a', '#9b59b6', '#3498db', '#2ecc71', '#ecf0f1']
};
