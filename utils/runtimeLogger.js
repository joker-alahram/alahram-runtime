/* utils/runtimeLogger.js */

export function startLog(stage, payload = {}) {
  const logMsg = `[runtime] ${stage}_start: ${JSON.stringify(payload)}`;
  console.log(logMsg);
  if (typeof window !== 'undefined') {
    if (!window.__runtime_logs) window.__runtime_logs = [];
    window.__runtime_logs.push({ timestamp: new Date().toISOString(), event: `${stage}_start`, ...payload });
  }
}

export function endLog(stage, payload = {}) {
  const logMsg = `[runtime] ${stage}_end: ${JSON.stringify(payload)}`;
  console.log(logMsg);
  if (typeof window !== 'undefined') {
    if (!window.__runtime_logs) window.__runtime_logs = [];
    window.__runtime_logs.push({ timestamp: new Date().toISOString(), event: `${stage}_end`, ...payload });
  }
}
