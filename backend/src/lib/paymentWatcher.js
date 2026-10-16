import { config } from '../config.js';
import { reconcilePayments } from './payments.js';

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;

  try {
    const { changed } = await reconcilePayments();

    if (changed.length > 0) {
      console.log(`[payments] settled ${changed.length} payment intent(s)`);
    }
  } catch (error) {
    console.error(`[payments] reconcile failed: ${error.message}`);
  } finally {
    running = false;
  }
}

/**
 * Background listener: polls Binance's deposit history and settles any intent
 * whose deposit has arrived. Read-only — it never moves funds.
 */
export function startPaymentWatcher() {
  if (timer) return;

  if (!config.binance.configured) {
    console.log('[payments] watcher disabled: Binance is not configured');
    return;
  }

  const everyMs = Math.max(10, config.payments.pollSeconds) * 1000;
  timer = setInterval(tick, everyMs);

  if (typeof timer.unref === 'function') timer.unref();

  console.log(
    `[payments] watching ${config.binance.coin} deposits on ${config.binance.network} every ${everyMs / 1000}s`,
  );

  void tick();
}

export function stopPaymentWatcher() {
  if (timer) clearInterval(timer);
  timer = null;
}
