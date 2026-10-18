import { escalateDue } from './leads.js';

/**
 * The engine that makes the promise real: a lead nobody acknowledges is escalated
 * without anyone clicking anything.
 *
 * A single interval for the whole process; each tick is cheap because `dueSteps` is a
 * pure comparison against the deadline. `ESCALATION_TICK_MS` exists so a demo can run
 * with a two-second tick and thirty-second timers.
 */
const INTERVAL_MS = Number(process.env.ESCALATION_TICK_MS || 5000);

let timer = null;
let running = false;

export function startEscalationTicker() {
  if (timer) return;

  timer = setInterval(async () => {
    if (running) return;

    running = true;

    try {
      const applied = await escalateDue();

      if (applied.length > 0) {
        console.log(`[escalation] applied ${applied.length} step(s)`);
      }
    } catch (error) {
      console.error(`[escalation] tick failed: ${error.message}`);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);

  // Never hold the process open on shutdown.
  timer.unref?.();

  console.log(`[escalation] watching acknowledgements every ${INTERVAL_MS}ms`);
}

export function stopEscalationTicker() {
  if (timer) clearInterval(timer);
  timer = null;
}
