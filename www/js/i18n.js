// Localization (#41): every text the player sees, per language. English is the default; the player picks
// the language in the main menu and it's remembered on the device.
//
// - names: what things are called, by GAME_CONFIG category and id. applyLanguage() puts them into the
//   config as `label`, so code reads item.label as before.
// - text: messages, buttons and screens, by key. t(key, { name: ... }) fills in {name}.
// - index.html marks its texts with data-i18n="key" (text), data-i18n-title="key" (tooltip).
//
// A key missing in a language falls back to English, then to the key itself.
const LANGUAGES = {
  en: {
    label: 'English',
    names: {
      resources: {
        food: 'Food', rawMeat: 'Raw meat', rawFish: 'Raw fish', wheat: 'Grain', wood: 'Wood', stone: 'Stone', coal: 'Coal',
        ironOre: 'Ore', iron: 'Iron', leather: 'Leather', arrows: 'Arrows', wheatSeeds: 'Seeds', saplings: 'Saplings',
        herbs: 'Herbs', worms: 'Worms', bones: 'Bones', appleSaplings: 'Apple saplings'
      },
      resourceGroups: { raw: 'Raw food', plants: 'Plants', materials: 'Materials', supplies: 'Supplies', toolsHeld: 'Tools', weaponsHeld: 'Weapons' },
      tools: { axe: 'Axe', pickaxe: 'Pickaxe', iron_axe: 'Iron axe', iron_pickaxe: 'Iron pickaxe', rod: 'Fishing rod', medbag: 'Medic bag', hoe: 'Hoe' },
      weapons: { fist: 'Fist', club: 'Club', sword: 'Sword', spear: 'Spear', iron_sword: 'Iron sword', iron_spear: 'Iron spear', bow: 'Bow', hellfire: 'Hellfire' },
      buildings: {
        wall_wood: 'Wooden wall', wall_stone: 'Stone wall', spikes: 'Spikes', door: 'Door', tent: 'Tent', campfire: 'Campfire',
        smelter: 'Smelter', watchtower: 'Watchtower', warehouse: 'Warehouse', grave: 'Grave', sacrifice_circle: 'Sacrificial circle', portal: 'Portal', wheat: 'Wheat', sapling: 'Sapling', apple_sapling: 'Apple sapling'
      },
      enemies: { raider_club: 'Savage', raider: 'Raider', brute: 'Brute', raider_archer: 'Archer', undead_zombie: 'Zombie', undead_big_zombie: 'Big zombie', undead_skeleton: 'Skeleton', undead_necromancer: 'Necromancer', demon_imp: 'Imp', demon_brute: 'Demon', demon_fire_imp: 'Fire imp' },
      factions: { humans: 'Humans', demons: 'Demons', undead: 'Undead' },
      settlerTypes: { normal: 'Worker', big: 'Giant', zombie: 'Zombie', big_zombie: 'Big zombie', skeleton: 'Skeleton', necromancer: 'Necromancer', imp: 'Imp', demon: 'Demon', fire_imp: 'Fire imp' },
      gear: { backpack: 'Backpack', shield: 'Shield', armor: 'Armour', wateringCan: 'Watering can' },
      recipes: { arrows: 'Arrows' },
      foodKinds: { provisions: 'Provisions', berries: 'Berries', apples: 'Apples', bread: 'Bread', cookedFish: 'Cooked fish', cookedMeat: 'Cooked meat' }
    },
    text: {
      'menu.play': 'PLAY', 'menu.waveInterval': 'Wave interval (s):', 'menu.custom': 'Custom', 'menu.mapSize': 'Map size:',
      'menu.mapSmall': 'Small', 'menu.mapMedium': 'Medium', 'menu.mapLarge': 'Large', 'menu.mapCustom': 'Custom',
      'menu.seed': 'World seed', 'menu.newSeed': 'New random seed', 'menu.language': 'Language:', 'menu.endless': 'Endless', 'menu.battles': 'Battles', 'menu.editor': 'Map editor', 'menu.settings': 'Settings', 'menu.exit': 'Exit', 'menu.back': '← Back', 'menu.difficulty': 'Difficulty:', 'menu.easy': 'Easy', 'menu.normal': 'Normal', 'menu.hard': 'Hard', 'menu.fps': 'Frame rate:', 'menu.fpsDisplay': 'Screen', 'menu.showFps': 'Show FPS:', 'menu.on': 'On', 'menu.off': 'Off',
      'pause.title': 'Paused', 'pause.continue': 'Continue', 'pause.exit': 'Exit to main menu',
      'pause.resumeHint': 'Continue [Space]', 'pause.pauseHint': 'Pause [Space]',
      'top.wave': 'Wave', 'top.seconds': 's', 'top.zoomIn': 'Zoom in', 'top.zoomOut': 'Zoom out', 'top.point': 'Point',
      'hud.selected': 'Selected:', 'hud.nobody': 'Nobody', 'hud.base': 'Base', 'hud.people': 'Settlers',
      'hud.ironArmor': 'Iron armour', 'hud.quiver': 'Quiver {n}/12',
      'tab.build': '[[build]] Building', 'tab.farming': '[[wheat]] Farming', 'tab.tools': '[[tools]] Tools', 'tab.weapons': '[[swords]] Weapons',
      'btn.demolish': '[[hammer]] Demolish', 'btn.repairAll': '[[tools]] Repair all', 'btn.zoneWheat': '[[zone_wheat]] Wheat zone', 'btn.zoneSapling': '[[zone_sapling]] Sapling zone',
      'btn.zoneApple': '[[zone_apple]] Apple zone', 'btn.zoneClear': '[[close]] Remove zone', 'btn.wateringCanOff': '[[no]] Take watering can apart',
      'btn.backpackOff': '[[no]] Take backpack apart', 'btn.disarmTool': '[[no]] Take tool away', 'btn.armorOff': '[[no]] Take armour apart',
      'btn.disarmWeapon': '[[no]] Take weapon away', 'btn.upgrade': '[[{icon}]] Upgrade ({cost})', 'btn.upgradeWorker': '[[{icon}]] Upgrade worker ({cost})',
      'repair.ordered': '[[tools]] Repair: {name} ({cost} per step)', 'repair.cancelled': '[[no]] Repair cancelled',
      'repair.allOrdered': '[[tools]] Repairs ordered: {count}', 'repair.nothing': '[[ok]] Nothing is damaged',
      'repair.hall': '[[tools]] Repairing ({cost})', 'repair.hallNeeded': '[[warn]] Needs repair',
      'cost.missing': '{prefix} {cost} (missing {missing})', 'cost.notEnough': '[[no]] Not enough resources! Needs',
      'cost.needs': '[[no]] {name}: needs', 'build.costs': '[[hint]] {name} costs {cost} (you are missing {missing})',
      'wave.warning': '[[warn]] Enemy wave in {seconds} seconds!',
      'gear.nobody': '[[warn]] Nobody to give it to: {name}', 'gear.fetching': '[[ok]] [[{icon}]] {name}: a settler is fetching it from the base',
      'gear.noneHas': '[[warn]] Nobody has: {name}', 'gear.returning': '[[ok]] [[{icon}]] {name}: a settler is taking it back to the base',
      'build.zoneHere': '[[no]] This is a farm zone: remove the zone first', 'build.onHall': '[[no]] You can\'t build on the town hall',
      'possess.handsFull': '[[no]] Hands full: take it to the town hall first', 'possess.needs.axe': '[[no]] Needs an axe',
      'possess.needs.pickaxe': '[[no]] Needs a pickaxe', 'possess.notRipe': '[[no]] Not ripe yet', 'possess.needsRod': '[[no]] Needs a fishing rod',
      'possess.noBait': '[[no]] No bait in the stock (worms or seeds)', 'possess.noRepairCost': '[[no]] Not enough resources to repair',
      'build.occupied': '[[no]] This tile is taken', 'zone.badTile': '[[no]] Zones only go on grass with no trees, stones or buildings',
      'tool.unknown': '[[warn]] Unknown tool: {id}', 'tool.nobody': '[[warn]] No free settler to give the tool to!', 'tool.given': '[[ok]] Tool given ({name})',
      'weapon.unknown': '[[warn]] Unknown weapon: {id}', 'weapon.nobody': '[[warn]] No free settler to give the weapon to!', 'weapon.made': '[[ok]] Weapon made ({name})',
      'arrows.needArcher': '[[warn]] You need an archer with a quiver first', 'arrows.made': '[[ok]] {count} arrows made. They\'re kept in the town hall',
      'disarm.tool': '[[ok]] Tool taken away', 'disarm.weapon': '[[ok]] Weapon taken away', 'disarm.item': '[[ok]] Item taken away',
      'disarm.noTool': '[[warn]] No settler with a tool!', 'disarm.noWeapon': '[[warn]] No settler with a weapon or armour!', 'disarm.noItem': '[[warn]] No settler with anything to take away!',
      'pop.limit': '[[warn]] Too many settlers! Build a tent ([[tent]])', 'hire.done': '[[ok]] Hired: {name}!',
      'upgrade.noone': '[[no]] No ordinary settler to upgrade!', 'upgrade.needs': '[[no]] Upgrade to {name}: needs', 'upgrade.done': '[[ok]] Settler upgraded: {name}!',
      'battle.hint': 'Tap to place, tap again to remove: yours on the left, enemies on the right', 'battle.cat.own': 'Yours', 'battle.cat.enemy': 'Enemies', 'battle.cat.buildings': 'Buildings', 'battle.armor': '[[armor]] Armour', 'battle.shield': '[[shield]] Shield', 'battle.clearGreen': '[[broom]] Green', 'battle.clearRed': '[[broom]] Red', 'battle.only.green': '[[warn]] Your units go on the green side', 'battle.only.red': '[[warn]] Enemies go on the red side', 'battle.fight': '[[swords]] Fight!', 'battle.needBoth': '[[warn]] Place units on both sides first', 'battle.greenWins': 'Green wins!', 'battle.redWins': 'Red wins!', 'battle.drawWins': 'Draw!', 'preset.fist': 'Unarmed', 'preset.club': 'Club', 'preset.sword': 'Sword', 'preset.spear': 'Spear', 'preset.iron_sword': 'Iron sword', 'preset.iron_spear': 'Iron spear', 'preset.bow': 'Archer', 'preset.big_club': 'Giant, club', 'preset.big_spear': 'Giant, spear', 'preset.raider_club': 'Savage', 'preset.raider': 'Raider', 'preset.brute': 'Brute', 'preset.raider_archer': 'Enemy archer',
      'menu.generator': 'Map generator', 'gen.standard': 'Standard', 'gen.save': 'Save', 'gen.presetName': 'Preset name', 'gen.group.water': 'Water', 'gen.group.desert': 'Desert', 'gen.group.forests': 'Forests', 'gen.group.resources': 'Resources', 'gen.group.ore': 'Ore', 'gen.group.rocks': 'Rock', 'gen.group.animals': 'Animals', 'gen.group.regrowth': 'Regrowth (s)', 'gen.group.other': 'Other', 'gen.lakes': 'Lakes', 'gen.lakeWidth': 'Lake width', 'gen.lakeHeight': 'Lake height', 'gen.lakeMinDistance': 'Gap between lakes', 'gen.deserts': 'Deserts', 'gen.desertRadiusX': 'Desert width', 'gen.desertRadiusY': 'Desert height', 'gen.desertCactus': 'Cacti per desert', 'gen.desertPebbles': 'Pebbles per desert', 'gen.forests': 'Forests', 'gen.forestTrees': 'Trees per forest', 'gen.forestRadius': 'Forest size', 'gen.forestUndergrowthShare': 'Undergrowth in forests (0-1)', 'gen.trees': 'Lone trees', 'gen.boulders': 'Boulders', 'gen.boulderPiles': 'Boulder piles', 'gen.boulderPileSize': 'Boulders per pile', 'gen.grass': 'Grass', 'gen.berryBushes': 'Berry bushes', 'gen.sticks': 'Sticks', 'gen.pebbles': 'Pebbles', 'gen.ironSpawners': 'Iron spawners', 'gen.coalSpawners': 'Coal spawners', 'gen.orePerSpawner': 'Ore per spawner', 'gen.oreSpawnerRadius': 'Ore spread (tiles)', 'gen.rockClusters': 'Rock masses', 'gen.rockClusterWidth': 'Rock mass width', 'gen.rockClusterHeight': 'Rock mass height', 'gen.boars': 'Boars', 'gen.respawnDelay': 'Resources grow back', 'gen.oreRespawnDelay': 'Ore grows back',
      'sacrifice.pick': '[[warn]] Select a settler first, then tap the circle', 'sacrifice.going': '[[sacrifice_circle]] {name} goes to the circle', 'sacrifice.done': '[[ok]] The sacrifice healed everyone',
      'menu.factions': 'Factions:', 'menu.you': 'You', 'menu.enemy': 'Enemy', 'menu.soon': 'soon',
      'menu.map': 'Map:', 'menu.randomMap': 'Random', 'menu.customMap': 'Custom map',
      'editor.eraser': '[[eraser]] Eraser', 'editor.sizeButton': 'Size', 'editor.side.top': 'Top', 'editor.side.bottom': 'Bottom', 'editor.side.left': 'Left', 'editor.side.right': 'Right', 'editor.hallInTheWay': '[[warn]] The town hall is in the way: move it first', 'editor.cat.terrain': 'Terrain', 'editor.cat.nature': 'Nature', 'editor.cat.ore': 'Ore', 'editor.cat.buildings': 'Buildings', 'list.deleteQuestion': 'Delete «{name}»?', 'list.yes': 'Yes', 'list.no': 'No',
      'editor.newMap': 'New map:', 'editor.empty': 'Empty', 'editor.generated': 'From the generator', 'editor.savedMaps': 'Saved maps:',
      'editor.noMaps': 'No saved maps yet: make one in the Map editor', 'editor.hint': 'Pick something, tap the map to put it there. Drag to look around',
      'editor.brush': 'Brush:', 'editor.name': 'Map name', 'editor.save': '[[save]] Save', 'editor.needName': '[[warn]] Name the map first',
      'editor.saveFailed': '[[no]] Couldn\'t save the map on this device', 'editor.saved': '[[ok]] Map saved: {name}',
      'editor.tool.erase': 'Eraser', 'editor.tool.water': 'Water', 'editor.tool.rock': 'Rock', 'editor.tool.sand': 'Sand',
      'editor.tool.town_hall': 'Town hall', 'editor.tool.tree': 'Tree', 'editor.tool.apple_tree': 'Apple tree', 'editor.tool.cactus': 'Cactus',
      'editor.tool.boulder': 'Boulder', 'editor.tool.grass': 'Grass', 'editor.tool.berry_bush': 'Berry bush', 'editor.tool.stick': 'Stick',
      'editor.tool.pebble': 'Pebble', 'editor.tool.iron_ore': 'Iron ore', 'editor.tool.coal_ore': 'Coal', 'editor.tool.iron_spawner': 'Iron source',
      'editor.tool.coal_spawner': 'Coal source', 'editor.tool.boar': 'Boar',
      'defeat.title': 'DEFEAT!', 'defeat.survived': 'You held out for {waves} waves', 'defeat.restart': 'Start again'
    }
  },

  uk: {
    label: 'Українська',
    names: {
      resources: {
        food: 'Їжа', rawMeat: 'Сире м\'ясо', rawFish: 'Сира риба', wheat: 'Зерно', wood: 'Дерево', stone: 'Камінь', coal: 'Вугілля',
        ironOre: 'Руда', iron: 'Залізо', leather: 'Шкіра', arrows: 'Стріли', wheatSeeds: 'Насіння', saplings: 'Саджанці',
        herbs: 'Трави', worms: 'Черв\'яки', bones: 'Кістки', appleSaplings: 'Саджанці яблуні'
      },
      resourceGroups: { raw: 'Сира їжа', plants: 'Рослини', materials: 'Матеріали', supplies: 'Припаси', toolsHeld: 'Інструменти', weaponsHeld: 'Зброя' },
      tools: { axe: 'Сокира', pickaxe: 'Кайло', iron_axe: 'Залізна сокира', iron_pickaxe: 'Залізне кайло', rod: 'Вудка', medbag: 'Сумка медика', hoe: 'Мотика' },
      weapons: { fist: 'Кулак', club: 'Кийок', sword: 'Меч', spear: 'Спис', iron_sword: 'Залізний меч', iron_spear: 'Залізний спис', bow: 'Лук', hellfire: 'Пекельний вогонь' },
      buildings: {
        wall_wood: 'Дерев\'яна стіна', wall_stone: 'Кам\'яна стіна', spikes: 'Шипи', door: 'Двері', tent: 'Намет', campfire: 'Багаття',
        smelter: 'Плавильня', watchtower: 'Сторожова вежа', warehouse: 'Склад', grave: 'Могила', sacrifice_circle: 'Жертовне коло', portal: 'Портал', wheat: 'Пшениця', sapling: 'Саджанець', apple_sapling: 'Саджанець яблуні'
      },
      enemies: { raider_club: 'Дикун', raider: 'Розбійник', brute: 'Громило', raider_archer: 'Лучник', undead_zombie: 'Зомбі', undead_big_zombie: 'Великий зомбі', undead_skeleton: 'Скелет', undead_necromancer: 'Некромант', demon_imp: 'Чорт', demon_brute: 'Демон', demon_fire_imp: 'Вогняний чорт' },
      factions: { humans: 'Люди', demons: 'Демони', undead: 'Нежить' },
      settlerTypes: { normal: 'Робітник', big: 'Богатир', zombie: 'Зомбі', big_zombie: 'Великий зомбі', skeleton: 'Скелет', necromancer: 'Некромант', imp: 'Чорт', demon: 'Демон', fire_imp: 'Вогняний чорт' },
      gear: { backpack: 'Рюкзак', shield: 'Щит', armor: 'Броня', wateringCan: 'Лійка' },
      recipes: { arrows: 'Стріли' },
      foodKinds: { provisions: 'Припаси', berries: 'Ягоди', apples: 'Яблука', bread: 'Хліб', cookedFish: 'Смажена риба', cookedMeat: 'Смажене м\'ясо' }
    },
    text: {
      'menu.play': 'ГРАТИ', 'menu.waveInterval': 'Інтервал хвиль (с):', 'menu.custom': 'Свій', 'menu.mapSize': 'Розмір мапи:',
      'menu.mapSmall': 'Мала', 'menu.mapMedium': 'Середня', 'menu.mapLarge': 'Велика', 'menu.mapCustom': 'Своя',
      'menu.seed': 'Сід світу', 'menu.newSeed': 'Новий випадковий сід', 'menu.language': 'Мова:', 'menu.endless': 'Нескінченний', 'menu.battles': 'Битви', 'menu.editor': 'Редактор мап', 'menu.settings': 'Налаштування', 'menu.exit': 'Вийти', 'menu.back': '← Назад', 'menu.difficulty': 'Складність:', 'menu.easy': 'Легка', 'menu.normal': 'Звичайна', 'menu.hard': 'Важка', 'menu.fps': 'Частота кадрів:', 'menu.fpsDisplay': 'Як екран', 'menu.showFps': 'Показувати FPS:', 'menu.on': 'Увімк.', 'menu.off': 'Вимк.',
      'pause.title': 'Пауза', 'pause.continue': 'Продовжити', 'pause.exit': 'Вийти в головне меню',
      'pause.resumeHint': 'Продовжити [Space]', 'pause.pauseHint': 'Пауза [Space]',
      'top.wave': 'Хвиля', 'top.seconds': 'с', 'top.zoomIn': 'Наблизити', 'top.zoomOut': 'Віддалити', 'top.point': 'Вказати',
      'hud.selected': 'Обрано:', 'hud.nobody': 'Ніхто', 'hud.base': 'База', 'hud.people': 'Жителі',
      'hud.ironArmor': 'Залізна броня', 'hud.quiver': 'Сагайдак {n}/12',
      'tab.build': '[[build]] Будівництво', 'tab.farming': '[[wheat]] Фермерство', 'tab.tools': '[[tools]] Інструменти', 'tab.weapons': '[[swords]] Зброя',
      'btn.demolish': '[[hammer]] Знести', 'btn.repairAll': '[[tools]] Полагодити все', 'btn.zoneWheat': '[[zone_wheat]] Зона пшениці', 'btn.zoneSapling': '[[zone_sapling]] Зона саджанців',
      'btn.zoneApple': '[[zone_apple]] Зона яблунь', 'btn.zoneClear': '[[close]] Прибрати зону', 'btn.wateringCanOff': '[[no]] Розібрати лійку',
      'btn.backpackOff': '[[no]] Розібрати рюкзак', 'btn.disarmTool': '[[no]] Забрати інструмент', 'btn.armorOff': '[[no]] Розібрати броню',
      'btn.disarmWeapon': '[[no]] Забрати зброю', 'btn.upgrade': '[[{icon}]] Покращити ({cost})', 'btn.upgradeWorker': '[[{icon}]] Покращити робітника ({cost})',
      'repair.ordered': '[[tools]] Ремонт: {name} ({cost} за крок)', 'repair.cancelled': '[[no]] Ремонт скасовано',
      'repair.allOrdered': '[[tools]] Ремонт замовлено: {count}', 'repair.nothing': '[[ok]] Усе ціле',
      'repair.hall': '[[tools]] Ремонт ({cost})', 'repair.hallNeeded': '[[warn]] Потрібен ремонт',
      'cost.missing': '{prefix} {cost} (бракує {missing})', 'cost.notEnough': '[[no]] Бракує ресурсів! Потрібно',
      'cost.needs': '[[no]] {name}: потрібно', 'build.costs': '[[hint]] {name} коштує {cost} (вам бракує {missing})',
      'wave.warning': '[[warn]] Хвиля ворогів за {seconds} секунд!',
      'gear.nobody': '[[warn]] Нікому видати: {name}', 'gear.fetching': '[[ok]] [[{icon}]] {name}: житель іде по нього на базу',
      'gear.noneHas': '[[warn]] Ні в кого немає: {name}', 'gear.returning': '[[ok]] [[{icon}]] {name}: житель несе його на базу',
      'build.zoneHere': '[[no]] Тут зона ферми: спершу приберіть зону', 'build.onHall': '[[no]] Не можна будувати на клітинці ратуші',
      'possess.handsFull': '[[no]] Руки зайняті: спершу віднесіть до ратуші', 'possess.needs.axe': '[[no]] Потрібна сокира',
      'possess.needs.pickaxe': '[[no]] Потрібна кирка', 'possess.notRipe': '[[no]] Ще не дозріло', 'possess.needsRod': '[[no]] Потрібна вудка',
      'possess.noBait': '[[no]] На складі немає наживки (черв\'яків чи насіння)', 'possess.noRepairCost': '[[no]] Не вистачає ресурсів на ремонт',
      'build.occupied': '[[no]] Ця клітинка зайнята', 'zone.badTile': '[[no]] Зона — лише на траві, де немає дерев, каміння та будівель',
      'tool.unknown': '[[warn]] Невідомий інструмент: {id}', 'tool.nobody': '[[warn]] Немає вільного жителя, щоб видати інструмент!', 'tool.given': '[[ok]] Видано інструмент ({name})',
      'weapon.unknown': '[[warn]] Невідома зброя: {id}', 'weapon.nobody': '[[warn]] Немає вільного жителя, щоб видати зброю!', 'weapon.made': '[[ok]] Зброю створено ({name})',
      'arrows.needArcher': '[[warn]] Спершу потрібен лучник із сагайдаком', 'arrows.made': '[[ok]] Створено {count} стріл. Вони зберігаються в ратуші',
      'disarm.tool': '[[ok]] Інструмент забрано', 'disarm.weapon': '[[ok]] Зброю забрано', 'disarm.item': '[[ok]] Предмет забрано',
      'disarm.noTool': '[[warn]] Немає жителя з інструментом!', 'disarm.noWeapon': '[[warn]] Немає жителя зі зброєю чи бронею!', 'disarm.noItem': '[[warn]] Немає жителя з предметом, який можна забрати!',
      'pop.limit': '[[warn]] Перевищено ліміт жителів! Збудуйте намет ([[tent]])', 'hire.done': '[[ok]] Найнято: {name}!',
      'upgrade.noone': '[[no]] Немає звичайного жителя для покращення!', 'upgrade.needs': '[[no]] Покращення до {name}: потрібно', 'upgrade.done': '[[ok]] Жителя покращено: {name}!',
      'battle.hint': 'Тап — поставити, ще тап — прибрати: свої зліва, вороги справа', 'battle.cat.own': 'Свої', 'battle.cat.enemy': 'Вороги', 'battle.cat.buildings': 'Будівлі', 'battle.armor': '[[armor]] Броня', 'battle.shield': '[[shield]] Щит', 'battle.clearGreen': '[[broom]] Зелених', 'battle.clearRed': '[[broom]] Червоних', 'battle.only.green': '[[warn]] Своїх — лише на зелений бік', 'battle.only.red': '[[warn]] Ворогів — лише на червоний бік', 'battle.fight': '[[swords]] У бій!', 'battle.needBoth': '[[warn]] Спершу поставте юнітів з обох боків', 'battle.greenWins': 'Перемогли зелені!', 'battle.redWins': 'Перемогли червоні!', 'battle.drawWins': 'Нічия!', 'preset.fist': 'Без зброї', 'preset.club': 'Кийок', 'preset.sword': 'Меч', 'preset.spear': 'Спис', 'preset.iron_sword': 'Залізний меч', 'preset.iron_spear': 'Залізний спис', 'preset.bow': 'Лучник', 'preset.big_club': 'Богатир, кийок', 'preset.big_spear': 'Богатир, спис', 'preset.raider_club': 'Дикун', 'preset.raider': 'Розбійник', 'preset.brute': 'Громило', 'preset.raider_archer': 'Ворожий лучник',
      'menu.generator': 'Генератор мап', 'gen.standard': 'Стандарт', 'gen.save': 'Зберегти', 'gen.presetName': 'Назва пресету', 'gen.group.water': 'Вода', 'gen.group.desert': 'Пустеля', 'gen.group.forests': 'Ліси', 'gen.group.resources': 'Ресурси', 'gen.group.ore': 'Руда', 'gen.group.rocks': 'Скелі', 'gen.group.animals': 'Тварини', 'gen.group.regrowth': 'Відростання (с)', 'gen.group.other': 'Інше', 'gen.lakes': 'Озера', 'gen.lakeWidth': 'Ширина озера', 'gen.lakeHeight': 'Висота озера', 'gen.lakeMinDistance': 'Відстань між озерами', 'gen.deserts': 'Пустелі', 'gen.desertRadiusX': 'Ширина пустелі', 'gen.desertRadiusY': 'Висота пустелі', 'gen.desertCactus': 'Кактусів у пустелі', 'gen.desertPebbles': 'Камінців у пустелі', 'gen.forests': 'Ліси', 'gen.forestTrees': 'Дерев у лісі', 'gen.forestRadius': 'Розмір лісу', 'gen.forestUndergrowthShare': 'Підлісок у лісах (0-1)', 'gen.trees': 'Окремі дерева', 'gen.boulders': 'Валуни', 'gen.boulderPiles': 'Купи валунів', 'gen.boulderPileSize': 'Валунів у купі', 'gen.grass': 'Трава', 'gen.berryBushes': 'Ягідні кущі', 'gen.sticks': 'Палиці', 'gen.pebbles': 'Камінці', 'gen.ironSpawners': 'Спавнери заліза', 'gen.coalSpawners': 'Спавнери вугілля', 'gen.orePerSpawner': 'Руди на спавнер', 'gen.oreSpawnerRadius': 'Розкид руди (клітинки)', 'gen.rockClusters': 'Скельні масиви', 'gen.rockClusterWidth': 'Ширина масиву', 'gen.rockClusterHeight': 'Висота масиву', 'gen.boars': 'Кабани', 'gen.respawnDelay': 'Ресурси відростають', 'gen.oreRespawnDelay': 'Руда відростає',
      'sacrifice.pick': '[[warn]] Спершу оберіть жителя, потім тапніть коло', 'sacrifice.going': '[[sacrifice_circle]] {name} іде до кола', 'sacrifice.done': '[[ok]] Жертва вилікувала всіх',
      'menu.factions': 'Фракції:', 'menu.you': 'Ви', 'menu.enemy': 'Ворог', 'menu.soon': 'незабаром',
      'menu.map': 'Мапа:', 'menu.randomMap': 'Випадкова', 'menu.customMap': 'Своя мапа',
      'editor.eraser': '[[eraser]] Гумка', 'editor.sizeButton': 'Розмір', 'editor.side.top': 'Зверху', 'editor.side.bottom': 'Знизу', 'editor.side.left': 'Зліва', 'editor.side.right': 'Справа', 'editor.hallInTheWay': '[[warn]] Заважає ратуша: спершу пересуньте її', 'editor.cat.terrain': 'Місцевість', 'editor.cat.nature': 'Природа', 'editor.cat.ore': 'Руда', 'editor.cat.buildings': 'Будівлі', 'list.deleteQuestion': 'Видалити «{name}»?', 'list.yes': 'Так', 'list.no': 'Ні',
      'editor.newMap': 'Нова мапа:', 'editor.empty': 'Порожня', 'editor.generated': 'З генератора', 'editor.savedMaps': 'Збережені мапи:',
      'editor.noMaps': 'Збережених мап ще немає: створіть у Редакторі мап', 'editor.hint': 'Оберіть, що ставити, і тапайте по мапі. Тягніть, щоб роздивитися',
      'editor.brush': 'Пензель:', 'editor.name': 'Назва мапи', 'editor.save': '[[save]] Зберегти', 'editor.needName': '[[warn]] Спершу назвіть мапу',
      'editor.saveFailed': '[[no]] Не вдалося зберегти мапу на пристрої', 'editor.saved': '[[ok]] Мапу збережено: {name}',
      'editor.tool.erase': 'Гумка', 'editor.tool.water': 'Вода', 'editor.tool.rock': 'Скеля', 'editor.tool.sand': 'Пісок',
      'editor.tool.town_hall': 'Ратуша', 'editor.tool.tree': 'Дерево', 'editor.tool.apple_tree': 'Яблуня', 'editor.tool.cactus': 'Кактус',
      'editor.tool.boulder': 'Валун', 'editor.tool.grass': 'Трава', 'editor.tool.berry_bush': 'Ягідний кущ', 'editor.tool.stick': 'Палиця',
      'editor.tool.pebble': 'Камінець', 'editor.tool.iron_ore': 'Залізна руда', 'editor.tool.coal_ore': 'Вугілля', 'editor.tool.iron_spawner': 'Джерело заліза',
      'editor.tool.coal_spawner': 'Джерело вугілля', 'editor.tool.boar': 'Кабан',
      'defeat.title': 'ПОРАЗКА!', 'defeat.survived': 'Ви протрималися {waves} хвиль', 'defeat.restart': 'Почати знову'
    }
  },

  ru: {
    label: 'Русский',
    names: {
      resources: {
        food: 'Еда', rawMeat: 'Сырое мясо', rawFish: 'Сырая рыба', wheat: 'Зерно', wood: 'Дерево', stone: 'Камень', coal: 'Уголь',
        ironOre: 'Руда', iron: 'Железо', leather: 'Кожа', arrows: 'Стрелы', wheatSeeds: 'Семена', saplings: 'Саженцы',
        herbs: 'Травы', worms: 'Червяки', bones: 'Кости', appleSaplings: 'Саженцы яблони'
      },
      resourceGroups: { raw: 'Сырая еда', plants: 'Растения', materials: 'Материалы', supplies: 'Снабжение', toolsHeld: 'Инструменты', weaponsHeld: 'Оружие' },
      tools: { axe: 'Топор', pickaxe: 'Кирка', iron_axe: 'Железный топор', iron_pickaxe: 'Железная кирка', rod: 'Удочка', medbag: 'Сумка медика', hoe: 'Мотыга' },
      weapons: { fist: 'Кулак', club: 'Дубина', sword: 'Меч', spear: 'Копье', iron_sword: 'Железный меч', iron_spear: 'Железное копье', bow: 'Лук', hellfire: 'Адский огонь' },
      buildings: {
        wall_wood: 'Деревянная стена', wall_stone: 'Каменная стена', spikes: 'Шипы', door: 'Дверь', tent: 'Палатка', campfire: 'Костёр',
        smelter: 'Плавильня', watchtower: 'Сторожевая башня', warehouse: 'Склад', grave: 'Могила', sacrifice_circle: 'Жертвенный круг', portal: 'Портал', wheat: 'Пшеница', sapling: 'Саженец', apple_sapling: 'Саженец яблони'
      },
      enemies: { raider_club: 'Дикарь', raider: 'Разбойник', brute: 'Громила', raider_archer: 'Лучник', undead_zombie: 'Зомби', undead_big_zombie: 'Большой зомби', undead_skeleton: 'Скелет', undead_necromancer: 'Некромант', demon_imp: 'Чёрт', demon_brute: 'Демон', demon_fire_imp: 'Огненный чёрт' },
      factions: { humans: 'Люди', demons: 'Демоны', undead: 'Нежить' },
      settlerTypes: { normal: 'Рабочий', big: 'Богатырь', zombie: 'Зомби', big_zombie: 'Большой зомби', skeleton: 'Скелет', necromancer: 'Некромант', imp: 'Чёрт', demon: 'Демон', fire_imp: 'Огненный чёрт' },
      gear: { backpack: 'Рюкзак', shield: 'Щит', armor: 'Броня', wateringCan: 'Лейка' },
      recipes: { arrows: 'Стрелы' },
      foodKinds: { provisions: 'Припасы', berries: 'Ягоды', apples: 'Яблоки', bread: 'Хлеб', cookedFish: 'Жареная рыба', cookedMeat: 'Жареное мясо' }
    },
    text: {
      'menu.play': 'ИГРАТЬ', 'menu.waveInterval': 'Интервал волн (сек):', 'menu.custom': 'Своё', 'menu.mapSize': 'Размер карты:',
      'menu.mapSmall': 'Малая', 'menu.mapMedium': 'Средняя', 'menu.mapLarge': 'Большая', 'menu.mapCustom': 'Своя',
      'menu.seed': 'Сид мира', 'menu.newSeed': 'Новый случайный сид', 'menu.language': 'Язык:', 'menu.endless': 'Бесконечный', 'menu.battles': 'Битвы', 'menu.editor': 'Редактор карт', 'menu.settings': 'Настройки', 'menu.exit': 'Выйти', 'menu.back': '← Назад', 'menu.difficulty': 'Сложность:', 'menu.easy': 'Лёгкая', 'menu.normal': 'Обычная', 'menu.hard': 'Сложная', 'menu.fps': 'Частота кадров:', 'menu.fpsDisplay': 'Как экран', 'menu.showFps': 'Показывать FPS:', 'menu.on': 'Вкл.', 'menu.off': 'Выкл.',
      'pause.title': 'Пауза', 'pause.continue': 'Продолжить', 'pause.exit': 'Выйти в главное меню',
      'pause.resumeHint': 'Продолжить [Space]', 'pause.pauseHint': 'Пауза [Space]',
      'top.wave': 'Волна', 'top.seconds': 'с', 'top.zoomIn': 'Приблизить', 'top.zoomOut': 'Отдалить', 'top.point': 'Указать',
      'hud.selected': 'Выбран:', 'hud.nobody': 'Никто', 'hud.base': 'База', 'hud.people': 'Жители',
      'hud.ironArmor': 'Железная броня', 'hud.quiver': 'Колчан {n}/12',
      'tab.build': '[[build]] Строительство', 'tab.farming': '[[wheat]] Фермерство', 'tab.tools': '[[tools]] Инструменты', 'tab.weapons': '[[swords]] Оружие',
      'btn.demolish': '[[hammer]] Снести', 'btn.repairAll': '[[tools]] Починить всё', 'btn.zoneWheat': '[[zone_wheat]] Зона пшеницы', 'btn.zoneSapling': '[[zone_sapling]] Зона саженцев',
      'btn.zoneApple': '[[zone_apple]] Зона яблонь', 'btn.zoneClear': '[[close]] Убрать зону', 'btn.wateringCanOff': '[[no]] Разобрать лейку',
      'btn.backpackOff': '[[no]] Разобрать рюкзак', 'btn.disarmTool': '[[no]] Разобрать инструмент', 'btn.armorOff': '[[no]] Разобрать броню',
      'btn.disarmWeapon': '[[no]] Разобрать оружие', 'btn.upgrade': '[[{icon}]] Улучшить ({cost})', 'btn.upgradeWorker': '[[{icon}]] Улучшить рабочего ({cost})',
      'repair.ordered': '[[tools]] Ремонт: {name} ({cost} за шаг)', 'repair.cancelled': '[[no]] Ремонт отменён',
      'repair.allOrdered': '[[tools]] Ремонт заказан: {count}', 'repair.nothing': '[[ok]] Всё цело',
      'repair.hall': '[[tools]] Ремонт ({cost})', 'repair.hallNeeded': '[[warn]] Нужен ремонт',
      'cost.missing': '{prefix} {cost} (не хватает {missing})', 'cost.notEnough': '[[no]] Не хватает ресурсов! Нужно',
      'cost.needs': '[[no]] {name}: нужно', 'build.costs': '[[hint]] {name} стоит {cost} (у вас не хватает {missing})',
      'wave.warning': '[[warn]] Волна врагов через {seconds} секунд!',
      'gear.nobody': '[[warn]] Некому выдать: {name}', 'gear.fetching': '[[ok]] [[{icon}]] {name}: житель идёт за ним на базу',
      'gear.noneHas': '[[warn]] Ни у кого нет: {name}', 'gear.returning': '[[ok]] [[{icon}]] {name}: житель несёт его на базу',
      'build.zoneHere': '[[no]] Здесь зона фермы: сначала уберите зону', 'build.onHall': '[[no]] Нельзя строить на клетке ратуши',
      'possess.handsFull': '[[no]] Руки заняты: сначала отнесите в ратушу', 'possess.needs.axe': '[[no]] Нужен топор',
      'possess.needs.pickaxe': '[[no]] Нужна кирка', 'possess.notRipe': '[[no]] Ещё не созрело', 'possess.needsRod': '[[no]] Нужна удочка',
      'possess.noBait': '[[no]] На складе нет наживки (червей или семян)', 'possess.noRepairCost': '[[no]] Не хватает ресурсов на ремонт',
      'build.occupied': '[[no]] Эта клетка занята', 'zone.badTile': '[[no]] Зона — только на траве, где нет деревьев, камней и построек',
      'tool.unknown': '[[warn]] Неизвестный инструмент: {id}', 'tool.nobody': '[[warn]] Нет свободного поселенца для вручения инструмента!', 'tool.given': '[[ok]] Выдан инструмент ({name})',
      'weapon.unknown': '[[warn]] Неизвестное оружие: {id}', 'weapon.nobody': '[[warn]] Нет свободного поселенца для выдачи оружия!', 'weapon.made': '[[ok]] Создано оружие ({name})',
      'arrows.needArcher': '[[warn]] Сначала нужен лучник с колчаном', 'arrows.made': '[[ok]] Создано {count} стрел. Они хранятся в ратуше',
      'disarm.tool': '[[ok]] Инструмент разобран', 'disarm.weapon': '[[ok]] Оружие разобрано', 'disarm.item': '[[ok]] Предмет разобран',
      'disarm.noTool': '[[warn]] Нет поселенца с инструментом!', 'disarm.noWeapon': '[[warn]] Нет поселенца с оружием или броней!', 'disarm.noItem': '[[warn]] Нет поселенца с предметом для разбора!',
      'pop.limit': '[[warn]] Превышен лимит поселенцев! Постройте палатку ([[tent]])', 'hire.done': '[[ok]] Нанят: {name}!',
      'upgrade.noone': '[[no]] Нет подходящего обычного поселенца для улучшения!', 'upgrade.needs': '[[no]] Улучшение в {name}: нужно', 'upgrade.done': '[[ok]] Поселенец улучшен: {name}!',
      'battle.hint': 'Тап — поставить, ещё тап — убрать: свои слева, враги справа', 'battle.cat.own': 'Свои', 'battle.cat.enemy': 'Враги', 'battle.cat.buildings': 'Постройки', 'battle.armor': '[[armor]] Броня', 'battle.shield': '[[shield]] Щит', 'battle.clearGreen': '[[broom]] Зелёных', 'battle.clearRed': '[[broom]] Красных', 'battle.only.green': '[[warn]] Своих — только на зелёную сторону', 'battle.only.red': '[[warn]] Врагов — только на красную сторону', 'battle.fight': '[[swords]] В бой!', 'battle.needBoth': '[[warn]] Сначала поставьте юнитов с обеих сторон', 'battle.greenWins': 'Победили зелёные!', 'battle.redWins': 'Победили красные!', 'battle.drawWins': 'Ничья!', 'preset.fist': 'Без оружия', 'preset.club': 'Дубина', 'preset.sword': 'Меч', 'preset.spear': 'Копьё', 'preset.iron_sword': 'Железный меч', 'preset.iron_spear': 'Железное копьё', 'preset.bow': 'Лучник', 'preset.big_club': 'Богатырь, дубина', 'preset.big_spear': 'Богатырь, копьё', 'preset.raider_club': 'Дикарь', 'preset.raider': 'Разбойник', 'preset.brute': 'Громила', 'preset.raider_archer': 'Вражеский лучник',
      'menu.generator': 'Генератор карт', 'gen.standard': 'Стандарт', 'gen.save': 'Сохранить', 'gen.presetName': 'Название пресета', 'gen.group.water': 'Вода', 'gen.group.desert': 'Пустыня', 'gen.group.forests': 'Леса', 'gen.group.resources': 'Ресурсы', 'gen.group.ore': 'Руда', 'gen.group.rocks': 'Скалы', 'gen.group.animals': 'Животные', 'gen.group.regrowth': 'Отрастание (с)', 'gen.group.other': 'Прочее', 'gen.lakes': 'Озёра', 'gen.lakeWidth': 'Ширина озера', 'gen.lakeHeight': 'Высота озера', 'gen.lakeMinDistance': 'Расстояние между озёрами', 'gen.deserts': 'Пустыни', 'gen.desertRadiusX': 'Ширина пустыни', 'gen.desertRadiusY': 'Высота пустыни', 'gen.desertCactus': 'Кактусов в пустыне', 'gen.desertPebbles': 'Камешков в пустыне', 'gen.forests': 'Леса', 'gen.forestTrees': 'Деревьев в лесу', 'gen.forestRadius': 'Размер леса', 'gen.forestUndergrowthShare': 'Подлесок в лесах (0-1)', 'gen.trees': 'Одиночные деревья', 'gen.boulders': 'Валуны', 'gen.boulderPiles': 'Кучи валунов', 'gen.boulderPileSize': 'Валунов в куче', 'gen.grass': 'Трава', 'gen.berryBushes': 'Ягодные кусты', 'gen.sticks': 'Палки', 'gen.pebbles': 'Камешки', 'gen.ironSpawners': 'Спавнеры железа', 'gen.coalSpawners': 'Спавнеры угля', 'gen.orePerSpawner': 'Руды на спавнер', 'gen.oreSpawnerRadius': 'Разброс руды (клетки)', 'gen.rockClusters': 'Скальные массивы', 'gen.rockClusterWidth': 'Ширина массива', 'gen.rockClusterHeight': 'Высота массива', 'gen.boars': 'Кабаны', 'gen.respawnDelay': 'Ресурсы отрастают', 'gen.oreRespawnDelay': 'Руда отрастает',
      'sacrifice.pick': '[[warn]] Сначала выберите жителя, потом тапните круг', 'sacrifice.going': '[[sacrifice_circle]] {name} идёт к кругу', 'sacrifice.done': '[[ok]] Жертва исцелила всех',
      'menu.factions': 'Фракции:', 'menu.you': 'Вы', 'menu.enemy': 'Враг', 'menu.soon': 'скоро',
      'menu.map': 'Карта:', 'menu.randomMap': 'Случайная', 'menu.customMap': 'Своя карта',
      'editor.eraser': '[[eraser]] Ластик', 'editor.sizeButton': 'Размер', 'editor.side.top': 'Сверху', 'editor.side.bottom': 'Снизу', 'editor.side.left': 'Слева', 'editor.side.right': 'Справа', 'editor.hallInTheWay': '[[warn]] Мешает ратуша: сначала передвиньте её', 'editor.cat.terrain': 'Местность', 'editor.cat.nature': 'Природа', 'editor.cat.ore': 'Руда', 'editor.cat.buildings': 'Постройки', 'list.deleteQuestion': 'Удалить «{name}»?', 'list.yes': 'Да', 'list.no': 'Нет',
      'editor.newMap': 'Новая карта:', 'editor.empty': 'Пустая', 'editor.generated': 'Из генератора', 'editor.savedMaps': 'Сохранённые карты:',
      'editor.noMaps': 'Сохранённых карт пока нет: создайте в Редакторе карт', 'editor.hint': 'Выберите, что ставить, и тапайте по карте. Тяните, чтобы осмотреться',
      'editor.brush': 'Кисть:', 'editor.name': 'Название карты', 'editor.save': '[[save]] Сохранить', 'editor.needName': '[[warn]] Сначала назовите карту',
      'editor.saveFailed': '[[no]] Не удалось сохранить карту на устройстве', 'editor.saved': '[[ok]] Карта сохранена: {name}',
      'editor.tool.erase': 'Ластик', 'editor.tool.water': 'Вода', 'editor.tool.rock': 'Скала', 'editor.tool.sand': 'Песок',
      'editor.tool.town_hall': 'Ратуша', 'editor.tool.tree': 'Дерево', 'editor.tool.apple_tree': 'Яблоня', 'editor.tool.cactus': 'Кактус',
      'editor.tool.boulder': 'Валун', 'editor.tool.grass': 'Трава', 'editor.tool.berry_bush': 'Ягодный куст', 'editor.tool.stick': 'Палка',
      'editor.tool.pebble': 'Камешек', 'editor.tool.iron_ore': 'Железная руда', 'editor.tool.coal_ore': 'Уголь', 'editor.tool.iron_spawner': 'Источник железа',
      'editor.tool.coal_spawner': 'Источник угля', 'editor.tool.boar': 'Кабан',
      'defeat.title': 'ПОРАЖЕНИЕ!', 'defeat.survived': 'Вы продержались {waves} волн', 'defeat.restart': 'Начать заново'
    }
  }
};

