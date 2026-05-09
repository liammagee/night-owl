function isDebugLoggingEnabled(namespace) {
  const raw = process.env.NIGHTOWL_DEBUG_LOGS || '';
  if (!raw) return false;
  const enabled = raw.split(',').map(value => value.trim()).filter(Boolean);
  return enabled.includes('*') || enabled.includes(namespace);
}

function createDebugLogger(namespace) {
  return (...args) => {
    if (isDebugLoggingEnabled(namespace)) {
      console.log(`[${namespace}]`, ...args);
    }
  };
}

module.exports = {
  createDebugLogger,
  isDebugLoggingEnabled
};
