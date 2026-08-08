/**
 * Small cross-process ownership registry for timers, listeners, observers,
 * watchers, processes, servers, and other disposable resources.
 */
(function (root, factory) {
  const api = factory();
  if (root) root.NightOwlResourceLifecycle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function createModule() {
  'use strict';

  let registrySequence = 0;
  const activeRegistries = new Map();

  function toDisposer(resource, explicitDisposer) {
    if (typeof explicitDisposer === 'function') return () => explicitDisposer(resource);
    if (typeof resource === 'function') return resource;
    for (const method of ['dispose', 'disconnect', 'close', 'kill', 'stop']) {
      if (typeof resource?.[method] === 'function') return () => resource[method]();
    }
    throw new TypeError('Owned resource needs a disposer or disposable method');
  }

  function createRegistry(options = {}) {
    const name = String(options.name || `registry-${registrySequence + 1}`);
    const scope = String(options.scope || 'feature');
    const registryId = `${name}:${++registrySequence}`;
    const onError = options.onError || (() => {});
    const setIntervalFn = options.setInterval || setInterval;
    const clearIntervalFn = options.clearInterval || clearInterval;
    const setTimeoutFn = options.setTimeout || setTimeout;
    const clearTimeoutFn = options.clearTimeout || clearTimeout;
    const entries = new Map();
    let entrySequence = 0;
    let disposed = false;

    function add(disposer, metadata = {}) {
      if (typeof disposer !== 'function') throw new TypeError('Resource disposer must be a function');
      if (disposed) {
        try {
          disposer();
        } catch (error) {
          onError(error, { name, scope, type: String(metadata.type || 'disposable'), label: String(metadata.label || '') });
        }
        return () => false;
      }

      const id = ++entrySequence;
      const entry = {
        id,
        type: String(metadata.type || 'disposable'),
        label: String(metadata.label || ''),
        disposer
      };
      entries.set(id, entry);

      return function release({ dispose = true } = {}) {
        if (!entries.delete(id)) return false;
        if (dispose) {
          try {
            disposer();
          } catch (error) {
            onError(error, { name, scope, ...entry });
          }
        }
        return true;
      };
    }

    function track(resource, metadata = {}) {
      add(toDisposer(resource, metadata.dispose), metadata);
      return resource;
    }

    function interval(callback, delay, ...args) {
      const handle = setIntervalFn(callback, delay, ...args);
      add(() => clearIntervalFn(handle), { type: 'timer', label: `interval:${delay}` });
      return handle;
    }

    function timeout(callback, delay, ...args) {
      let release = null;
      const handle = setTimeoutFn(() => {
        release?.({ dispose: false });
        callback(...args);
      }, delay);
      release = add(() => clearTimeoutFn(handle), { type: 'timer', label: `timeout:${delay}` });
      return handle;
    }

    function listen(target, eventName, handler, listenerOptions) {
      if (!target?.addEventListener || !target?.removeEventListener) {
        throw new TypeError('Listener target must implement addEventListener/removeEventListener');
      }
      target.addEventListener(eventName, handler, listenerOptions);
      add(
        () => target.removeEventListener(eventName, handler, listenerOptions),
        { type: 'listener', label: String(eventName) }
      );
      return handler;
    }

    function observe(observer, target, observerOptions) {
      if (!observer?.observe || !observer?.disconnect) {
        throw new TypeError('Observer must implement observe/disconnect');
      }
      observer.observe(target, observerOptions);
      return track(observer, { type: 'observer', label: observer.constructor?.name || 'observer' });
    }

    function getSnapshot() {
      const byType = {};
      for (const entry of entries.values()) {
        byType[entry.type] = (byType[entry.type] || 0) + 1;
      }
      return {
        id: registryId,
        name,
        scope,
        disposed,
        active: entries.size,
        byType
      };
    }

    function dispose() {
      if (disposed) return { disposed: false, errors: [] };
      disposed = true;
      const errors = [];
      const resources = Array.from(entries.values()).reverse();
      entries.clear();
      for (const entry of resources) {
        try {
          entry.disposer();
        } catch (error) {
          errors.push(error);
          onError(error, { name, scope, ...entry });
        }
      }
      activeRegistries.delete(registryId);
      return { disposed: true, errors };
    }

    const registry = {
      add,
      dispose,
      getSnapshot,
      interval,
      isDisposed: () => disposed,
      listen,
      observe,
      timeout,
      track
    };
    activeRegistries.set(registryId, registry);
    return registry;
  }

  function getDiagnostics() {
    const registries = Array.from(activeRegistries.values(), registry => registry.getSnapshot());
    const byType = {};
    for (const registry of registries) {
      for (const [type, count] of Object.entries(registry.byType)) {
        byType[type] = (byType[type] || 0) + count;
      }
    }
    return {
      activeRegistries: registries.length,
      activeResources: registries.reduce((sum, registry) => sum + registry.active, 0),
      byType,
      registries
    };
  }

  function disposeAll() {
    const results = [];
    for (const registry of Array.from(activeRegistries.values())) {
      results.push(registry.dispose());
    }
    return results;
  }

  return { createRegistry, disposeAll, getDiagnostics };
});
