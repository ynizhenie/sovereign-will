// A settler goes to the town hall to swap what the player ordered for it

// ---- Equipment and hauling

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game, townHall } from '../../../engine/world/index.js';
import { applyBowUnit, isRangedWeapon, putOnGear, refundEquipment, takeOffGear } from './equipment.rules.js';
import { addResources, moveSettlerToTownHall } from '../storage/index.js';
import { says } from '../settlers/index.js';

// Go to the town hall to swap weapon/tool/armour the player ordered
export function equip(s, tick) {
  if (s.targetEquipment) {
    let dist = Math.hypot(townHall.x - s.x, townHall.y - s.y);
    if (dist > townHall.radius + s.radius) {
      moveSettlerToTownHall(s, s.speed, tick.dt);
    } else {
      let equipment = s.targetEquipment;
      // gear only: put it on / hand it back, and nothing else changes
      if (equipment.gear || equipment.gearOff) {
        if (equipment.gear) {
          putOnGear(s, equipment.gear);
          if (equipment.gear === 'armor' || equipment.gear === 'shield') game.playerGear[equipment.gear] = true; // waves answer it (#203)
          if (equipment.gear === 'leather_armor') game.playerGear.leather = true; // (#298)
        }
        else takeOffGear(s, equipment.gearOff, !!equipment.keep);
        s.targetEquipment = null;
        return true;
      }
      const handed = (equipment.tool !== undefined && equipment.tool !== 'none' && equipment.tool !== s.tool) || (equipment.weapon !== undefined && equipment.weapon !== 'fist' && equipment.weapon !== s.weapon);
      if (!equipment.armorOnly) {
        refundEquipment(s, {
          weapon: equipment.weapon !== undefined && equipment.weapon !== s.weapon,
          tool: equipment.tool !== undefined && equipment.tool !== s.tool,
          // (#279) what it held, given something else: into the store whole, not taken apart
          armor: equipment.armor === 'none', quiver: equipment.quiver === false, keep: !!equipment.keep || handed
        });
      }
      if (equipment.weapon !== undefined) { s.weapon = equipment.weapon; applyBowUnit(s); }
      if (equipment.tool !== undefined) s.tool = equipment.tool;
      if (equipment.role !== undefined) s.role = equipment.role;
      if (equipment.armor !== undefined) s.armor = equipment.armor === 'none' ? null : equipment.armor;
      if (equipment.quiverOnly) {
        s.quiver = true;
        s.quiverCapacity = 12;
        s.arrows = 0;
      }
      if (equipment.quiver !== undefined) s.quiver = equipment.quiver;
      // given a bow or a crossbow, the shield goes back to the stock; disarmed, it keeps it (#232: taking the
      // spear off took the shield too), of use again once it's given a melee weapon
      if (handed) says(s, 'tool'); // (something new in its hands, #252)
      if (s.shield && isRangedWeapon(s.weapon)) {
        game.armory['gear:shield'] = (game.armory['gear:shield'] || 0) + 1; // (into the store whole, #279)
        s.shield = false;
      }
      s.targetEquipment = null;
    }
    return true;
  }
  return false;
}
