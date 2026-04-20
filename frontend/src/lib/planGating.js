/**
 * Plan detection for current BYOK architecture.
 * FMP API key holders = Pro; no-key demo users = Free.
 *
 * Replace with a real auth/plan check when payments are added
 * (e.g. check a JWT claim or a Lemon Squeezy license key in localStorage).
 */
import { hasFmpKey } from './fmpKey.js';

export function isPro() {
  return hasFmpKey();
}
