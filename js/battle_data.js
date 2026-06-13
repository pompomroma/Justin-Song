/* Grove Clash — js/battle_data.js
   BData: species/move tables, stat & damage formulas, stat stages,
   items, capture odds, enemy AI and every battle message string.
   Pure (Node-safe) so the smoke test can run damage goldens and
   Monte-Carlo battle sims. */
const BData = (() => {

  const SPECIES = {
    PIXLIT:   { name: 'PIXLIT',   base: { hp: 40, atk: 75, def: 60, spe: 40 },
                moves: ['TACKLE', 'GROWL', 'MINDBEAM', 'PSYBLAST'],
                ppInit: [35, 30, 16, 20] }, // worn from the journey (matches the reference shot)
    THORNLET: { name: 'THORNLET', base: { hp: 45, atk: 55, def: 65, spe: 35 },
                moves: ['TACKLE', 'GROWL', 'LEAFRAZOR', 'SEEDBURST'] },
    EMBERIK:  { name: 'EMBERIK',  base: { hp: 42, atk: 68, def: 48, spe: 50 },
                moves: ['TACKLE', 'GROWL', 'CINDER', 'SCORCH'] },
    MAGMULE:  { name: 'MAGMULE',  base: { hp: 52, atk: 32, def: 42, spe: 35 },
                moves: ['TACKLE', 'CINDER', 'GROWL'] },
    // Dungeon boss — two forms. AWAKEN (a transform move) morphs VORNETH
    // into its true form mid-battle; statsFor() resolves each form's block.
    VORNETH:   { name: 'VORNETH', base: { hp: 80, atk: 60, def: 60, spe: 50 },
                 moves: ['TACKLE', 'VOIDLANCE', 'DREADWAVE', 'AWAKEN'], form2: 'VORNETH_X', boss: true },
    VORNETH_X: { name: 'VORNETH-X', base: { hp: 80, atk: 88, def: 74, spe: 72 },
                 moves: ['VOIDLANCE', 'ABYSSNOVA', 'DREADWAVE', 'VOIDSTORM'], boss: true },
  };

  /* anim kinds (battle.js dispatch): dash | rings | beam | orb | volley.
     fx = particle color theme for the move's effects. */
  const W = [1, 1, 1];
  const MOVES = {
    TACKLE:    { name: 'Tackle',    type: 'NORMAL', power: 40, acc: 100, pp: 35,
                 anim: 'dash',   fx: [W, [0.95, 0.85, 0.55]] },
    GROWL:     { name: 'Growl',     type: 'NORMAL', power: 0,  acc: 100, pp: 30, effect: 'atkDown',
                 anim: 'rings',  fx: [W, [1, 0.55, 0.75]] },
    MINDBEAM:  { name: 'Mindbeam',  type: 'PSY',    power: 50, acc: 100, pp: 20,
                 anim: 'beam',   fx: [[1, 0.4, 0.8], W, [0.78, 0.49, 1]] },
    PSYBLAST:  { name: 'Psyblast',  type: 'PSY',    power: 75, acc: 90,  pp: 20,
                 anim: 'orb',    fx: [[1, 0.4, 0.8], W, [0.78, 0.49, 1], [1, 0.8, 0.95]] },
    CINDER:    { name: 'Cinder',    type: 'FIRE',   power: 30, acc: 95,  pp: 25,
                 anim: 'cinder', fx: [[1, 0.48, 0.16], [1, 0.72, 0.2], [0.9, 0.25, 0.1]] },
    SCORCH:    { name: 'Scorch',    type: 'FIRE',   power: 70, acc: 90,  pp: 15,
                 anim: 'orb',    fx: [[1, 0.48, 0.16], [1, 0.72, 0.2], [1, 1, 0.8]] },
    LEAFRAZOR: { name: 'Leafrazor', type: 'LEAF',   power: 55, acc: 100, pp: 20,
                 anim: 'beam',   fx: [[0.55, 0.95, 0.4], W, [0.3, 0.75, 0.3]] },
    SEEDBURST: { name: 'Seedburst', type: 'LEAF',   power: 70, acc: 90,  pp: 15,
                 anim: 'volley', fx: [[0.55, 0.95, 0.4], [0.85, 0.7, 0.3], [0.3, 0.75, 0.3]] },
    // boss moves (bespoke 'void' animations, grandest in the game)
    VOIDLANCE: { name: 'Void Lance', type: 'VOID', power: 60, acc: 100, pp: 15,
                 anim: 'voidbeam', fx: [[0.72, 0.34, 1], [1, 1, 1], [0.5, 0.12, 0.7]] },
    DREADWAVE: { name: 'Dread Wave', type: 'VOID', power: 45, acc: 100, pp: 15,
                 anim: 'voidnova', fx: [[0.6, 0.2, 0.9], [0.3, 0.1, 0.5], [1, 1, 1]] },
    ABYSSNOVA: { name: 'Abyss Nova', type: 'VOID', power: 95, acc: 90,  pp: 5,
                 anim: 'voidnova', fx: [[0.85, 0.35, 1], [1, 0.5, 0.95], [1, 1, 1], [0.4, 0.12, 0.6]] },
    VOIDSTORM: { name: 'Void Storm', type: 'VOID', power: 80, acc: 90,  pp: 10,
                 anim: 'voidbeam', fx: [[0.72, 0.34, 1], [1, 1, 1], [0.95, 0.45, 1]] },
    AWAKEN:    { name: 'Awaken', type: 'VOID', power: 0, acc: 100, pp: 5, effect: 'transform' },
  };

  // battle items: 3 charges of each per battle
  const ITEMS = {
    heal: { name: 'Heal', uses: 3, healFrac: 0.5 },
    cure: { name: 'Cure', uses: 3 },
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

  // capture odds scale with how hurt the target is
  // bosses are far harder to catch; only realistic when badly weakened
  const captureChance = (hpFrac, isBoss) => {
    let c = 0.25 + 0.65 * (1 - hpFrac);
    if (isBoss) c *= 0.5;
    return M3.clamp(c, isBoss ? 0.03 : 0.05, isBoss ? 0.6 : 0.95);
  };

  /* enemy move choice over its OWN current moveset (works for any species
     and either boss form). ai: {atkStage, foeHpFrac, pp: {moveId: n}}.
     Transform moves are never AI-picked — boss phase changes are forced by
     an HP threshold in battle.js. */
  function aiPick(moves, ai, rng) {
    const w = [];
    for (const id of moves) {
      const mv = MOVES[id];
      if (!mv || (ai.pp[id] || 0) <= 0 || mv.effect === 'transform') continue;
      let weight;
      if (mv.effect === 'atkDown') weight = (ai.atkStage <= -6 || ai.foeHpFrac < 0.25) ? 0 : 0.22;
      else weight = 0.4 + (mv.power || 0) / 220; // favor stronger moves
      if (weight > 0) w.push([id, weight]);
    }
    if (!w.length) {
      for (const id of moves) if ((ai.pp[id] || 0) > 0 && MOVES[id] && MOVES[id].effect !== 'transform') return id;
      return moves[0];
    }
    let total = 0;
    for (const [, weight] of w) total += weight;
    let roll = rng() * total;
    for (const [id, weight] of w) { roll -= weight; if (roll <= 0) return id; }
    return w[w.length - 1][0];
  }

  const MSG = {
    challenge: '{T} would like to battle!',
    sentOut: '{T} sent out {M}!',
    go: 'Go! {A}!',
    comeBack: '{A}, come back!',
    used: '{A} used {M}!',
    miss: "{A}'s attack missed!",
    crit: 'A critical hit!',
    atkFell: "{A}'s Attack fell!",
    atkFloor: "{A}'s Attack won't go any lower!",
    noPp: "There's no PP left for this move!",
    usedItem: 'You used a {M}!',
    healUsed: "{A}'s HP was restored!",
    cureUsed: "{A}'s stats returned to normal!",
    noneLeft: 'There are none left!',
    threwBall: 'You hurled a Voxball at {A}!',
    caught: 'Gotcha! {A} was caught!',
    joined: '{A} joined your party!',
    broke: 'Oh no! {A} broke free!',
    partyFull: 'Your party is full!',
    fled: 'You got away safely!',
    choose: 'Choose your next ally!',
    faint: '{A} fainted!',
    win1: 'You defeated {T}!',
    win3: '{A} gained {E} EXP. Points!',
    lose1: 'You have no creatures that can fight!',
    lose2: 'You blacked out!',
    // dungeon boss
    bossAppear1: 'The air splits with a deafening shriek...',
    bossAppear2: 'Something vast stirs atop the rift-cliff!',
    bossReveal: 'VORNETH looms over you from the cliff!',
    bossWin1: 'The rift shudders and goes dark...',
    bossWin2: 'You drove VORNETH back into the void!',
    transform1: '{A} is convulsing with dark power!',
    transform2: '{A} awakened into {B}!',
  };

  const fmt = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k]) !== undefined ? vars[k] : '{' + k + '}');

  // overworld dialogue, keyed by NPC id (intro before first battle, rematch
  // before later ones, beaten once defeated). portal/boss are special.
  const DIALOGUE = {
    rex: {
      intro: ['REX: Hey! You stomped right through my camp!', 'REX: My MAGMULE will teach you some manners!'],
      rematch: ['REX: Back for more? MAGMULE is all fired up!'],
      beaten: ['REX: Whew... that was a scrap.', "REX: That rift past the ridge? Don't face it unprepared."],
    },
    hiker: {
      intro: ['HIKER DALE: These woods go on forever, kid.', 'DALE: Prove you can handle a real climb!'],
      rematch: ['DALE: Round two? My THORNLET is ready!'],
      beaten: ['DALE: Hah! You have got the legs for this trail.'],
    },
    lass: {
      intro: ['LASS IVY: Ooh, a challenger!', 'IVY: My EMBERIK runs hot. Watch out!'],
      rematch: ['IVY: Let us dance again!'],
      beaten: ['IVY: So warm... so strong. Well played!'],
    },
    ace: {
      intro: ['ACE KORU: You reek of easy battles.', 'KORU: Show me something worth my time.'],
      rematch: ['KORU: Again. Do not bore me.'],
      beaten: ['KORU: ...Impressive. The rift may not break you after all.'],
    },
    portal: ['A jagged rift claws at the air, pulsing with cold light.', 'Step into the darkness?'],
    portalDone: ['The rift is silent now. Only embers drift through it.'],
  };

  return { SPECIES, MOVES, ITEMS, statsFor, stageMul, damage, captureChance, aiPick, MSG, fmt, DIALOGUE };
})();
