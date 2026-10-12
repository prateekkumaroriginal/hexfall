import { describe, expect, it } from 'vitest';
import { FrameSchedule } from './frame-schedule';

describe('render cadence', () => {
  it.each([60, 90, 120, 144])('keeps 60 frames per second on a %i Hz display', (refresh) => {
    const schedule = new FrameSchedule(0.75);
    let frames = 0;
    for (let i = 0; i < refresh * 10; i++) frames += Number(schedule.due((i * 1000) / refresh, 60));
    expect(frames).toBe(600);
  });
  it('keeps the target cadence when successive RAF timestamps jitter', () => {
    const schedule = new FrameSchedule(0.75);
    let frames = 0;
    for (let i = 0; i < 600; i++)
      frames += Number(schedule.due((i * 1000) / 60 + (i % 2 ? 0.4 : -0.4), 60));
    expect(frames).toBe(600);
  });
  it('does not catch up with extra renders after a long stall', () => {
    const schedule = new FrameSchedule(0.75);
    expect(schedule.due(0, 60)).toBe(true);
    expect(schedule.due(1000, 60)).toBe(true);
    expect(schedule.due(1001, 60)).toBe(false);
    expect(schedule.due(1016.67, 60)).toBe(true);
  });
  it('retains the 30 Hz menu limit and starts a new cadence immediately', () => {
    const schedule = new FrameSchedule(0.75);
    expect(schedule.due(0, 30)).toBe(true);
    expect(schedule.due(16.67, 30)).toBe(false);
    expect(schedule.due(33.33, 30)).toBe(true);
    expect(schedule.due(34, 60)).toBe(true);
    schedule.reset();
    expect(schedule.due(35, 60)).toBe(true);
  });
});
