const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('operations-backup/Code.gs', 'utf8');

function fixture() {
  let now = Date.parse('2099-01-01T00:00:00Z'), modified = now - 1000;
  const owner = 'synthetic-owner@example.invalid';
  const props = new Map([['BUS70_BACKUP_ENABLED', 'true'], ['BUS70_BACKUP_SOURCE_ID', 'synthetic-source'],
    ['BUS70_BACKUP_FOLDER_ID', 'synthetic-folder'], ['BUS70_BACKUP_OWNER_EMAIL', owner]]);
  const copies = [], triggers = [], deleted = [], parentIds = ['synthetic-folder'];
  let calls = 0, failCopy = false, busy = false, releases = 0, privateAccess = 'PRIVATE', editors = [];
  const user = { getEmail: () => owner };
  const safe = () => ({ getOwner: () => user, getSharingAccess: () => privateAccess,
    getEditors: () => editors, getViewers: () => [], isTrashed: () => false });
  function iterator(items) { let i = 0; return { hasNext: () => i < items.length, next: () => items[i++] }; }
  const folder = { ...safe(), getFiles: () => iterator(copies) };
  const file = { ...safe(), getMimeType: () => 'sheet', getLastUpdated: () => new Date(modified),
    makeCopy(name, destination) {
      assert.strictEqual(destination, folder); calls++;
      if (failCopy) throw new Error('secret service details must never be logged');
      const id = 'synthetic-copy-' + calls;
      const copy = { ...safe(), getId: () => id, getName: () => name, getMimeType: () => 'sheet',
        getParents: () => iterator(parentIds.map(id => ({ getId: () => id }))) };
      copies.push(copy); return copy;
    } };
  class Clock extends Date { static now() { return now; } }
  const c = { Date: Clock, Error, Number, String, Math, JSON,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) || null, setProperty: (k, v) => props.set(k, v) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => !busy, releaseLock: () => releases++ }) },
    Session: { getEffectiveUser: () => user }, MimeType: { GOOGLE_SHEETS: 'sheet' },
    DriveApp: { Access: { PRIVATE: 'PRIVATE' }, getFileById: id => { if (id === props.get('BUS70_BACKUP_SOURCE_ID')) return file; const found = copies.find(x => x.getId && x.getId() === id); assert(found); return found; }, getFolderById: id => { assert.equal(id, props.get('BUS70_BACKUP_FOLDER_ID')); return folder; } },
    Utilities: { formatDate: () => String(now) },
    SpreadsheetApp: { openById: id => { assert(copies.some(x => x.getId() === id)); return { getSheets: () => ['synthetic-sheet'] }; } },
    ScriptApp: { getProjectTriggers: () => triggers,
      newTrigger: handler => ({ timeBased: () => ({ everyMinutes: m => ({ create: () => { assert.equal(m, 15); triggers.push({ getHandlerFunction: () => handler }); } }) }) }),
      deleteTrigger: t => deleted.push(t) } };
  vm.createContext(c); vm.runInContext(source, c);
  return { c, props, copies, triggers, deleted, parentIds, state: () => JSON.parse(props.get('BUS70_BACKUP_STATE') || '{}'),
    advance(ms, changed = false) { now += ms; if (changed) modified = now; },
    copyFails(value) { failCopy = value; }, privacy(value) { privateAccess = value; }, addEditor() { editors = ['other']; },
    lockBusy(value) { busy = value; }, calls: () => calls, releases: () => releases };
}

