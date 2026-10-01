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
        herbs: 'Herbs', worms: 'Worms', appleSaplings: 'Apple saplings'
      },
      resourceGroups: { raw: 'Raw food', plants: 'Plants', materials: 'Materials', supplies: 'Supplies', toolsHeld: 'Tools', weaponsHeld: 'Weapons' },
      tools: { axe: 'Axe', pickaxe: 'Pickaxe', iron_axe: 'Iron axe', iron_pickaxe: 'Iron pickaxe', rod: 'Fishing rod', medbag: 'Medic bag', hoe: 'Hoe' },
      weapons: { fist: 'Fist', club: 'Club', sword: 'Sword', spear: 'Spear', iron_sword: 'Iron sword', iron_spear: 'Iron spear', bow: 'Bow' },
      buildings: {
        wall_wood: 'Wooden wall', wall_stone: 'Stone wall', spikes: 'Spikes', door: 'Door', tent: 'Tent', campfire: 'Campfire',
        smelter: 'Smelter', watchtower: 'Watchtower', wheat: 'Wheat', sapling: 'Sapling', apple_sapling: 'Apple sapling'
      },
      enemies: { raider_club: 'Savage', raider: 'Raider', brute: 'Brute', raider_archer: 'Archer' },
      settlerTypes: { normal: 'Worker', big: 'Giant' },
      gear: { backpack: 'Backpack', shield: 'Shield', armor: 'Armour', wateringCan: 'Watering can' },
      recipes: { arrows: 'Arrows' },
      foodKinds: { provisions: 'Provisions', berries: 'Berries', apples: 'Apples', bread: 'Bread', cookedFish: 'Cooked fish', cookedMeat: 'Cooked meat' }
    },
    text: {
      'menu.play': 'PLAY', 'menu.waveInterval': 'Wave interval (s):', 'menu.custom': 'Custom', 'menu.mapSize': 'Map size:',
      'menu.mapSmall': 'Small', 'menu.mapMedium': 'Medium', 'menu.mapLarge': 'Large', 'menu.mapCustom': 'Custom',
      'menu.seed': 'World seed', 'menu.newSeed': 'New random seed', 'menu.language': 'Language:', 'menu.endless': 'Endless', 'menu.battles': 'Battles', 'menu.editor': 'Map editor', 'menu.settings': 'Settings', 'menu.exit': 'Exit', 'menu.soon': 'soon', 'menu.back': '← Back', 'menu.difficulty': 'Difficulty:', 'menu.easy': 'Easy', 'menu.normal': 'Normal', 'menu.hard': 'Hard', 'menu.fps': 'Frame rate:', 'menu.fpsDisplay': 'Screen', 'menu.fpsUnlimited': 'No limit',
      'pause.title': 'Paused', 'pause.continue': 'Continue', 'pause.exit': 'Exit to main menu',
      'pause.resumeHint': 'Continue [Space]', 'pause.pauseHint': 'Pause [Space]',
      'top.wave': 'Wave', 'top.seconds': 's', 'top.zoomIn': 'Zoom in', 'top.zoomOut': 'Zoom out', 'top.point': 'Point',
      'hud.selected': 'Selected:', 'hud.nobody': 'Nobody', 'hud.base': 'Base', 'hud.people': 'Settlers',
      'hud.ironArmor': 'Iron armour', 'hud.quiver': 'Quiver {n}/12',
      'tab.build': '🏗️ Building', 'tab.farming': '🌾 Farming', 'tab.tools': '🛠️ Tools', 'tab.weapons': '⚔️ Weapons',
      'btn.demolish': '🔨 Demolish', 'btn.repairAll': '🛠️ Repair all', 'btn.zoneWheat': '🟨 Wheat zone', 'btn.zoneSapling': '🟩 Sapling zone',
      'btn.zoneApple': '🟥 Apple zone', 'btn.zoneClear': '✖ Remove zone', 'btn.wateringCanOff': '❌ Take watering can apart',
      'btn.backpackOff': '❌ Take backpack apart', 'btn.disarmTool': '❌ Take tool away', 'btn.armorOff': '❌ Take armour apart',
      'btn.disarmWeapon': '❌ Take weapon away', 'btn.upgrade': '{icon} Upgrade ({cost})', 'btn.upgradeWorker': '{icon} Upgrade worker ({cost})',
      'repair.ordered': '🛠️ Repair: {name} ({cost} per step)', 'repair.cancelled': '❌ Repair cancelled',
      'repair.allOrdered': '🛠️ Repairs ordered: {count}', 'repair.nothing': '✅ Nothing is damaged',
      'repair.hall': '🛠️ Repairing ({cost})', 'repair.hallNeeded': '⚠️ Needs repair',
      'cost.missing': '{prefix} {cost} (missing {missing})', 'cost.notEnough': '❌ Not enough resources! Needs',
      'cost.needs': '❌ {name}: needs', 'build.costs': '💡 {name} costs {cost} (you are missing {missing})',
      'wave.warning': '⚠️ Enemy wave in {seconds} seconds!',
      'gear.nobody': '⚠️ Nobody to give it to: {name}', 'gear.fetching': '✅ {icon} {name}: a settler is fetching it from the base',
      'gear.noneHas': '⚠️ Nobody has: {name}', 'gear.returning': '✅ {icon} {name}: a settler is taking it back to the base',
      'build.zoneHere': '❌ This is a farm zone: remove the zone first', 'build.onHall': '❌ You can\'t build on the town hall',
      'build.occupied': '❌ This tile is taken', 'zone.badTile': '❌ Zones only go on grass with no trees, stones or buildings',
      'tool.unknown': '⚠️ Unknown tool: {id}', 'tool.nobody': '⚠️ No free settler to give the tool to!', 'tool.given': '✅ Tool given ({name})',
      'weapon.unknown': '⚠️ Unknown weapon: {id}', 'weapon.nobody': '⚠️ No free settler to give the weapon to!', 'weapon.made': '✅ Weapon made ({name})',
      'arrows.needArcher': '⚠️ You need an archer with a quiver first', 'arrows.made': '✅ {count} arrows made. They\'re kept in the town hall',
      'disarm.tool': '✅ Tool taken away', 'disarm.weapon': '✅ Weapon taken away', 'disarm.item': '✅ Item taken away',
      'disarm.noTool': '⚠️ No settler with a tool!', 'disarm.noWeapon': '⚠️ No settler with a weapon or armour!', 'disarm.noItem': '⚠️ No settler with anything to take away!',
      'pop.limit': '⚠️ Too many settlers! Build a tent (🏕️)', 'hire.done': '✅ Hired: {name}!',
      'upgrade.noone': '❌ No ordinary settler to upgrade!', 'upgrade.needs': '❌ Upgrade to {name}: needs', 'upgrade.done': '✅ Settler upgraded: {name}!',
      'menu.generator': 'Map generator', 'gen.standard': 'Standard', 'gen.save': 'Save', 'gen.presetName': 'Preset name', 'gen.group.water': 'Water', 'gen.group.desert': 'Desert', 'gen.group.forests': 'Forests', 'gen.group.resources': 'Resources', 'gen.group.ore': 'Ore', 'gen.group.rocks': 'Rock', 'gen.group.animals': 'Animals', 'gen.group.regrowth': 'Regrowth (s)', 'gen.group.other': 'Other', 'gen.lakes': 'Lakes', 'gen.lakeWidth': 'Lake width', 'gen.lakeHeight': 'Lake height', 'gen.lakeMinDistance': 'Gap between lakes', 'gen.deserts': 'Deserts', 'gen.desertRadiusX': 'Desert width', 'gen.desertRadiusY': 'Desert height', 'gen.desertCactus': 'Cacti per desert', 'gen.desertPebbles': 'Pebbles per desert', 'gen.forests': 'Forests', 'gen.forestTrees': 'Trees per forest', 'gen.forestRadius': 'Forest size', 'gen.forestUndergrowthShare': 'Undergrowth in forests (0-1)', 'gen.trees': 'Lone trees', 'gen.boulders': 'Boulders', 'gen.boulderPiles': 'Boulder piles', 'gen.boulderPileSize': 'Boulders per pile', 'gen.grass': 'Grass', 'gen.berryBushes': 'Berry bushes', 'gen.sticks': 'Sticks', 'gen.pebbles': 'Pebbles', 'gen.ironSpawners': 'Iron spawners', 'gen.coalSpawners': 'Coal spawners', 'gen.orePerSpawner': 'Ore per spawner', 'gen.oreSpawnerRadius': 'Ore spread (tiles)', 'gen.rockClusters': 'Rock masses', 'gen.rockClusterWidth': 'Rock mass width', 'gen.rockClusterHeight': 'Rock mass height', 'gen.boars': 'Boars', 'gen.respawnDelay': 'Resources grow back', 'gen.oreRespawnDelay': 'Ore grows back',
      'defeat.title': 'DEFEAT!', 'defeat.survived': 'You held out for {waves} waves', 'defeat.restart': 'Start again'
    }
  },

  uk: {
    label: 'Українська',
    names: {
      resources: {
        food: 'Їжа', rawMeat: 'Сире м\'ясо', rawFish: 'Сира риба', wheat: 'Зерно', wood: 'Дерево', stone: 'Камінь', coal: 'Вугілля',
        ironOre: 'Руда', iron: 'Залізо', leather: 'Шкіра', arrows: 'Стріли', wheatSeeds: 'Насіння', saplings: 'Саджанці',
        herbs: 'Трави', worms: 'Черв\'яки', appleSaplings: 'Саджанці яблуні'
      },
      resourceGroups: { raw: 'Сира їжа', plants: 'Рослини', materials: 'Матеріали', supplies: 'Припаси', toolsHeld: 'Інструменти', weaponsHeld: 'Зброя' },
      tools: { axe: 'Сокира', pickaxe: 'Кайло', iron_axe: 'Залізна сокира', iron_pickaxe: 'Залізне кайло', rod: 'Вудка', medbag: 'Сумка медика', hoe: 'Мотика' },
      weapons: { fist: 'Кулак', club: 'Кийок', sword: 'Меч', spear: 'Спис', iron_sword: 'Залізний меч', iron_spear: 'Залізний спис', bow: 'Лук' },
      buildings: {
        wall_wood: 'Дерев\'яна стіна', wall_stone: 'Кам\'яна стіна', spikes: 'Шипи', door: 'Двері', tent: 'Намет', campfire: 'Багаття',
        smelter: 'Плавильня', watchtower: 'Сторожова вежа', wheat: 'Пшениця', sapling: 'Саджанець', apple_sapling: 'Саджанець яблуні'
      },
      enemies: { raider_club: 'Дикун', raider: 'Розбійник', brute: 'Громило', raider_archer: 'Лучник' },
      settlerTypes: { normal: 'Робітник', big: 'Богатир' },
      gear: { backpack: 'Рюкзак', shield: 'Щит', armor: 'Броня', wateringCan: 'Лійка' },
      recipes: { arrows: 'Стріли' },
      foodKinds: { provisions: 'Припаси', berries: 'Ягоди', apples: 'Яблука', bread: 'Хліб', cookedFish: 'Смажена риба', cookedMeat: 'Смажене м\'ясо' }
    },
    text: {
      'menu.play': 'ГРАТИ', 'menu.waveInterval': 'Інтервал хвиль (с):', 'menu.custom': 'Свій', 'menu.mapSize': 'Розмір мапи:',
      'menu.mapSmall': 'Мала', 'menu.mapMedium': 'Середня', 'menu.mapLarge': 'Велика', 'menu.mapCustom': 'Своя',
      'menu.seed': 'Сід світу', 'menu.newSeed': 'Новий випадковий сід', 'menu.language': 'Мова:', 'menu.endless': 'Нескінченний', 'menu.battles': 'Битви', 'menu.editor': 'Редактор мап', 'menu.settings': 'Налаштування', 'menu.exit': 'Вийти', 'menu.soon': 'незабаром', 'menu.back': '← Назад', 'menu.difficulty': 'Складність:', 'menu.easy': 'Легка', 'menu.normal': 'Звичайна', 'menu.hard': 'Важка', 'menu.fps': 'Частота кадрів:', 'menu.fpsDisplay': 'Як екран', 'menu.fpsUnlimited': 'Без обмеження',
      'pause.title': 'Пауза', 'pause.continue': 'Продовжити', 'pause.exit': 'Вийти в головне меню',
      'pause.resumeHint': 'Продовжити [Space]', 'pause.pauseHint': 'Пауза [Space]',
      'top.wave': 'Хвиля', 'top.seconds': 'с', 'top.zoomIn': 'Наблизити', 'top.zoomOut': 'Віддалити', 'top.point': 'Вказати',
      'hud.selected': 'Обрано:', 'hud.nobody': 'Ніхто', 'hud.base': 'База', 'hud.people': 'Жителі',
      'hud.ironArmor': 'Залізна броня', 'hud.quiver': 'Сагайдак {n}/12',
      'tab.build': '🏗️ Будівництво', 'tab.farming': '🌾 Фермерство', 'tab.tools': '🛠️ Інструменти', 'tab.weapons': '⚔️ Зброя',
      'btn.demolish': '🔨 Знести', 'btn.repairAll': '🛠️ Полагодити все', 'btn.zoneWheat': '🟨 Зона пшениці', 'btn.zoneSapling': '🟩 Зона саджанців',
      'btn.zoneApple': '🟥 Зона яблунь', 'btn.zoneClear': '✖ Прибрати зону', 'btn.wateringCanOff': '❌ Розібрати лійку',
      'btn.backpackOff': '❌ Розібрати рюкзак', 'btn.disarmTool': '❌ Забрати інструмент', 'btn.armorOff': '❌ Розібрати броню',
      'btn.disarmWeapon': '❌ Забрати зброю', 'btn.upgrade': '{icon} Покращити ({cost})', 'btn.upgradeWorker': '{icon} Покращити робітника ({cost})',
      'repair.ordered': '🛠️ Ремонт: {name} ({cost} за крок)', 'repair.cancelled': '❌ Ремонт скасовано',
      'repair.allOrdered': '🛠️ Ремонт замовлено: {count}', 'repair.nothing': '✅ Усе ціле',
      'repair.hall': '🛠️ Ремонт ({cost})', 'repair.hallNeeded': '⚠️ Потрібен ремонт',
      'cost.missing': '{prefix} {cost} (бракує {missing})', 'cost.notEnough': '❌ Бракує ресурсів! Потрібно',
      'cost.needs': '❌ {name}: потрібно', 'build.costs': '💡 {name} коштує {cost} (вам бракує {missing})',
      'wave.warning': '⚠️ Хвиля ворогів за {seconds} секунд!',
      'gear.nobody': '⚠️ Нікому видати: {name}', 'gear.fetching': '✅ {icon} {name}: житель іде по нього на базу',
      'gear.noneHas': '⚠️ Ні в кого немає: {name}', 'gear.returning': '✅ {icon} {name}: житель несе його на базу',
      'build.zoneHere': '❌ Тут зона ферми: спершу приберіть зону', 'build.onHall': '❌ Не можна будувати на клітинці ратуші',
      'build.occupied': '❌ Ця клітинка зайнята', 'zone.badTile': '❌ Зона — лише на траві, де немає дерев, каміння та будівель',
      'tool.unknown': '⚠️ Невідомий інструмент: {id}', 'tool.nobody': '⚠️ Немає вільного жителя, щоб видати інструмент!', 'tool.given': '✅ Видано інструмент ({name})',
      'weapon.unknown': '⚠️ Невідома зброя: {id}', 'weapon.nobody': '⚠️ Немає вільного жителя, щоб видати зброю!', 'weapon.made': '✅ Зброю створено ({name})',
      'arrows.needArcher': '⚠️ Спершу потрібен лучник із сагайдаком', 'arrows.made': '✅ Створено {count} стріл. Вони зберігаються в ратуші',
      'disarm.tool': '✅ Інструмент забрано', 'disarm.weapon': '✅ Зброю забрано', 'disarm.item': '✅ Предмет забрано',
      'disarm.noTool': '⚠️ Немає жителя з інструментом!', 'disarm.noWeapon': '⚠️ Немає жителя зі зброєю чи бронею!', 'disarm.noItem': '⚠️ Немає жителя з предметом, який можна забрати!',
      'pop.limit': '⚠️ Перевищено ліміт жителів! Збудуйте намет (🏕️)', 'hire.done': '✅ Найнято: {name}!',
      'upgrade.noone': '❌ Немає звичайного жителя для покращення!', 'upgrade.needs': '❌ Покращення до {name}: потрібно', 'upgrade.done': '✅ Жителя покращено: {name}!',
      'menu.generator': 'Генератор мап', 'gen.standard': 'Стандарт', 'gen.save': 'Зберегти', 'gen.presetName': 'Назва пресету', 'gen.group.water': 'Вода', 'gen.group.desert': 'Пустеля', 'gen.group.forests': 'Ліси', 'gen.group.resources': 'Ресурси', 'gen.group.ore': 'Руда', 'gen.group.rocks': 'Скелі', 'gen.group.animals': 'Тварини', 'gen.group.regrowth': 'Відростання (с)', 'gen.group.other': 'Інше', 'gen.lakes': 'Озера', 'gen.lakeWidth': 'Ширина озера', 'gen.lakeHeight': 'Висота озера', 'gen.lakeMinDistance': 'Відстань між озерами', 'gen.deserts': 'Пустелі', 'gen.desertRadiusX': 'Ширина пустелі', 'gen.desertRadiusY': 'Висота пустелі', 'gen.desertCactus': 'Кактусів у пустелі', 'gen.desertPebbles': 'Камінців у пустелі', 'gen.forests': 'Ліси', 'gen.forestTrees': 'Дерев у лісі', 'gen.forestRadius': 'Розмір лісу', 'gen.forestUndergrowthShare': 'Підлісок у лісах (0-1)', 'gen.trees': 'Окремі дерева', 'gen.boulders': 'Валуни', 'gen.boulderPiles': 'Купи валунів', 'gen.boulderPileSize': 'Валунів у купі', 'gen.grass': 'Трава', 'gen.berryBushes': 'Ягідні кущі', 'gen.sticks': 'Палиці', 'gen.pebbles': 'Камінці', 'gen.ironSpawners': 'Спавнери заліза', 'gen.coalSpawners': 'Спавнери вугілля', 'gen.orePerSpawner': 'Руди на спавнер', 'gen.oreSpawnerRadius': 'Розкид руди (клітинки)', 'gen.rockClusters': 'Скельні масиви', 'gen.rockClusterWidth': 'Ширина масиву', 'gen.rockClusterHeight': 'Висота масиву', 'gen.boars': 'Кабани', 'gen.respawnDelay': 'Ресурси відростають', 'gen.oreRespawnDelay': 'Руда відростає',
      'defeat.title': 'ПОРАЗКА!', 'defeat.survived': 'Ви протрималися {waves} хвиль', 'defeat.restart': 'Почати знову'
    }
  },

  ru: {
    label: 'Русский',
    names: {
      resources: {
        food: 'Еда', rawMeat: 'Сырое мясо', rawFish: 'Сырая рыба', wheat: 'Зерно', wood: 'Дерево', stone: 'Камень', coal: 'Уголь',
        ironOre: 'Руда', iron: 'Железо', leather: 'Кожа', arrows: 'Стрелы', wheatSeeds: 'Семена', saplings: 'Саженцы',
        herbs: 'Травы', worms: 'Червяки', appleSaplings: 'Саженцы яблони'
      },
      resourceGroups: { raw: 'Сырая еда', plants: 'Растения', materials: 'Материалы', supplies: 'Снабжение', toolsHeld: 'Инструменты', weaponsHeld: 'Оружие' },
      tools: { axe: 'Топор', pickaxe: 'Кирка', iron_axe: 'Железный топор', iron_pickaxe: 'Железная кирка', rod: 'Удочка', medbag: 'Сумка медика', hoe: 'Мотыга' },
      weapons: { fist: 'Кулак', club: 'Дубина', sword: 'Меч', spear: 'Копье', iron_sword: 'Железный меч', iron_spear: 'Железное копье', bow: 'Лук' },
      buildings: {
        wall_wood: 'Деревянная стена', wall_stone: 'Каменная стена', spikes: 'Шипы', door: 'Дверь', tent: 'Палатка', campfire: 'Костёр',
        smelter: 'Плавильня', watchtower: 'Сторожевая башня', wheat: 'Пшеница', sapling: 'Саженец', apple_sapling: 'Саженец яблони'
      },
      enemies: { raider_club: 'Дикарь', raider: 'Разбойник', brute: 'Громила', raider_archer: 'Лучник' },
      settlerTypes: { normal: 'Рабочий', big: 'Богатырь' },
      gear: { backpack: 'Рюкзак', shield: 'Щит', armor: 'Броня', wateringCan: 'Лейка' },
      recipes: { arrows: 'Стрелы' },
      foodKinds: { provisions: 'Припасы', berries: 'Ягоды', apples: 'Яблоки', bread: 'Хлеб', cookedFish: 'Жареная рыба', cookedMeat: 'Жареное мясо' }
    },
    text: {
      'menu.play': 'ИГРАТЬ', 'menu.waveInterval': 'Интервал волн (сек):', 'menu.custom': 'Своё', 'menu.mapSize': 'Размер карты:',
      'menu.mapSmall': 'Малая', 'menu.mapMedium': 'Средняя', 'menu.mapLarge': 'Большая', 'menu.mapCustom': 'Своя',
      'menu.seed': 'Сид мира', 'menu.newSeed': 'Новый случайный сид', 'menu.language': 'Язык:', 'menu.endless': 'Бесконечный', 'menu.battles': 'Битвы', 'menu.editor': 'Редактор карт', 'menu.settings': 'Настройки', 'menu.exit': 'Выйти', 'menu.soon': 'скоро', 'menu.back': '← Назад', 'menu.difficulty': 'Сложность:', 'menu.easy': 'Лёгкая', 'menu.normal': 'Обычная', 'menu.hard': 'Сложная', 'menu.fps': 'Частота кадров:', 'menu.fpsDisplay': 'Как экран', 'menu.fpsUnlimited': 'Без ограничения',
      'pause.title': 'Пауза', 'pause.continue': 'Продолжить', 'pause.exit': 'Выйти в главное меню',
      'pause.resumeHint': 'Продолжить [Space]', 'pause.pauseHint': 'Пауза [Space]',
      'top.wave': 'Волна', 'top.seconds': 'с', 'top.zoomIn': 'Приблизить', 'top.zoomOut': 'Отдалить', 'top.point': 'Указать',
      'hud.selected': 'Выбран:', 'hud.nobody': 'Никто', 'hud.base': 'База', 'hud.people': 'Жители',
      'hud.ironArmor': 'Железная броня', 'hud.quiver': 'Колчан {n}/12',
      'tab.build': '🏗️ Строительство', 'tab.farming': '🌾 Фермерство', 'tab.tools': '🛠️ Инструменты', 'tab.weapons': '⚔️ Оружие',
      'btn.demolish': '🔨 Снести', 'btn.repairAll': '🛠️ Починить всё', 'btn.zoneWheat': '🟨 Зона пшеницы', 'btn.zoneSapling': '🟩 Зона саженцев',
      'btn.zoneApple': '🟥 Зона яблонь', 'btn.zoneClear': '✖ Убрать зону', 'btn.wateringCanOff': '❌ Разобрать лейку',
      'btn.backpackOff': '❌ Разобрать рюкзак', 'btn.disarmTool': '❌ Разобрать инструмент', 'btn.armorOff': '❌ Разобрать броню',
      'btn.disarmWeapon': '❌ Разобрать оружие', 'btn.upgrade': '{icon} Улучшить ({cost})', 'btn.upgradeWorker': '{icon} Улучшить рабочего ({cost})',
      'repair.ordered': '🛠️ Ремонт: {name} ({cost} за шаг)', 'repair.cancelled': '❌ Ремонт отменён',
      'repair.allOrdered': '🛠️ Ремонт заказан: {count}', 'repair.nothing': '✅ Всё цело',
      'repair.hall': '🛠️ Ремонт ({cost})', 'repair.hallNeeded': '⚠️ Нужен ремонт',
      'cost.missing': '{prefix} {cost} (не хватает {missing})', 'cost.notEnough': '❌ Не хватает ресурсов! Нужно',
      'cost.needs': '❌ {name}: нужно', 'build.costs': '💡 {name} стоит {cost} (у вас не хватает {missing})',
      'wave.warning': '⚠️ Волна врагов через {seconds} секунд!',
      'gear.nobody': '⚠️ Некому выдать: {name}', 'gear.fetching': '✅ {icon} {name}: житель идёт за ним на базу',
      'gear.noneHas': '⚠️ Ни у кого нет: {name}', 'gear.returning': '✅ {icon} {name}: житель несёт его на базу',
      'build.zoneHere': '❌ Здесь зона фермы: сначала уберите зону', 'build.onHall': '❌ Нельзя строить на клетке ратуши',
      'build.occupied': '❌ Эта клетка занята', 'zone.badTile': '❌ Зона — только на траве, где нет деревьев, камней и построек',
      'tool.unknown': '⚠️ Неизвестный инструмент: {id}', 'tool.nobody': '⚠️ Нет свободного поселенца для вручения инструмента!', 'tool.given': '✅ Выдан инструмент ({name})',
      'weapon.unknown': '⚠️ Неизвестное оружие: {id}', 'weapon.nobody': '⚠️ Нет свободного поселенца для выдачи оружия!', 'weapon.made': '✅ Создано оружие ({name})',
      'arrows.needArcher': '⚠️ Сначала нужен лучник с колчаном', 'arrows.made': '✅ Создано {count} стрел. Они хранятся в ратуше',
      'disarm.tool': '✅ Инструмент разобран', 'disarm.weapon': '✅ Оружие разобрано', 'disarm.item': '✅ Предмет разобран',
      'disarm.noTool': '⚠️ Нет поселенца с инструментом!', 'disarm.noWeapon': '⚠️ Нет поселенца с оружием или броней!', 'disarm.noItem': '⚠️ Нет поселенца с предметом для разбора!',
      'pop.limit': '⚠️ Превышен лимит поселенцев! Постройте палатку (🏕️)', 'hire.done': '✅ Нанят: {name}!',
      'upgrade.noone': '❌ Нет подходящего обычного поселенца для улучшения!', 'upgrade.needs': '❌ Улучшение в {name}: нужно', 'upgrade.done': '✅ Поселенец улучшен: {name}!',
      'menu.generator': 'Генератор карт', 'gen.standard': 'Стандарт', 'gen.save': 'Сохранить', 'gen.presetName': 'Название пресета', 'gen.group.water': 'Вода', 'gen.group.desert': 'Пустыня', 'gen.group.forests': 'Леса', 'gen.group.resources': 'Ресурсы', 'gen.group.ore': 'Руда', 'gen.group.rocks': 'Скалы', 'gen.group.animals': 'Животные', 'gen.group.regrowth': 'Отрастание (с)', 'gen.group.other': 'Прочее', 'gen.lakes': 'Озёра', 'gen.lakeWidth': 'Ширина озера', 'gen.lakeHeight': 'Высота озера', 'gen.lakeMinDistance': 'Расстояние между озёрами', 'gen.deserts': 'Пустыни', 'gen.desertRadiusX': 'Ширина пустыни', 'gen.desertRadiusY': 'Высота пустыни', 'gen.desertCactus': 'Кактусов в пустыне', 'gen.desertPebbles': 'Камешков в пустыне', 'gen.forests': 'Леса', 'gen.forestTrees': 'Деревьев в лесу', 'gen.forestRadius': 'Размер леса', 'gen.forestUndergrowthShare': 'Подлесок в лесах (0-1)', 'gen.trees': 'Одиночные деревья', 'gen.boulders': 'Валуны', 'gen.boulderPiles': 'Кучи валунов', 'gen.boulderPileSize': 'Валунов в куче', 'gen.grass': 'Трава', 'gen.berryBushes': 'Ягодные кусты', 'gen.sticks': 'Палки', 'gen.pebbles': 'Камешки', 'gen.ironSpawners': 'Спавнеры железа', 'gen.coalSpawners': 'Спавнеры угля', 'gen.orePerSpawner': 'Руды на спавнер', 'gen.oreSpawnerRadius': 'Разброс руды (клетки)', 'gen.rockClusters': 'Скальные массивы', 'gen.rockClusterWidth': 'Ширина массива', 'gen.rockClusterHeight': 'Высота массива', 'gen.boars': 'Кабаны', 'gen.respawnDelay': 'Ресурсы отрастают', 'gen.oreRespawnDelay': 'Руда отрастает',
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
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
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
