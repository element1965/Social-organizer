import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createResolutionState,
  measureCadence,
  resetResolution,
  updateResolution,
} from '../src/components/landing/adaptive-resolution.ts';

const hz60 = 16.667;
const hz30 = 1000 / 30;
const hz20 = 50;

function controller(cadence = hz60) {
  let state = createResolutionState(measureCadence([
    cadence * 2, cadence, cadence, cadence, cadence * 3, cadence, cadence, cadence, cadence,
  ]));
  let now = 0;
  return {
    get tier() { return state.tier; },
    window(frameTime, alternatingTime = frameTime, stalledFrameTime = frameTime) {
      const frames = Array.from({ length: Math.ceil(1500 / ((frameTime + alternatingTime) / 2)) },
        (_, index) => index % 2 ? frameTime : alternatingTime);
      frames[0] = stalledFrameTime;
      now += frames.reduce((sum, elapsed) => sum + elapsed, 0);
      state = updateResolution(state, frames, now, 2);
      return state.tier;
    },
    conditionsChanged() { state = resetResolution(state); },
  };
}

test('steady 60 Hz stays at full resolution despite occasional stalls', () => {
  const resolution = controller();
  for (let i = 0; i < 10; i++) {
    assert.equal(resolution.window(hz60, hz60, 180), 0);
  }
});

test('a cheap scene capped at 30 Hz stays at full resolution', () => {
  const resolution = controller(hz30);
  for (let i = 0; i < 12; i++) assert.equal(resolution.window(hz30), 0);
});

test('a new 30 Hz cap reverts a downgrade that produces no measurable gain', () => {
  const resolution = controller();
  assert.equal(resolution.window(hz30), 1);
  assert.equal(resolution.window(hz30), 0);
  for (let i = 0; i < 30; i++) assert.equal(resolution.window(hz30), 0);
});

test('sustained GPU overload keeps each lower tier that improves frame time', () => {
  const resolution = controller();
  assert.equal(resolution.window(hz20), 1);
  assert.equal(resolution.window(hz30), 1);
  assert.equal(resolution.window(hz30), 2);
  assert.equal(resolution.window(hz60), 2);
});

test('returns to full resolution once overload clears', () => {
  const resolution = controller();
  assert.equal(resolution.window(hz30), 1);
  assert.equal(resolution.window(hz60), 1);
  for (let i = 0; i < 5; i++) assert.equal(resolution.window(hz60), 1);
  assert.equal(resolution.window(hz60), 0);
  assert.equal(resolution.window(hz60), 0);
});

test('alternating frame load cannot cause repeated probes after a failed upgrade', () => {
  const resolution = controller();
  assert.equal(resolution.window(hz60, hz30), 1);
  assert.equal(resolution.window(hz60), 1);
  for (let i = 0; i < 5; i++) assert.equal(resolution.window(hz60), 1);
  assert.equal(resolution.window(hz60), 0);
  assert.equal(resolution.window(hz60, hz30), 1);
  for (let i = 0; i < 80; i++) assert.equal(resolution.window(hz60), 1);
  resolution.conditionsChanged();
  for (let i = 0; i < 6; i++) assert.equal(resolution.window(hz60), 1);
  assert.equal(resolution.window(hz60), 0);
});

test('repeated failed upgrades increase the wait even after a resize or visibility change', () => {
  const resolution = controller();
  assert.equal(resolution.window(hz30), 1);
  assert.equal(resolution.window(hz60), 1);
  for (let failure = 0; failure < 2; failure++) {
    for (let i = 0; i < (failure === 0 ? 5 : 7); i++) assert.equal(resolution.window(hz60), 1);
    assert.equal(resolution.window(hz60), 0);
    assert.equal(resolution.window(hz30), 1);
    resolution.conditionsChanged();
  }
  for (let i = 0; i < 15; i++) assert.equal(resolution.window(hz60), 1);
  assert.equal(resolution.window(hz60), 0);
});