const DEFAULT_LANGUAGE = 'en';
const LANGUAGE_STORAGE_KEY = 'sovereign-will-language';

// the saved choice, if the device can remember one
function loadLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && LANGUAGES[saved]) return saved;
  } catch (e) { /* no storage: default */ }
  return DEFAULT_LANGUAGE;
}

let currentLanguage = loadLanguage();

// The text for `key` in the current language, with {placeholders} filled from `params`
function t(key, params = {}) {
  const text = LANGUAGES[currentLanguage].text[key] ?? LANGUAGES[DEFAULT_LANGUAGE].text[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? params[name] : match));
}

// Names from the current language into the config (item.label), falling back to English
function applyNames() {
  const names = LANGUAGES[currentLanguage].names, fallback = LANGUAGES[DEFAULT_LANGUAGE].names;
  for (const [category, byId] of Object.entries(fallback)) {
    const items = GAME_CONFIG[category];
    if (!items) continue;
    for (const item of Array.isArray(items) ? items : Object.values(items)) {
      const name = (names[category] || {})[item.id] ?? byId[item.id];
      if (name) item.label = name;
    }
  }
}

// Texts marked in index.html (data-i18n / data-i18n-title) in the current language
function applyPageTexts() {
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll('[data-i18n]').forEach(el => setRichText(el, t(el.dataset.i18n)));
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = plainText(t(el.dataset.i18nPlaceholder)); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = plainText(t(el.dataset.i18nTitle));
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.title);
  });
}

// Switch language: remembered on the device, and everything on screen is redrawn in it
function setLanguage(language) {
  if (!LANGUAGES[language]) return;
  currentLanguage = language;
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch (e) { /* not remembered */ }
  applyNames();
  applyPageTexts();
  if (typeof rebuildConfigHud === 'function') rebuildConfigHud();
}

applyNames();
