/* Grove Clash — js/battle_data.js
   BData: species/move tables, stat & damage formulas, stat stages,
   enemy AI and every battle message string. Pure (Node-safe) so the
   smoke test can run damage goldens and Monte-Carlo battle sims. */
const BData = (() => {

  const SPECIES = {
    PIXLIT:  { name: 'PIXLIT',  base: { hp: 40, atk: 75, def: 60, spe: 40 },
               moves: ['TACKLE', 'GROWL', 'MINDBEAM', 'PSYBLAST'] },
    MAGMULE: { name: 'MAGMULE', base: { hp: 52, atk: 32, def: 42, spe: 35 },
               moves: ['TACKLE', 'CINDER', 'GROWL'] },
  };

  const MOVES = {
    TACKLE:   { name: 'Tackle',   type: 'NORMAL', power: 40, acc: 100, pp: 35 },
    GROWL:    { name: 'Growl',    type: 'NORMAL', power: 0,  acc: 100, pp: 30, effect: 'atkDown' },
    MINDBEAM: { name: 'Mindbeam', type: 'PSY',    power: 50, acc: 100, pp: 20 },
    PSYBLAST: { name: 'Psyblast', type: 'PSY',    power: 75, acc: 90,  pp: 20 },
    CINDER:   { name: 'Cinder',   type: 'FIRE',   power: 30, acc: 95,  pp: 25 },
  };

  function statsFor(speciesId, level) {
    const b = SPECIES[speciesId].base;
    return {
      maxHp: Math.floor(2 * b.hp * level / 100) + level + 10,
      atk: Math.floor(2 * b.atk * level / 100) + 5,
      def: Math.floor(2 * b.def * level / 100) + 5,
      spe: Math.floor(2 * b.spe * level / 100) + 5,
    };
  }

  const stageMul = (s) => {
    s = M3.clamp(s, -6, 6);
    return Math.max(2, 2 + s) / Math.max(2, 2 - s);
  };

  /* att/def: {level, atk, def, atkStage, defStage}. move: MOVES entry.
     rng: () => [0,1). Type effectiveness is x1 for every pairing in this
     prototype (hook kept for expansion). */
  function damage(att, def, move, rng) {
    if (!move.power) return { dmg: 0, crit: false, miss: false };
    if (rng() * 100 >= move.acc) return { dmg: 0, crit: false, miss: true };
    const A = att.atk * stageMul(att.atkStage || 0);
    const D = Math.max(1, def.def * stageMul(def.defStage || 0));
    const crit = rng() < 1 / 16;
    const eff = 1; // type chart hook
    let base = Math.floor(Math.floor(Math.floor(2 * att.level / 5 + 2) * move.power * A / D) / 50) + 2;
    base = base * (crit ? 1.5 : 1) * eff * (0.85 + rng() * 0.15);
    return { dmg: Math.max(1, Math.floor(base)), crit, miss: false };
  }

  /* enemy move choice. ai: {atkStage (its own), foeHpFrac, pp: {moveId: n}} */
  function aiPick(ai, rng) {
    const w = [];
    const add = (id, weight) => { if ((ai.pp[id] || 0) > 0 && weight > 0) w.push([id, weight]); };
    add('TACKLE', 0.40);
    add('CINDER', 0.35);
    add('GROWL', (ai.atkStage <= -6 || ai.foeHpFrac < 0.25) ? 0 : 0.25);
    if (!w.length) return 'TACKLE'; // struggle-ish fallback
    let total = 0;
    for (const [, weight] of w) total += weight;
    let roll = rng() * total;
    for (const [id, weight] of w) { roll -= weight; if (roll <= 0) return id; }
    return w[w.length - 1][0];
  }

  const MSG = {
    intro1: 'Camper REX would like to battle!',
    intro2: 'Camper REX sent out MAGMULE!',
    intro3: 'Go! PIXLIT!',
    menu: 'What will PIXLIT do?',
    used: '{A} used {M}!',
    miss: "{A}'s attack missed!",
    crit: 'A critical hit!',
    atkFell: "{A}'s Attack fell!",
    atkFloor: "{A}'s Attack won't go any lower!",
    noPp: "There's no PP left for this move!",
    noFlee: "No! There's no running from a trainer battle!",
    faint: '{A} fainted!',
    win1: 'You defeated Camper REX!',
    win2: 'REX: Whoa! Your PIXLIT is scrappier than it looks!',
    win3: 'PIXLIT gained 135 EXP. Points!',
    lose1: 'You have no creatures that can fight!',
    lose2: 'You blacked out!',
  };

  const fmt = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k]) !== undefined ? vars[k] : '{' + k + '}');

  // overworld dialogue
  const DIALOGUE = {
    first: [
      'REX: Hey! You stomped right through my camp!',
      'REX: My MAGMULE and I will teach you some manners!',
    ],
    rematch: [
      'REX: Back for more? MAGMULE is all fired up!',
    ],
    beaten: [
      'REX: Whew... MAGMULE needs a nap after that one.',
      'REX: Come back any time for a rematch!',
    ],
  };

  return { SPECIES, MOVES, statsFor, stageMul, damage, aiPick, MSG, fmt, DIALOGUE };
})();
