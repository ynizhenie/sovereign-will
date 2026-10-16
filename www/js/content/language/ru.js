// Russian

export const ruLanguage = {
  ru: {
    label: 'Русский',
    names: {
      resources: {
        food: 'Еда', rawMeat: 'Сырое мясо', rawFish: 'Сырая рыба', wheat: 'Зерно', wood: 'Дерево', stone: 'Камень', coal: 'Уголь',
        ironOre: 'Руда', iron: 'Железо', leather: 'Кожа', arrows: 'Стрелы', wheatSeeds: 'Семена', saplings: 'Саженцы',
        herbs: 'Травы', worms: 'Червяки', bones: 'Кости', rot: 'Гниль', appleSaplings: 'Саженцы яблони'
      },
      resourceGroups: { raw: 'Сырая еда', plants: 'Растения', materials: 'Материалы', supplies: 'Снабжение', toolsHeld: 'Инструменты', weaponsHeld: 'Оружие' },
      tools: { axe: 'Топор', pickaxe: 'Кирка', iron_axe: 'Железный топор', iron_pickaxe: 'Железная кирка', rod: 'Удочка', medbag: 'Сумка медика', hoe: 'Мотыга', necro_staff: 'Посох некроманта' },
      weapons: { fist: 'Кулак', club: 'Дубина', sword: 'Меч', spear: 'Копье', iron_sword: 'Железный меч', iron_spear: 'Железное копье', bow: 'Лук' },
      buildings: {
        smithy: 'Кузница', dummy: 'Чучело', wall_wood: 'Деревянная стена', wall_stone: 'Каменная стена', spikes: 'Шипы', door: 'Дверь', tent: 'Палатка', campfire: 'Костёр',
        smelter: 'Плавильня', watchtower: 'Сторожевая башня', warehouse: 'Склад', grave: 'Могила', sacrifice_circle: 'Жертвенный круг', portal: 'Портал', wheat: 'Пшеница', sapling: 'Саженец', apple_sapling: 'Саженец яблони'
      },
      enemies: { raider_medic: 'Лекарь', undead_zombie_sword: 'Зомби с мечом', demon_imp_sword: 'Чёрт с мечом', raider_club: 'Дикарь', raider: 'Разбойник', brute: 'Громила', raider_archer: 'Лучник', undead_zombie: 'Зомби', undead_big_zombie: 'Большой зомби', undead_skeleton: 'Скелет', undead_necromancer: 'Некромант', demon_imp: 'Чёрт', demon_brute: 'Демон', demon_fire_imp: 'Огненный чёрт' },
      factions: { humans: 'Люди', demons: 'Демоны', undead: 'Нежить' },
      settlerTypes: { normal: 'Рабочий', big: 'Богатырь', zombie: 'Зомби', big_zombie: 'Большой зомби', skeleton: 'Скелет', necromancer: 'Некромант', imp: 'Чёрт', demon: 'Демон', fire_imp: 'Огненный чёрт' },
      gear: { backpack: 'Рюкзак', shield: 'Щит', armor: 'Броня', wateringCan: 'Лейка' },
      recipes: { arrows: 'Стрелы' },
      foodKinds: { berries: 'Ягоды', apples: 'Яблоки', bread: 'Хлеб', cookedFish: 'Жареная рыба', cookedMeat: 'Жареное мясо' }
    },
    // what each thing is (#213): a line about it, and the labels of its numbers (ui/item-info.js)
    descriptions: {
      settlerTypes: { normal: 'Рабочий: берёт инструмент или оружие, что ему дадут.', big: 'Гигант: крепче и сильнее, носит два груза, занимает два места.', zombie: 'Зомби: медленный и дешёвый, нанимается за кости и гниль.', big_zombie: 'Большой зомби: крепкий и медленный, бьёт сильно, занимает два места.', skeleton: 'Скелет: зомби с луком.', imp: 'Чёрт: быстрый, лечится, поедая трупы.', demon: 'Демон: большой и крепкий, лечится, поедая трупы.', fire_imp: 'Огненный чёрт: его стрелы поджигают.' },
      tools: { axe: 'Рубит деревья.', iron_axe: 'Рубит деревья почти вдвое быстрее.', pickaxe: 'Добывает камень и руду.', iron_pickaxe: 'Добывает камень и руду в полтора раза быстрее.', rod: 'Ловит рыбу в отмеченных местах; наживка — семена, черви с трупов.', medbag: 'Медик: в волну лечит раненых травами, между волнами собирает траву.', hoe: 'Фермер: сажает зоны, с лейкой поливает, с рюкзаком удобряет.', necro_staff: 'Некромант: лечит своих, поднимает трупы, портит отмеченную землю.' },
      weapons: { fist: 'Без оружия.', club: 'Дешёвая дубина.', sword: 'Быстрые удары вблизи.', spear: 'Бьёт дальше и сильнее, но реже.', iron_sword: 'Железный меч: сильнее обычного.', iron_spear: 'Железное копьё: сильнее обычного.', bow: 'Стреляет издалека; нужны стрелы.' },
      gear: { backpack: 'Ещё один груз за ходку.', shield: 'Принимает на себя часть урона. Не с луком.', armor: 'Больше здоровья и меньше урона.', wateringCan: 'Фермер поливает посадки: растут быстрее.' },
      buildings: { dummy: 'Свободные солдаты и лучники тренируются на нём: урон медленно растёт (до +25%).', smithy: 'Здесь делают всё, где есть железо: железные инструменты и оружие, броню, щиты.', wall_wood: 'Перекрывает путь врагам.', wall_stone: 'Прочнее деревянной.', spikes: 'Ранят каждого, кто наступит; ломаются после нескольких шагов.', door: 'Свои проходят, враги — нет.', tent: 'Жильё и лечение.', sacrifice_circle: 'Жильё демонов; житель, отправленный в круг, исцеляет всех.', portal: 'Порталы связаны парами: жители проходят из одного в другой.', grave: 'Жильё нежити: даёт кости и гниль, здесь некромант восстанавливает силы.', campfire: 'Готовит сырую еду; топливо — дрова или уголь.', smelter: 'Плавит руду с углём в железо.', watchtower: 'Лучник на башне стреляет дальше; башня хранит стрелы.', warehouse: 'Склад ближе ратуши: туда носят и оттуда берут.', wheat: 'Грядка пшеницы: зерно и семена.', sapling: 'Вырастет в дерево.', apple_sapling: 'Вырастет в яблоню.' },
      recipes: { arrows: 'Стрелы для лучников и башен.' }
    },
    statLabels: { hp: 'Здоровье', speed: 'Скорость', strength: 'Сила', places: 'Мест', loads: 'Груз', damage: 'Урон', hits: 'Ударов в секунду', reach: 'Дальность', hunt: 'По зверю', fight: 'В бою', cut: 'Урон по носящему', charges: 'Поливов', growth: 'Рост', durability: 'Прочность', housing: 'Жильё', heal: 'Лечение в секунду', archers: 'Лучников', arrows: 'Стрел', uses: 'Шагов', makes: 'Даёт', tiles: 'кл.' },
    text: {
      'menu.play': 'ИГРАТЬ', 'menu.waveInterval': 'Интервал волн (сек):', 'menu.custom': 'Своё', 'menu.mapSize': 'Размер карты:',
      'menu.mapSmall': 'Малая', 'menu.mapMedium': 'Средняя', 'menu.mapLarge': 'Большая', 'menu.mapCustom': 'Своя',
      'menu.seed': 'Сид мира', 'menu.newSeed': 'Новый случайный сид', 'menu.language': 'Язык:', 'menu.endless': 'Бесконечный', 'menu.battles': 'Битвы', 'menu.editor': 'Редактор карт', 'menu.settings': 'Настройки', 'menu.exit': 'Выйти', 'menu.back': '← Назад', 'menu.difficulty': 'Сложность:', 'menu.easy': 'Лёгкая', 'menu.normal': 'Обычная', 'menu.hard': 'Сложная', 'menu.fps': 'Частота кадров:', 'menu.fpsDisplay': 'Как экран', 'menu.showFps': 'Показывать FPS:', 'menu.sound': 'Звук:', 'menu.music': 'Музыка:', 'menu.on': 'Вкл.', 'menu.off': 'Выкл.',
      'pause.title': 'Пауза', 'pause.continue': 'Продолжить', 'pause.exit': 'Выйти в главное меню',
      'pause.resumeHint': 'Продолжить [Space]', 'pause.pauseHint': 'Пауза [Space / P]',
      'top.wave': 'Волна', 'top.seconds': 'с', 'top.zoomIn': 'Приблизить', 'top.zoomOut': 'Отдалить', 'top.point': 'Указать',
     
      'btn.openHall': '[[hall]] Найм — в ратуше', 'card.hp': 'Прочность {hp}/{max}', 'card.repair': '[[tools]] Починить ({cost})', 'card.repairCancel': '[[close]] Отменить ремонт', 'card.sacrifice': '[[sacrifice_circle]] Отправить в круг: {name}', 'card.arrows': 'Стрел {n}/{max}', 'card.fuel': 'Топливо {n}', 'card.smelter': 'Руда {ore}, уголь {coal}, железо {iron}', 'hall.hall': 'Ратуша', 'hall.graveyard': 'Кладбище', 'hall.hellgate': 'Врата ада',
      'craft.atHall': '{name}: делают в ратуше', 'craft.atSmithy': '{name}: делают в кузнице', 'craft.needSmithy': '[[warn]] {name}: нужна кузница (в ней железо)', 'card.queue': 'Делается: {list}', 'card.waiting': 'ждёт', 'activity.craftItem': 'Делает вещь',
      'top.possess': 'Вселиться [Tab]', 'pause.seed': 'Сид мира', 'panel.hire': 'Найм', 'editor.untitled': 'Новая карта',
      'dock.build': 'Стройка', 'dock.farming': 'Ферма', 'dock.blight': 'Порча', 'dock.people': 'Люди', 'dock.arsenal': 'Арсенал',
      'dock.clear': 'Очистить', 'dock.eraser': 'Ластик', 'dock.map': 'Карта', 'battle.phase.setup': 'Расстановка', 'battle.phase.fight': 'Бой',
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
      'pop.limit': '[[warn]] Превышен лимит поселенцев! Нужно больше жилья: {name} ([[{icon}]])', 'pop.limitNoHome': '[[warn]] Превышен лимит поселенцев!', 'hire.done': '[[ok]] Нанят: {name}!',
      'upgrade.noone': '[[no]] Нет подходящего обычного поселенца для улучшения!', 'upgrade.needs': '[[no]] Улучшение в {name}: нужно', 'upgrade.done': '[[ok]] Поселенец улучшен: {name}!',
      'battle.hint': 'Тап — поставить, ещё тап — убрать: свои слева, враги справа', 'battle.cat.own': 'Игрок', 'battle.cancel': '[[close]] Отменить бой', 'battle.cat.enemy': 'Враги', 'battle.cat.buildings': 'Постройки', 'battle.armor': '[[armor]] Броня', 'battle.shield': '[[shield]] Щит', 'battle.clearGreen': '[[broom]] Зелёных', 'battle.clearRed': '[[broom]] Красных', 'battle.only.green': '[[warn]] Своих — только на зелёную сторону', 'battle.only.red': '[[warn]] Врагов — только на красную сторону', 'battle.fight': '[[swords]] В бой!', 'battle.needBoth': '[[warn]] Сначала поставьте юнитов с обеих сторон', 'battle.greenWins': 'Победили зелёные!', 'battle.redWins': 'Победили красные!', 'battle.drawWins': 'Ничья!', 'preset.fist': 'Без оружия', 'preset.club': 'Дубина', 'preset.sword': 'Меч', 'preset.spear': 'Копьё', 'preset.iron_sword': 'Железный меч', 'preset.iron_spear': 'Железное копьё', 'preset.bow': 'Лучник', 'preset.big_club': 'Богатырь, дубина', 'preset.big_spear': 'Богатырь, копьё', 'preset.raider_club': 'Дикарь', 'preset.raider': 'Разбойник', 'preset.brute': 'Громила', 'preset.raider_archer': 'Вражеский лучник',
      'menu.generator': 'Генератор карт', 'gen.standard': 'Стандарт', 'gen.save': 'Сохранить', 'gen.presetName': 'Название пресета', 'gen.group.water': 'Вода', 'gen.group.desert': 'Пустыня', 'gen.group.forests': 'Леса', 'gen.group.resources': 'Ресурсы', 'gen.group.ore': 'Руда', 'gen.group.rocks': 'Скалы', 'gen.group.animals': 'Животные', 'gen.group.regrowth': 'Отрастание (с)', 'gen.group.other': 'Прочее', 'gen.lakes': 'Озёра', 'gen.lakeWidth': 'Ширина озера', 'gen.lakeHeight': 'Высота озера', 'gen.lakeMinDistance': 'Расстояние между озёрами', 'gen.deserts': 'Пустыни', 'gen.desertRadiusX': 'Ширина пустыни', 'gen.desertRadiusY': 'Высота пустыни', 'gen.desertCactus': 'Кактусов в пустыне', 'gen.desertPebbles': 'Камешков в пустыне', 'gen.forests': 'Леса', 'gen.forestTrees': 'Деревьев в лесу', 'gen.forestRadius': 'Размер леса', 'gen.forestUndergrowthShare': 'Подлесок в лесах (0-1)', 'gen.trees': 'Одиночные деревья', 'gen.boulders': 'Валуны', 'gen.boulderPiles': 'Кучи валунов', 'gen.boulderPileSize': 'Валунов в куче', 'gen.grass': 'Трава', 'gen.berryBushes': 'Ягодные кусты', 'gen.sticks': 'Палки', 'gen.pebbles': 'Камешки', 'gen.ironSpawners': 'Спавнеры железа', 'gen.coalSpawners': 'Спавнеры угля', 'gen.orePerSpawner': 'Руды на спавнер', 'gen.oreSpawnerRadius': 'Разброс руды (клетки)', 'gen.rockClusters': 'Скальные массивы', 'gen.rockClusterWidth': 'Ширина массива', 'gen.rockClusterHeight': 'Высота массива', 'gen.boars': 'Кабаны', 'gen.respawnDelay': 'Ресурсы отрастают', 'gen.oreRespawnDelay': 'Руда отрастает',
      'sacrifice.pick': '[[warn]] Сначала выберите жителя, потом тапните круг', 'sacrifice.going': '[[sacrifice_circle]] {name} идёт к кругу', 'sacrifice.done': '[[ok]] Жертва исцелила всех',
      'save.button': 'Сохранить игру', 'save.list': 'Сохранения:', 'save.name': 'Волна {wave} · {time}', 'save.done': '[[save]] Сохранено: {name}', 'save.failed': '[[no]] Не удалось сохранить на устройстве',
      'tab.blight': '[[rot]] Порча', 'blight.hint': 'Отметьте землю, которую испортит некромант: враги на ней медленнее, трупы встают', 'btn.blightZone': '[[rot]] Зона порчи', 'btn.blightClear': '[[close]] Убрать зону', 'blight.already': 'Эта земля уже испорчена',
      'panel.defense': 'Оборона', 'panel.homes': 'Жильё', 'panel.economy': 'Хозяйство', 'panel.plant': 'Посадка', 'panel.zones': 'Зоны фермы', 'panel.tools': 'Инструменты', 'panel.gear': 'Снаряжение', 'panel.weapons': 'Оружие', 'panel.arrows': 'Стрелы', 'panel.armour': 'Защита',
      'activity.playerControlled': 'Под вашим управлением', 'activity.goToSacrifice': 'Идёт к кругу', 'activity.loadTowerArrows': 'Несёт стрелы на башню', 'activity.collectSmelterIron': 'Забирает железо', 'activity.supplySmelter': 'Снабжает плавильню', 'activity.deliverToSmelter': 'Снабжает плавильню', 'activity.guardTower': 'На башне', 'activity.repairTownHall': 'Чинит ратушу', 'activity.repairBuilding': 'Чинит', 'activity.equip': 'Идёт за снаряжением', 'activity.fertilize': 'Удобряет', 'activity.strikeBack': 'Отбивается', 'info.morale': 'мораль {n}', 'info.panic': '[[warn]] в панике', 'activity.panic': 'В панике', 'activity.cook': 'Готовит', 'activity.deliverMaterials': 'Несёт материалы на стройку', 'activity.deliverCarrying': 'Несёт на склад', 'activity.repairTent': 'Чинит укрытие', 'activity.eatCorpse': 'Ест труп', 'activity.healAtTent': 'Лечится', 'activity.treatWounded': 'Лечит раненых', 'activity.necromancy': 'Колдует', 'activity.holdPost': 'На посту', 'activity.fightEnemies': 'Сражается', 'activity.breakOutOfSealedBase': 'Пробивает выход', 'activity.clearEnemyTents': 'Штурмует палатки врага', 'activity.relieve': 'Отошёл по нужде', 'activity.build': 'Строит', 'activity.collectWorms': 'Собирает червей', 'activity.fish': 'Рыбачит', 'activity.pickApples': 'Собирает яблоки', 'activity.harvest': 'Добывает', 'activity.tendFarmZones': 'Сажает', 'activity.waterCrops': 'Поливает', 'activity.farmerGathersGrass': 'Собирает траву', 'activity.deliverWhenNothingToDo': 'Несёт на склад', 'activity.idlePatrol': 'Патрулирует край базы', 'activity.idleTrain': 'Тренируется у чучела', 'activity.escortGatherers': 'Охраняет сборщика', 'activity.collectBones': 'Собирает кости с трупа', 'info.trained': 'тренирован +{n}%', 'activity.idleCampfire': 'Сидит у костра', 'activity.idleTalk': 'Болтает', 'activity.idleSharpen': 'Точит оружие', 'activity.idleSpar': 'Дерётся понарошку', 'activity.idleSway': 'Покачивается', 'activity.cleanDung': 'Несёт навоз в кучу', 'activity.patrol': 'Без дела',
      'info.hungry': 'проголодается через {seconds} с', 'info.noHunger': 'не голодает', 'info.crumbles': 'рассыплется через {seconds} с', 'info.carries': 'несёт',
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
