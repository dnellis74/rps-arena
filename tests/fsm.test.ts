import { describe, expect, it } from 'vitest'
import {
  createMatch,
  loadGameData,
  PuckStates,
  stepMatch,
} from '../src/sim/index.ts'
import { killPuck, spawnPuck } from '../src/sim/world.ts'

const data = loadGameData()

function emptyMatch(seed = 1) {
  return createMatch({
    ...data,
    mode: 'damage',
    seed,
    opponent: () => null,
  })
}

function stateOf(match: ReturnType<typeof createMatch>, eid: number) {
  return match.world.components.State[eid]
}

/** Tests that chain transitions skip the rate limit unless testing it. */
function allowStateChange(
  match: ReturnType<typeof createMatch>,
  eid: number,
): void {
  match.world.components.StateChangeCooldown[eid] = 0
}

function steps(match: ReturnType<typeof createMatch>, n: number) {
  for (let i = 0; i < n; i++) stepMatch(match)
}

describe('state machine transitions', () => {
  it('any: gang-up condition → Engaged on that predator', () => {
    const match = emptyMatch()
    // threshold for rock vs paper is 4; place self + 3 rocks in gang radius.
    const self = spawnPuck(match.world, { x: 20, y: 37.5, team: 0, type: 'rock' })
    spawnPuck(match.world, { x: 20.3, y: 37.5, team: 0, type: 'rock' })
    spawnPuck(match.world, { x: 20, y: 37.8, team: 0, type: 'rock' })
    spawnPuck(match.world, { x: 20.3, y: 37.8, team: 0, type: 'rock' })
    const paper = spawnPuck(match.world, {
      x: 21,
      y: 37.5,
      team: 1,
      type: 'paper',
    })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Engaged)
    expect(match.world.components.TargetEid[self]).toBe(paper)
    expect(match.world.stateMetrics.transitions['any:gangup']).toBeGreaterThan(0)
  })

  it('hunting: predator in enter radius → Retreating', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 10, y: 37.5, team: 0, type: 'rock' })
    spawnPuck(match.world, { x: 12, y: 37.5, team: 1, type: 'paper' })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Retreating)
    expect(
      match.world.stateMetrics.transitions['hunting:predator'],
    ).toBeGreaterThan(0)
  })

  it('hunting: finish prey → Engaged with that prey', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 10, y: 37.5, team: 0, type: 'rock' })
    const prey = spawnPuck(match.world, {
      x: 11,
      y: 37.5,
      team: 1,
      type: 'scissors',
    })
    // Predator farther: finish prey applies (1 <= 4 * 1.25).
    spawnPuck(match.world, { x: 14, y: 37.5, team: 1, type: 'paper' })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Engaged)
    expect(match.world.components.TargetEid[self]).toBe(prey)
    expect(
      match.world.stateMetrics.transitions['hunting:finishPrey'],
    ).toBeGreaterThan(0)
  })

  it('hunting: prey within engage radius → Engaged', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 10, y: 37.5, team: 0, type: 'rock' })
    const prey = spawnPuck(match.world, {
      x: 11.5,
      y: 37.5,
      team: 1,
      type: 'scissors',
    })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Engaged)
    expect(match.world.components.TargetEid[self]).toBe(prey)
    expect(
      match.world.stateMetrics.transitions['hunting:engage'],
    ).toBeGreaterThan(0)
  })

  it('engaged: target death → Regrouping', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 10, y: 37.5, team: 0, type: 'rock' })
    const prey = spawnPuck(match.world, {
      x: 11.2,
      y: 37.5,
      team: 1,
      type: 'scissors',
    })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Engaged)
    killPuck(match.world, prey)
    allowStateChange(match, self)
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Regrouping)
    expect(
      match.world.stateMetrics.transitions['engaged:targetDead'],
    ).toBeGreaterThan(0)
  })

  it('engaged: low HP → Retreating', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 10, y: 37.5, team: 0, type: 'rock' })
    spawnPuck(match.world, { x: 11.2, y: 37.5, team: 1, type: 'scissors' })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Engaged)
    match.world.components.Hp[self] = 1
    allowStateChange(match, self)
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Retreating)
    expect(
      match.world.stateMetrics.transitions['engaged:lowHp'],
    ).toBeGreaterThan(0)
  })

  it('engaged: timeout → Regrouping', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 10, y: 37.5, team: 0, type: 'rock' })
    spawnPuck(match.world, { x: 11.5, y: 37.5, team: 1, type: 'scissors' })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Engaged)
    match.world.components.TimeInState[self] = match.world.tuning.engageMaxTime
    allowStateChange(match, self)
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Regrouping)
    expect(
      match.world.stateMetrics.transitions['engaged:timeout'],
    ).toBeGreaterThan(0)
  })

  it('engaged: other predator and finish prey fails → Retreating', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 20, y: 37.5, team: 0, type: 'rock' })
    const prey = spawnPuck(match.world, {
      x: 21.5,
      y: 37.5,
      team: 1,
      type: 'scissors',
    })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Engaged)
    expect(match.world.components.TargetEid[self]).toBe(prey)
    // Close predator (paper), prey now farther than finish band.
    match.world.components.Position.x[prey] = 28
    spawnPuck(match.world, { x: 21, y: 37.5, team: 1, type: 'paper' })
    allowStateChange(match, self)
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Retreating)
    expect(
      match.world.stateMetrics.transitions['engaged:predator'],
    ).toBeGreaterThan(0)
  })

  it('retreating: within support-ally radius → Regrouping', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, {
      x: 10,
      y: 37.5,
      team: 0,
      type: 'scissors',
    })
    // Rock predator → offensive support is paper.
    spawnPuck(match.world, { x: 12, y: 37.5, team: 1, type: 'rock' })
    spawnPuck(match.world, { x: 10.5, y: 37.5, team: 0, type: 'paper' })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Retreating)
    allowStateChange(match, self)
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Regrouping)
    expect(
      match.world.stateMetrics.transitions['retreating:support'],
    ).toBeGreaterThan(0)
  })

  it('retreating: predator beyond exit radius → Regrouping', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 10, y: 37.5, team: 0, type: 'rock' })
    const paper = spawnPuck(match.world, {
      x: 14,
      y: 37.5,
      team: 1,
      type: 'paper',
    })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Retreating)
    match.world.components.Position.x[paper] = 30
    allowStateChange(match, self)
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Regrouping)
    expect(
      match.world.stateMetrics.transitions['retreating:clear'],
    ).toBeGreaterThan(0)
  })

  it('regrouping: predator in enter radius → Retreating', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 10, y: 37.5, team: 0, type: 'rock' })
    match.world.components.State[self] = PuckStates.Regrouping
    match.world.components.TimeInState[self] = 0
    spawnPuck(match.world, { x: 12, y: 37.5, team: 1, type: 'paper' })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Retreating)
    expect(
      match.world.stateMetrics.transitions['regrouping:predator'],
    ).toBeGreaterThan(0)
  })

  it('regrouping: lockout expired and prey in engage radius → Engaged', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 10, y: 37.5, team: 0, type: 'rock' })
    match.world.components.State[self] = PuckStates.Regrouping
    match.world.components.TimeInState[self] = 0
    match.world.components.ReengageLockout[self] = 0
    const prey = spawnPuck(match.world, {
      x: 11.5,
      y: 37.5,
      team: 1,
      type: 'scissors',
    })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Engaged)
    expect(match.world.components.TargetEid[self]).toBe(prey)
    expect(
      match.world.stateMetrics.transitions['regrouping:engage'],
    ).toBeGreaterThan(0)
  })

  it('regrouping: timeout → Advancing', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 10, y: 37.5, team: 0, type: 'rock' })
    match.world.components.State[self] = PuckStates.Regrouping
    match.world.components.TimeInState[self] = match.world.tuning.regroupMaxTime
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Advancing)
    expect(
      match.world.stateMetrics.transitions['regrouping:timeout'],
    ).toBeGreaterThan(0)
  })

  it('re-engage lockout blocks Engaged but not gang-up', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 20, y: 37.5, team: 0, type: 'rock' })
    match.world.components.State[self] = PuckStates.Regrouping
    match.world.components.ReengageLockout[self] = 1.0
    spawnPuck(match.world, { x: 21.5, y: 37.5, team: 1, type: 'scissors' })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Regrouping)

    // Gang-up still allowed while locked out.
    spawnPuck(match.world, { x: 20.3, y: 37.5, team: 0, type: 'rock' })
    spawnPuck(match.world, { x: 20, y: 37.8, team: 0, type: 'rock' })
    spawnPuck(match.world, { x: 20.3, y: 37.8, team: 0, type: 'rock' })
    const paper = spawnPuck(match.world, {
      x: 21,
      y: 37.5,
      team: 1,
      type: 'paper',
    })
    // Keep lockout active.
    match.world.components.ReengageLockout[self] = 1.0
    allowStateChange(match, self)
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Engaged)
    expect(match.world.components.TargetEid[self]).toBe(paper)
  })

  it('separation does not push away from Engaged target', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 10, y: 37.5, team: 0, type: 'rock' })
    const prey = spawnPuck(match.world, {
      x: 10.8,
      y: 37.5,
      team: 1,
      type: 'scissors',
    })
    // Same-tier neighbor that would normally separate.
    spawnPuck(match.world, { x: 10.2, y: 37.7, team: 0, type: 'rock' })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Engaged)
    expect(match.world.components.TargetEid[self]).toBe(prey)
    const x0 = match.world.components.Position.x[self]!
    // Several steps: velocity should stay toward prey (+x), not be dominated
    // by separation away from overlapping ally.
    steps(match, 5)
    const vx = match.world.components.Velocity.x[self]!
    expect(vx).toBeGreaterThan(0)
    expect(match.world.components.Position.x[self]!).toBeGreaterThanOrEqual(x0)
  })

  it('limits state changes to maxStateChangesPerSecond', () => {
    const match = emptyMatch()
    const self = spawnPuck(match.world, { x: 10, y: 37.5, team: 0, type: 'rock' })
    const paper = spawnPuck(match.world, {
      x: 12,
      y: 37.5,
      team: 1,
      type: 'paper',
    })
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Retreating)
    // Predator leaves exit range, but rate limit should block Regrouping.
    match.world.components.Position.x[paper] = 40
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Retreating)
    expect(match.world.components.StateChangeCooldown[self]!).toBeGreaterThan(0)

    match.world.components.StateChangeCooldown[self] = 0
    stepMatch(match)
    expect(stateOf(match, self)).toBe(PuckStates.Regrouping)
  })
})