// No configuration or Drive access happens when disabled. Installation is opt-in/idempotent.
{
  const f = fixture(); f.props.set('BUS70_BACKUP_ENABLED', 'false');
  assert.equal(f.c.bus70BackupTick().status, 'disabled'); assert.equal(f.calls(), 0);
  assert.throws(() => f.c.bus70BackupInstall(), /BACKUP_NOT_ENABLED/); assert.equal(f.triggers.length, 0);
  f.props.set('BUS70_BACKUP_ENABLED', 'true');
  assert.equal(f.c.bus70BackupInstall().status, 'installed');
  assert.equal(f.c.bus70BackupInstall().status, 'already-installed'); assert.equal(f.triggers.length, 1);
  assert.equal(f.deleted.length, 0);
}
// Copy once per changed hour, always again after a day; scripts/API changes are detected without edit events.
{
  const f = fixture(); assert.equal(f.c.bus70BackupTick().status, 'snapshot-created');
  f.advance(15 * 60000, true); assert.equal(f.c.bus70BackupTick().status, 'interval-wait');
  f.advance(45 * 60000); assert.equal(f.c.bus70BackupTick().status, 'snapshot-created');
  f.advance(3600000); assert.equal(f.c.bus70BackupTick().status, 'unchanged');
  f.advance(23 * 3600000); assert.equal(f.c.bus70BackupTick().status, 'snapshot-created');
  assert.equal(f.calls(), 3); assert.equal(f.state().failures, 0); assert.equal(f.state().pendingCopy, '');
  assert.equal(f.c.bus70BackupStatus().fullRestoreTested, false);
}
// Reject a public/shared destination or source before copying; no privilege or sharing mutations.
for (const mutation of [f => f.privacy('ANYONE'), f => f.addEditor()]) {
  const f = fixture(); mutation(f);
  assert.throws(() => f.c.bus70BackupTick(), /PRIVATE_OWNER_CHECK_FAILED/);
  assert.equal(f.calls(), 0); assert.equal(f.state().lastSuccess, undefined);
}
// Failure does not move successful cursor; generic service details are not propagated.
{
  const f = fixture(); f.c.bus70BackupTick(); const before = f.state().lastSuccess;
  f.advance(3600000, true); f.copyFails(true);
  assert.throws(() => f.c.bus70BackupTick(), /^Error: BUS70_BACKUP_SERVICE_FAILURE$/);
  assert.equal(f.state().lastSuccess, before); assert.equal(f.state().failures, 1);
  assert.equal(f.c.bus70BackupTick().status, 'retry-wait');
  f.advance(15 * 60000); f.copyFails(false); assert.equal(f.c.bus70BackupTick().status, 'snapshot-created');
  assert.equal(f.state().failures, 0); assert.equal(f.releases(), 4);
}
// Reject a misplaced copy, retain its pending ID for investigation, and avoid marking success.
{
  const f = fixture(); f.parentIds[0] = 'wrong-parent';
  assert.throws(() => f.c.bus70BackupTick(), /COPY_PARENT_MISMATCH/);
  assert.equal(f.state().pendingCopy, 'synthetic-copy-1'); assert.equal(f.state().lastSuccess, undefined);
  const candidateRevision = f.state().pendingModified;
  f.advance(15 * 60000, true);
  assert.throws(() => f.c.bus70BackupTick(), /COPY_PARENT_MISMATCH/);
  assert.equal(f.calls(), 1); // Repeated validation failures cannot fill the folder with copies.
  f.advance(30 * 60000); f.parentIds[0] = 'synthetic-folder';
  assert.equal(f.c.bus70BackupTick().status, 'snapshot-created');
  assert.equal(f.calls(), 1); assert.equal(f.state().sourceModified, candidateRevision);
  f.advance(3600000); assert.equal(f.c.bus70BackupTick().status, 'snapshot-created');
  assert.equal(f.calls(), 2); // The source edit during retry was not lost behind a newer cursor.
}
// Bounded storage: do not delete any backups or make more copies at capacity.
{
  const f = fixture();
  for (let i = 0; i < 240; i++) f.copies.push({ isTrashed: () => false, getName: () => 'BUS70_SNAPSHOT_synthetic-source_' + i });
  assert.throws(() => f.c.bus70BackupTick(), /CAPACITY_REVIEW_REQUIRED/); assert.equal(f.calls(), 0);
}
// A configuration switch cannot reuse another source's revision cursor; lock contention skips safely.
{
  const f = fixture(); f.c.bus70BackupTick(); f.props.set('BUS70_BACKUP_SOURCE_ID', 'synthetic-replacement');
  assert.equal(f.c.bus70BackupTick().status, 'snapshot-created'); assert.equal(f.calls(), 2);
  f.lockBusy(true); assert.equal(f.c.bus70BackupTick().status, 'busy'); assert.equal(f.calls(), 2);
  f.c.bus70BackupDisable(); assert.equal(f.c.bus70BackupTick().status, 'disabled'); assert.equal(f.copies.length, 2);
}
console.log('Private backup: opt-in, privacy, change polling, retries, cursor isolation, capacity and no deletion passed');
