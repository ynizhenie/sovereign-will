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
    // bonesPerSecond: bones its hall makes by itself (graves are worked by a necromancer, #253); music: its colony's ambients and its
    // waves' battle tracks (GAME_CONFIG.music), and the night's own of each (#252)
    humans: { id: 'humans', color: '#e9c46a', ready: true, units: ['normal', 'big'], upgrades: { normal: 'big' }, startUnits: 'normal', eats: true,
      enemies: ['raider_club', 'raider', 'brute', 'raider_archer', 'raider_medic'], summonEnemy: 'raider',
      music: { ambient: ['humans_meadow', 'humans_village', 'humans_dusk', 'humans_harvest', 'humans_rain'], battle: ['humans_battle', 'humans_march', 'humans_charge', 'humans_shieldwall', 'humans_banner'],
        nightAmbient: ['humans_starlight', 'humans_hearth', 'humans_moonlit', 'humans_lullaby', 'humans_watch'], nightBattle: ['humans_nightraid', 'humans_torches', 'humans_darkfight', 'humans_lastlight', 'humans_alarm'] } },
    // portalSpawns: its spawners are portals that open anywhere (but not within minPortalTiles of the
    // town hall) and its waves come out of them instead of the map's edge
    // bowUnits: what a kind becomes when it's given a bow (and back when the bow is taken)
    demons: { id: 'demons', color: '#e8572a', ready: true, units: ['imp', 'demon'], upgrades: { imp: 'demon' }, startUnits: 'imp', eats: true,
      hall: 'hellgate', spawner: 'portal', portalSpawns: true, minPortalTiles: 8,
      enemies: ['demon_imp', 'demon_imp_sword', 'demon_brute', 'demon_imp_archer'], summonEnemy: 'demon_imp',
      music: { ambient: ['demons_embers', 'demons_brimstone', 'demons_abyss', 'demons_ashfall', 'demons_magma'], battle: ['demons_inferno', 'demons_drums', 'demons_hellfire', 'demons_ritual', 'demons_rampage'],
        nightAmbient: ['demons_blackfire', 'demons_nightmare', 'demons_smolder', 'demons_hollow', 'demons_coven'], nightBattle: ['demons_nightfire', 'demons_bloodmoon', 'demons_hunt', 'demons_pyre', 'demons_eclipse'] } },
    // rotPerSecond: rot its hall makes; startNecromancer: one more to start with, with the staff (#253); foodInto: what food turns into when it's brought in
    // buildBones (#279): every building costs bones too, `share` of the rest of its cost (at least `min`)
    undead: { id: 'undead', color: '#9b59b6', ready: true, units: ['zombie', 'big_zombie'],
      upgrades: { zombie: 'big_zombie' }, startUnits: 'zombie', eats: false, hall: 'graveyard', shelter: 'grave', spawner: 'grave',
      startResources: { bones: 30, rot: 10 }, bonesPerSecond: { hall: 0.25 }, rotPerSecond: { hall: 0.05 }, startNecromancer: true,
      foodInto: { rawMeat: 'bones', rawFish: 'bones', default: 'rot' }, buildBones: { share: 0.3, min: 2 },
      enemies: ['undead_zombie', 'undead_zombie_sword', 'undead_big_zombie', 'undead_zombie_archer', 'undead_necromancer'], summonEnemy: 'undead_zombie',
      music: { ambient: ['undead_crypt', 'undead_fog', 'undead_graves', 'undead_mist', 'undead_ossuary'], battle: ['undead_march', 'undead_bones', 'undead_dirge', 'undead_horde', 'undead_requiem'],
        nightAmbient: ['undead_midnight', 'undead_moonrise', 'undead_wraiths', 'undead_coffin', 'undead_cold'], nightBattle: ['undead_nighthorde', 'undead_gravedigger', 'undead_bonestorm', 'undead_blackmass', 'undead_deathknell'] } }
  },

  // the colours either side can pick from; the two sides never share one
  factionColors: ['#e9c46a', '#e8572a', '#9b59b6', '#3498db', '#2ecc71', '#ecf0f1']
};
