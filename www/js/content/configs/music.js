// The music (#198): every faction's tracks, made as they play by app/sounds.js (no sound files). Each
// faction has three ambients for its colony and three battle tracks for its waves (factions.<id>.music).
//
// A track: bpm; chords, one a bar (MIDI notes: 60 is middle C); and its parts, each optional:
// - pad: the bar's chord held (wave, gain, attack s, length in beats; filter: lowpass Hz; detune: a second
//   voice that much sharper, as a share of the pitch; octave: semitones up or down);
// - arp: a chord tone on each eighth (pattern: the chord's note index per eighth, null for a rest; octave);
// - bass: per eighth, semitones over the chord's root (pattern), or set notes (notes); octave, length;
// - lead: now and then (chance per eighth) a note of the scale;
// - drums: per eighth 'x' (or 'X', louder) in a string of 8 for kick, snare, hat and tom; fill: a tom run
//   at the end of the last bar;
// - extra: a sound of the faction's world now and then (chance per eighth): birds, crickets, toll (a bell),
//   whispers, crackle (embers), growl, chant.

export const musicConfig = {
  music: {
    // ---- the humans: folk modes, plucked and blown, birds in the fields
    humans_meadow: { bpm: 60, chords: [[50, 57, 62, 64], [46, 53, 58, 62], [53, 57, 60, 64], [48, 55, 60, 62]],
      pad: { wave: 'sine', gain: 0.1, attack: 1.4, length: 4.5 },
      lead: { wave: 'triangle', gain: 0.08, chance: 0.1, length: 1.8, scale: [74, 76, 77, 79, 81] },
      extra: { kind: 'birds', chance: 0.025 } },
    humans_village: { bpm: 78, chords: [[55, 59, 62], [60, 64, 67], [52, 55, 59], [50, 54, 57]],
      pad: { wave: 'sine', gain: 0.07, attack: 0.6, length: 4.2 },
      arp: { wave: 'triangle', gain: 0.06, pattern: [0, 1, 2, 1, 0, 1, 2, 1], octave: 12, length: 0.8 },
      bass: { wave: 'triangle', gain: 0.1, pattern: [0, null, null, null, 7, null, null, null], octave: -12, length: 1.6 },
      lead: { wave: 'triangle', gain: 0.06, chance: 0.06, length: 1.2, scale: [79, 81, 83, 86, 88] },
      extra: { kind: 'birds', chance: 0.015 } },
    humans_dusk: { bpm: 56, chords: [[50, 57, 62, 65], [48, 55, 60, 64], [47, 55, 59, 62], [45, 52, 57, 60]],
      pad: { wave: 'sine', gain: 0.09, attack: 1.6, length: 4.6 },
      bass: { wave: 'sine', gain: 0.12, pattern: [0, null, null, null, null, null, null, null], octave: -12, length: 3.8 },
      lead: { wave: 'sine', gain: 0.07, chance: 0.14, length: 2.2, scale: [74, 76, 77, 79, 81, 83] },
      extra: { kind: 'crickets', chance: 0.03 } },
    humans_battle: { bpm: 124, chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]],
      pad: { wave: 'sawtooth', gain: 0.03, attack: 0.02, length: 1.6, filter: 1300 },
      bass: { wave: 'sawtooth', gain: 0.08, notes: [45, 45, 48, 45, 43, 45, 40, 43], length: 0.45, filter: 520 },
      drums: { kick: 'x...x...', snare: '..x...x.', fill: true } },
    humans_march: { bpm: 108, chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]],
      pad: { wave: 'sawtooth', gain: 0.045, attack: 0.08, length: 3.5, filter: 900 },
      bass: { wave: 'sawtooth', gain: 0.08, pattern: [0, null, 7, null, 0, null, 7, null], octave: -12, length: 0.4, filter: 600 },
      drums: { kick: 'x...x...', snare: '..x..xx.', fill: true } },
    humans_charge: { bpm: 138, chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]],
      bass: { wave: 'sawtooth', gain: 0.07, pattern: [0, null, 0, 0, 0, null, 0, 0], octave: -12, length: 0.25, filter: 700 },
      lead: { wave: 'sawtooth', gain: 0.04, chance: 0.25, length: 0.5, filter: 1800, scale: [76, 79, 81, 83, 86] },
      drums: { kick: 'x..xx..x', snare: '..x...x.', hat: 'xxxxxxxx' } },

    // ---- the undead: organs and bells, minor and diminished, fog and whispers
    undead_crypt: { bpm: 50, chords: [[48, 51, 55], [44, 48, 51], [46, 50, 53], [43, 47, 50]],
      pad: { wave: 'square', gain: 0.05, attack: 1.2, length: 4.5, filter: 700 },
      bass: { wave: 'sine', gain: 0.1, pattern: [0, null, null, null, null, null, null, null], octave: -12, length: 4 },
      extra: { kind: 'toll', chance: 0.06 } },
    undead_fog: { bpm: 52, chords: [[52, 53, 59], [52, 55, 60], [53, 57, 60], [52, 53, 59]],
      pad: { wave: 'sine', gain: 0.07, attack: 2, length: 4.8 },
      lead: { wave: 'sine', gain: 0.04, chance: 0.07, length: 2.5, scale: [88, 89, 91, 95, 96] },
      extra: { kind: 'whispers', chance: 0.03 } },
    undead_graves: { bpm: 46, chords: [[48, 51, 54, 57], [47, 50, 53, 56], [49, 52, 55, 58], [48, 51, 54, 57]],
      pad: { wave: 'triangle', gain: 0.05, attack: 1.5, length: 4.5, filter: 900 },
      lead: { wave: 'triangle', gain: 0.05, chance: 0.18, length: 0.9, scale: [84, 87, 90, 93, 96] },
      extra: { kind: 'toll', chance: 0.03 } },
    undead_march: { bpm: 92, chords: [[48, 51, 55], [47, 50, 55], [44, 48, 51], [43, 47, 50]],
      pad: { wave: 'square', gain: 0.04, attack: 0.05, length: 1.2, filter: 800 },
      bass: { wave: 'sawtooth', gain: 0.1, pattern: [0, null, 0, null, -1, null, -2, null], octave: -12, length: 0.6, filter: 400 },
      drums: { kick: 'X...x...', snare: '....x...', tom: '......x.', fill: true } },
    undead_bones: { bpm: 120, chords: [[57, 60, 64], [53, 57, 60], [52, 56, 59], [57, 60, 64]],
      bass: { wave: 'sawtooth', gain: 0.08, pattern: [0, null, null, 0, null, null, 0, null], octave: -24, length: 0.3, filter: 500 },
      lead: { wave: 'triangle', gain: 0.06, chance: 0.4, length: 0.2, scale: [69, 72, 74, 75, 76, 79, 81] },
      drums: { kick: 'x...x...', snare: '..x...x.', hat: 'xxxxxxxx' } },
    undead_dirge: { bpm: 80, chords: [[50, 53, 57], [49, 53, 56], [48, 51, 55], [45, 49, 52]],
      pad: { wave: 'sawtooth', gain: 0.035, attack: 0.4, length: 4, filter: 600 },
      bass: { wave: 'sine', gain: 0.14, pattern: [0, null, null, null, null, null, null, null], octave: -24, length: 3 },
      drums: { kick: 'x.......', tom: 'x..x..x.' },
      extra: { kind: 'toll', chance: 0.1 } },

    // ---- the demons: low drones and tritones, embers and growls, pounding drums
    demons_embers: { bpm: 60, chords: [[41, 42, 48], [41, 44, 48], [42, 46, 49], [40, 44, 47]],
      pad: { wave: 'sawtooth', gain: 0.05, attack: 1.5, length: 4.6, filter: 350, detune: 0.006 },
      extra: { kind: 'crackle', chance: 0.12 } },
    demons_brimstone: { bpm: 56, chords: [[52, 53, 56], [52, 56, 59], [53, 56, 60], [50, 53, 57]],
      pad: { wave: 'sawtooth', gain: 0.04, attack: 1.2, length: 4.5, filter: 700, detune: 0.008 },
      lead: { wave: 'sawtooth', gain: 0.04, chance: 0.06, length: 1.5, filter: 1200, scale: [76, 77, 80, 81, 83, 84] },
      extra: { kind: 'growl', chance: 0.02 } },
    demons_abyss: { bpm: 40, chords: [[36, 42], [35, 41], [36, 42], [37, 43]],
      pad: { wave: 'sine', gain: 0.14, attack: 2.5, length: 4.8 },
      extra: { kind: 'growl', chance: 0.05 } },
    demons_inferno: { bpm: 140, chords: [[40, 41, 47], [40, 43, 47], [41, 44, 48], [38, 41, 45]],
      pad: { wave: 'sawtooth', gain: 0.03, attack: 0.02, length: 1.2, filter: 1500 },
      bass: { wave: 'sawtooth', gain: 0.08, pattern: [0, 0, 1, 0, 0, 3, 1, 0], octave: 0, length: 0.3, filter: 800 },
      drums: { kick: 'xx.xxx.x', snare: '..x...x.', fill: true } },
    demons_drums: { bpm: 98, chords: [[38, 44, 50], [38, 45, 50], [39, 45, 51], [37, 44, 49]],
      pad: { wave: 'sawtooth', gain: 0.03, attack: 0.5, length: 4, filter: 500 },
      drums: { kick: 'x...x...', snare: '......x.', tom: 'x.xx.x.x' },
      extra: { kind: 'chant', chance: 0.05 } },
    demons_hellfire: { bpm: 152, chords: [[47, 50, 53], [46, 49, 53], [47, 50, 55], [45, 48, 51]],
      bass: { wave: 'sawtooth', gain: 0.07, pattern: [0, 0, 0, 0, 6, 6, 1, 1], octave: -12, length: 0.22, filter: 900 },
      lead: { wave: 'sawtooth', gain: 0.035, chance: 0.2, length: 0.3, filter: 2000, scale: [71, 72, 77, 78, 83] },
      drums: { kick: 'x.x.x.x.', snare: '..x...x.', hat: 'xxxxxxxx' },
      extra: { kind: 'crackle', chance: 0.05 } }
  }
};
