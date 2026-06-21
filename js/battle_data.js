/* Grove Clash — js/battle_data.js
   BData: species/move tables, stat & damage formulas, stat stages,
   items, capture odds, enemy AI and every battle message string.
   Pure (Node-safe) so the smoke test can run damage goldens and
   Monte-Carlo battle sims. */
const BData = (() => {

  const SPECIES = {
    PIXLIT:   { name: 'PIXLIT',   type: 'PSY',  base: { hp: 40, atk: 75, def: 60, spe: 40 },
                moves: ['TACKLE', 'GROWL', 'MINDBEAM', 'PSYBLAST'],
                ppInit: [35, 30, 16, 20] }, // worn from the journey (matches the reference shot)
    THORNLET: { name: 'THORNLET', type: 'LEAF', base: { hp: 45, atk: 55, def: 65, spe: 35 },
                moves: ['TACKLE', 'GROWL', 'LEAFRAZOR', 'SEEDBURST'] },
    EMBERIK:  { name: 'EMBERIK',  type: 'FIRE', base: { hp: 42, atk: 68, def: 48, spe: 50 },
                moves: ['TACKLE', 'GROWL', 'CINDER', 'SCORCH'] },
    MAGMULE:  { name: 'MAGMULE',  type: 'FIRE', base: { hp: 52, atk: 32, def: 42, spe: 35 },
                moves: ['TACKLE', 'CINDER', 'GROWL'] },
    // biome-specific wild monsters
    FROSTKIT: { name: 'FROSTKIT', type: 'ICE',  base: { hp: 44, atk: 64, def: 50, spe: 58 },
                moves: ['TACKLE', 'GROWL', 'FROSTBITE', 'ICESHARD'] },   // tundra
    SANDREK:  { name: 'SANDREK',  type: 'FIRE', base: { hp: 58, atk: 70, def: 66, spe: 30 },
                moves: ['TACKLE', 'GROWL', 'CINDER', 'SCORCH'] },        // desert
    // two signature wild monsters per biome
    MOSSOX:   { name: 'MOSSOX',   type: 'LEAF', base: { hp: 64, atk: 62, def: 70, spe: 30 },
                moves: ['TACKLE', 'GROWL', 'LEAFRAZOR', 'SEEDBURST'] },  // forest
    HOOTLE:   { name: 'HOOTLE',   type: 'PSY',  base: { hp: 46, atk: 62, def: 52, spe: 60 },
                moves: ['TACKLE', 'GROWL', 'MINDBEAM', 'PSYBLAST'] },    // forest
    BUNDER:   { name: 'BUNDER',   type: 'PSY',  base: { hp: 48, atk: 58, def: 50, spe: 66 },
                moves: ['TACKLE', 'GROWL', 'MINDBEAM', 'PSYBLAST'] },    // prairie
    LARKIT:   { name: 'LARKIT',   type: 'LEAF', base: { hp: 44, atk: 60, def: 46, spe: 64 },
                moves: ['TACKLE', 'GROWL', 'LEAFRAZOR', 'SEEDBURST'] },  // prairie
    SCARABEX: { name: 'SCARABEX', type: 'FIRE', base: { hp: 52, atk: 66, def: 72, spe: 36 },
                moves: ['TACKLE', 'GROWL', 'CINDER', 'SCORCH'] },        // desert
    COBRELL:  { name: 'COBRELL',  type: 'FIRE', base: { hp: 50, atk: 74, def: 52, spe: 58 },
                moves: ['TACKLE', 'GROWL', 'CINDER', 'SCORCH'] },        // desert
    GLACIMP:  { name: 'GLACIMP',  type: 'ICE',  base: { hp: 46, atk: 66, def: 50, spe: 56 },
                moves: ['TACKLE', 'GROWL', 'FROSTBITE', 'ICESHARD'] },   // ice
    PENGUL:   { name: 'PENGUL',   type: 'ICE',  base: { hp: 58, atk: 58, def: 62, spe: 40 },
                moves: ['TACKLE', 'GROWL', 'FROSTBITE', 'ICESHARD'] },   // ice
    MANELEO:  { name: 'MANELEO',  type: 'FIRE', base: { hp: 60, atk: 78, def: 58, spe: 54 },
                moves: ['TACKLE', 'GROWL', 'CINDER', 'SCORCH'] },        // savanna
    GRASSGAZ: { name: 'GRASSGAZ', type: 'LEAF', base: { hp: 50, atk: 64, def: 50, spe: 70 },
                moves: ['TACKLE', 'GROWL', 'LEAFRAZOR', 'SEEDBURST'] },  // savanna
    // Dungeon boss — two forms. AWAKEN (a transform move) morphs VORNETH
    // into its true form mid-battle; statsFor() resolves each form's block.
    VORNETH:   { name: 'VORNETH', type: 'VOID', base: { hp: 80, atk: 60, def: 60, spe: 50 },
                 moves: ['TACKLE', 'VOIDLANCE', 'DREADWAVE', 'AWAKEN'], form2: 'VORNETH_X', boss: true },
    VORNETH_X: { name: 'VORNETH-X', type: 'VOID', base: { hp: 80, atk: 88, def: 74, spe: 72 },
                 moves: ['VOIDLANCE', 'ABYSSNOVA', 'DREADWAVE', 'VOIDSTORM'], boss: true },
    // The opening tutorial: AEGIS (the protector the player commands) is PSY,
    // strong against the void GIANT (COLOSSUS) it shields the player from.
    PROTECTOR: { name: 'AEGIS', type: 'PSY', base: { hp: 70, atk: 80, def: 70, spe: 64 },
                 moves: ['TACKLE', 'MINDBEAM', 'PSYBLAST', 'GROWL'] },
    GIANT:     { name: 'COLOSSUS', type: 'VOID', base: { hp: 130, atk: 70, def: 82, spe: 38 },
                 moves: ['STOMP', 'ROAR', 'GIANTBEAM', 'GNOVA'], giant: true },
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
    FROSTBITE: { name: 'Frostbite', type: 'ICE',    power: 55, acc: 100, pp: 18,
                 anim: 'beam',   fx: [[0.7, 0.92, 1], [1, 1, 1], [0.5, 0.78, 1]] },
    ICESHARD:  { name: 'Ice Shard', type: 'ICE',    power: 65, acc: 95,  pp: 15,
                 anim: 'volley', fx: [[0.8, 0.95, 1], [0.6, 0.85, 1], [1, 1, 1]] },
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
    // tutorial GIANT moves — heavy slam, dread roar (debuff), and two
    // telegraphed "charged" specials unlocked when it enrages.
    STOMP:     { name: 'Stomp',      type: 'NORMAL', power: 55, acc: 95,  pp: 20,
                 anim: 'dash',     fx: [W, [0.8, 0.7, 0.5], [0.5, 0.45, 0.4]] },
    ROAR:      { name: 'Dread Roar', type: 'NORMAL', power: 0, acc: 100, pp: 20, effect: 'atkDown',
                 anim: 'rings',    fx: [W, [1, 0.7, 0.4]] },
    GIANTBEAM: { name: 'Giga Beam', type: 'VOID',   power: 85, acc: 100, pp: 5, telegraph: true,
                 anim: 'voidbeam', fx: [[1, 0.88, 0.4], W, [0.7, 0.5, 1]] },
    GNOVA:     { name: 'Ruin Nova', type: 'VOID',   power: 95, acc: 90,  pp: 5, telegraph: true,
                 anim: 'voidnova', fx: [[1, 0.8, 0.4], [1, 0.5, 0.9], W, [0.5, 0.15, 0.7]] },
  };

  /* Type effectiveness — a small balanced 4-cycle (NORMAL is neutral both
     ways): FIRE>LEAF>PSY>VOID>FIRE. typeEff(undefined, ...) is 1, so damage
     goldens computed without species types are unchanged. */
  const TYPE_CHART = {
    FIRE: { LEAF: 2, ICE: 2, VOID: 0.5 },
    LEAF: { PSY: 2, FIRE: 0.5, ICE: 0.5 },
    PSY:  { VOID: 2, LEAF: 0.5 },
    VOID: { FIRE: 2, PSY: 0.5 },
    ICE:  { LEAF: 2, FIRE: 0.5 },
  };
  function typeEff(atkType, defType) {
    if (!atkType || !defType) return 1;
    const row = TYPE_CHART[atkType];
    return (row && row[defType]) || 1;
  }

  /* Difficulty — 5 levels scaling opponent strategy (aiPick tier) AND
     attack-pattern diversity (movepool breadth / level / team size). */
  const DIFFICULTY = {
    1: { id: 1, name: 'Rookie',  blurb: 'Foes strike at random.',        moves: 2, levelDelta: -3, teamMax: 1 },
    2: { id: 2, name: 'Trainer', blurb: 'Foes play the odds.',           moves: 2, levelDelta: -1, teamMax: 2 },
    3: { id: 3, name: 'Ace',     blurb: 'Foes set up and press.',        moves: 3, levelDelta: 0,  teamMax: 3 },
    4: { id: 4, name: 'Veteran', blurb: 'Foes hit weak spots, switch.',  moves: 4, levelDelta: 1,  teamMax: 3 },
    5: { id: 5, name: 'Master',  blurb: 'Foes predict and punish.',      moves: 4, levelDelta: 2,  teamMax: 3 },
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

  /* att/def: {level, atk, def, atkStage, defStage, type}. move: MOVES entry.
     rng: () => [0,1). att.type drives STAB (x1.5); def.type drives type
     effectiveness via TYPE_CHART. Both default to neutral (x1) when a type
     is absent, so damage goldens computed without types are unchanged. */
  function damage(att, def, move, rng) {
    if (!move.power) return { dmg: 0, crit: false, miss: false };
    if (rng() * 100 >= move.acc) return { dmg: 0, crit: false, miss: true };
    const A = att.atk * stageMul(att.atkStage || 0);
    const D = Math.max(1, def.def * stageMul(def.defStage || 0));
    const crit = rng() < 1 / 16;
    const eff = typeEff(move.type, def.type);
    const stab = (att.type && move.type === att.type) ? 1.5 : 1;
    let base = Math.floor(Math.floor(Math.floor(2 * att.level / 5 + 2) * move.power * A / D) / 50) + 2;
    base = base * (crit ? 1.5 : 1) * eff * stab * (0.85 + rng() * 0.15);
    return { dmg: Math.max(1, Math.floor(base)), crit, miss: false, eff };
  }

  // mean damage estimate (no rng / no crit) — used by the predictive AI tier
  // to spot a guaranteed KO or the best expected-damage line.
  function estimateDamage(self, foe, move) {
    if (!move.power) return 0;
    const A = self.atk * stageMul(self.atkStage || 0);
    const D = Math.max(1, foe.def * stageMul(foe.defStage || 0));
    const eff = typeEff(move.type, foe.type);
    const stab = (self.type && move.type === self.type) ? 1.5 : 1;
    const base = Math.floor(Math.floor(Math.floor(2 * self.level / 5 + 2) * move.power * A / D) / 50) + 2;
    return base * eff * stab * 0.925;
  }

  // EXP / leveling. Every party member gains the SAME reward (exp share);
  // reward is generous per elimination. Level cap MAXLV.
  const MAXLV = 60;
  const expReward = (level) => 30 + level * 18;
  const expToNext = (level) => 50 + level * level * 10;

  // capture odds scale with how hurt the target is
  // bosses are far harder to catch; only realistic when badly weakened
  const captureChance = (hpFrac, isBoss) => {
    let c = 0.25 + 0.65 * (1 - hpFrac);
    if (isBoss) c *= 0.5;
    return M3.clamp(c, isBoss ? 0.03 : 0.05, isBoss ? 0.6 : 0.95);
  };

  const usable = (id, ai) => {
    const mv = MOVES[id];
    return !!mv && (ai.pp[id] || 0) > 0 && mv.effect !== 'transform';
  };

  /* enemy move choice over its OWN current moveset (works for any species
     and either boss form). ai: {tier, atkStage, foeHpFrac, pp, self, foe}.
     tier (1..5) scales strategic depth; tier === undefined keeps the legacy
     weighting (== tier 2) so existing callers are unchanged. Transform moves
     are never AI-picked — boss phase changes are forced by an HP threshold. */
  function aiPick(moves, ai, rng) {
    const tier = ai.tier;
    const pool = moves.filter((id) => usable(id, ai));
    if (!pool.length) return moves[0];

    // Tier 1 (Rookie): uniform-random among damaging moves (else any usable)
    if (tier === 1) {
      const dmg = pool.filter((id) => MOVES[id].power > 0);
      const src = dmg.length ? dmg : pool;
      return src[Math.floor(rng() * src.length)];
    }

    // Tier 5 (Master): predictive — take a guaranteed KO, else best EV; set
    // up only when safe.
    if (tier === 5 && ai.self && ai.foe) {
      let best = null, bestDmg = -1;
      for (const id of pool) {
        if (!MOVES[id].power) continue;
        const d = estimateDamage(ai.self, ai.foe, MOVES[id]);
        if (d > bestDmg) { bestDmg = d; best = id; }
      }
      if (best) {
        if (bestDmg >= ai.foe.hp) return best; // lethal — take it now
        const setup = pool.find((id) => MOVES[id].effect === 'atkDown');
        if (setup && ai.foe.hp > ai.foe.maxHp * 0.6 && (ai.atkStage || 0) > -1 && rng() < 0.5) return setup;
        return best;
      }
    }

    // Tiers 2/3/4: weighted selection with escalating smarts.
    const w = [];
    for (const id of pool) {
      const mv = MOVES[id];
      let weight;
      if (mv.effect === 'atkDown') {
        weight = (tier >= 3)
          ? ((ai.foeHpFrac > 0.6 && (ai.atkStage || 0) > -1) ? 0.6 : 0) // set up only while the foe is healthy
          : ((ai.atkStage <= -6 || ai.foeHpFrac < 0.25) ? 0 : 0.22);    // legacy gate
      } else {
        weight = 0.4 + (mv.power || 0) / 220; // favor stronger moves
        if (tier >= 3 && ai.foe) {            // STAB / type awareness
          weight *= typeEff(mv.type, ai.foe.type);
          if (ai.self && mv.type === ai.self.type) weight *= 1.3;
        }
        if (tier >= 4 && (ai.pp[id] || 0) <= 1 && ai.foeHpFrac > 0.5) weight *= 0.4; // conserve a low-PP nuke
      }
      if (weight > 0) w.push([id, weight]);
    }
    if (!w.length) return pool[0];
    let total = 0; for (const [, x] of w) total += x;
    let roll = rng() * total;
    for (const [id, x] of w) { roll -= x; if (roll <= 0) return id; }
    return w[w.length - 1][0];
  }

  // trim a species' moveset for low difficulties (damaging moves first, then
  // status) so lower tiers field less attack-pattern diversity.
  function enemyMovepool(moves, n) {
    const dmg = [], status = [];
    for (const id of moves) {
      const mv = MOVES[id];
      if (!mv || mv.effect === 'transform') continue;
      (mv.power > 0 ? dmg : status).push(id);
    }
    const ordered = dmg.concat(status);
    return ordered.slice(0, Math.max(1, Math.min(n, ordered.length)));
  }

  // matchup quality of selfType attacking/defending foeType (>1 favorable)
  function matchupScore(selfType, foeType) {
    return typeEff(selfType, foeType) / Math.max(0.5, typeEff(foeType, selfType));
  }

  /* tiers 4/5 only: should the active enemy pivot to a better-matched bench
     mon? self:{type,hpFrac}, foe:{type}, bench:[{idx,type,alive}]. Returns a
     bench index or -1. */
  function aiShouldSwitch(self, foe, bench, tier, rng) {
    if (tier < 4 || !bench || !bench.length) return -1;
    if (self.hpFrac < 0.35) return -1;          // too risky to pivot when low
    const cur = matchupScore(self.type, foe.type);
    if (cur >= 1) return -1;                     // already neutral/winning
    let best = -1, bestScore = cur;
    for (const b of bench) {
      if (!b.alive) continue;
      const s = matchupScore(b.type, foe.type);
      if (s > bestScore) { bestScore = s; best = b.idx; }
    }
    if (best < 0) return -1;
    return rng() < (tier >= 5 ? 0.85 : 0.55) ? best : -1;
  }

  const MSG = {
    challenge: '{T} would like to battle!',
    sentOut: '{T} sent out {M}!',
    go: 'Go! {A}!',
    comeBack: '{A}, come back!',
    used: '{A} used {M}!',
    miss: "{A}'s attack missed!",
    crit: 'A critical hit!',
    superEff: "It's super effective!",
    resist: "It's not very effective...",
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
    expGain: 'Each ally gained {E} EXP. Points!',
    levelUp: '{A} grew to Lv. {L}!',
    askSwitch: 'Will you switch your {A}?',
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
    // opening tutorial (the giant, COLOSSUS)
    giantAppear: 'A colossal shape tears through the dark!',
    giantReveal: 'COLOSSUS towers over you, eyes ablaze!',
    giantEnrage: '{A} roars - its ruinous power surges!',
    giantCharge: '{A} is gathering ruinous power!',
    foeRecall: '{T} pulled back {A}!',
    // overworld options / saves
    saved: 'Game saved!',
    codeCopied: 'Save code copied!',
    codePasted: 'Save code loaded!',
    codeBad: 'That code was not valid.',
    cloudOff: 'Cloud sync is off.',
    cloudPushed: 'Synced to cloud.',
    cloudPulled: 'Pulled from cloud.',
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

  /* opening-sequence monologue + UI copy. Player lines are voiced by the
     typewriter AND shown as text. ASCII only (no ellipsis/curly glyphs); the
     name beat is built by concatenation so no '{}' reaches the pixel font. */
  const STORY = {
    title: 'GROVE CLASH',
    subtitle: 'A VOXEL SAGA',
    pressStart: 'Press any key',
    skipHint: 'X: Skip',
    wakeWhere: 'where am I.....',
    wakeHelp: 'there is no time for this, I better help that guy',
    faintAgain: "Man... I fainted again..... 'guess I should find my way out of this place first, I wonder if the big guy is ok.....",
    namePrompt: 'What should they call you?',
    nameBeatPre: 'So... ',
    nameBeatPost: '. That feels right.',
  };

  return { SPECIES, MOVES, ITEMS, statsFor, stageMul, damage, estimateDamage,
           captureChance, aiPick, enemyMovepool, aiShouldSwitch, typeEff,
           DIFFICULTY, MAXLV, expReward, expToNext, MSG, STORY, fmt, DIALOGUE };
})();
