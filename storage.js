const KnightProgress = (() => {
  const key = 'knight-tour-puzzle.progress.v1';
  function load(storage) {
    try {
      const raw = storage.getItem(key);
      if (!raw) return { data: null, available: true };
      const data = JSON.parse(raw);
      return { data: data && data.version === 1 ? data : null, available: true };
    } catch {
      // Bad JSON is recoverable; a blocked storage API is reported on save.
      return { data: null, available: true };
    }
  }
  function save(storage, data) {
    try { storage.setItem(key, JSON.stringify({ ...data, version: 1 })); return true; }
    catch { return false; }
  }
  return { key, load, save };
})();
if (typeof module !== 'undefined') module.exports = KnightProgress;
