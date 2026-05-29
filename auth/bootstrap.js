// /new — Standalone Production Runtime
// auth/bootstrap.js — Auth initialization.

import { restoreSession } from './sessionService.js';

export async function initV2Auth() {
  const session = await restoreSession();
  return session;
}
