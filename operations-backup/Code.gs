/**
 * Optional standalone Apps Script project. Never paste into the public web app.
 * Configure only in private Script Properties; see README.md. Disabled by default.
 * Hourly changed-workbook snapshots, not a real-time replication log.
 */
function bus70BackupConfig_() {
  const p = PropertiesService.getScriptProperties();
  return { props: p, enabled: p.getProperty('BUS70_BACKUP_ENABLED') === 'true',
    source: p.getProperty('BUS70_BACKUP_SOURCE_ID') || '',
    folder: p.getProperty('BUS70_BACKUP_FOLDER_ID') || '',
    owner: (p.getProperty('BUS70_BACKUP_OWNER_EMAIL') || '').toLowerCase(),
    capacity: 240 };
}

function bus70BackupError_(code) { const e = new Error(code); e.backupCode = code; throw e; }

function bus70BackupPrivate_(item, owner) {
  const actualOwner = item.getOwner();
  if (!actualOwner || actualOwner.getEmail().toLowerCase() !== owner ||
      item.getSharingAccess() !== DriveApp.Access.PRIVATE ||
      item.getEditors().length || item.getViewers().length || item.isTrashed()) {
    bus70BackupError_('PRIVATE_OWNER_CHECK_FAILED');
  }
}

function bus70BackupResources_(c) {
  if (!c.source || !c.folder || !c.owner || c.source === c.folder) bus70BackupError_('CONFIG_REQUIRED');
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== c.owner) bus70BackupError_('OWNER_REQUIRED');
  const source = DriveApp.getFileById(c.source), folder = DriveApp.getFolderById(c.folder);
  if (source.getMimeType() !== MimeType.GOOGLE_SHEETS) bus70BackupError_('SOURCE_NOT_SHEET');
  bus70BackupPrivate_(source, c.owner);
  bus70BackupPrivate_(folder, c.owner);
  return { source: source, folder: folder };
}

function bus70BackupState_(c) {
  try { return JSON.parse(c.props.getProperty('BUS70_BACKUP_STATE') || '{}'); }
  catch (_) { bus70BackupError_('STATE_INVALID'); }
}

function bus70BackupSaveState_(c, state) {
  c.props.setProperty('BUS70_BACKUP_STATE', JSON.stringify(state));
}

/** Read-only preflight. Does not print IDs, email, names, or source content. */
function bus70BackupPreflight() {
  const c = bus70BackupConfig_();
  bus70BackupResources_(c);
  return { configured: true, enabled: c.enabled, mode: 'hourly-changes-and-daily-snapshot', maxSnapshots: c.capacity };
}

/** Call from this standalone project's editor after owner authorization. */
function bus70BackupInstall() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { status: 'busy' };
  try {
    const c = bus70BackupConfig_();
    bus70BackupResources_(c);
    if (!c.enabled) bus70BackupError_('BACKUP_NOT_ENABLED');
    const existing = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'bus70BackupTick'; });
    if (existing.length > 1) bus70BackupError_('DUPLICATE_TRIGGERS_REVIEW');
    if (!existing.length) ScriptApp.newTrigger('bus70BackupTick').timeBased().everyMinutes(15).create();
    return { status: existing.length ? 'already-installed' : 'installed', snapshotsVerified: false };
  } finally { lock.releaseLock(); }
}

/** Disable without deleting snapshots or other project triggers. */
function bus70BackupDisable() {
  PropertiesService.getScriptProperties().setProperty('BUS70_BACKUP_ENABLED', 'false');
  return { status: 'disabled', snapshotsPreserved: true };
}

/** Clock entry point: source/API changes are polled, not onEdit-dependent. */
function bus70BackupTick() {
  const c = bus70BackupConfig_();
  if (!c.enabled) return { status: 'disabled' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { status: 'busy' };
  let state = {}, now = Date.now();
  try {
    state = bus70BackupState_(c);
    // Isolate a replacement source or destination from the previous backup cursor.
    if (state.source !== c.source || state.folder !== c.folder) state = { source: c.source, folder: c.folder };
    if (Number(state.retryAfter || 0) > now) return { status: 'retry-wait' };
    const r = bus70BackupResources_(c), modified = r.source.getLastUpdated().getTime();
    const age = now - Number(state.lastSuccess || 0);
    if (!state.pendingCopy && state.lastSuccess && age < 3600000) return { status: 'interval-wait' };
    if (!state.pendingCopy && state.lastSuccess && modified <= Number(state.sourceModified || 0) && age < 86400000) return { status: 'unchanged' };
    let copy;
    if (state.pendingCopy) {
      // Retry the existing candidate, not another full copy after every verification failure.
      if (!Number.isFinite(Number(state.pendingModified))) bus70BackupError_('PENDING_STATE_INVALID');
      copy = DriveApp.getFileById(state.pendingCopy);
    } else {
      const prefix = 'BUS70_SNAPSHOT_' + c.source + '_', files = r.folder.getFiles();
      let count = 0;
      while (files.hasNext()) {
        const file = files.next();
        if (!file.isTrashed() && file.getName().indexOf(prefix) === 0 && ++count >= c.capacity) bus70BackupError_('CAPACITY_REVIEW_REQUIRED');
      }
      const name = prefix + Utilities.formatDate(new Date(now), 'Asia/Seoul', 'yyyyMMdd_HHmmss');
      copy = r.source.makeCopy(name, r.folder);
      // Record the candidate immediately so interrupted verification is visible to the owner.
      state.pendingCopy = copy.getId();
      state.pendingModified = modified;
      state.lastAttempt = now;
      bus70BackupSaveState_(c, state);
    }
    if (copy.getId() === c.source || copy.getMimeType() !== MimeType.GOOGLE_SHEETS) bus70BackupError_('COPY_INVALID');
    bus70BackupPrivate_(copy, c.owner);
    const parents = copy.getParents();
    let inFolder = false;
    while (parents.hasNext()) if (parents.next().getId() === c.folder) inFolder = true;
    if (!inFolder) bus70BackupError_('COPY_PARENT_MISMATCH');
    if (!SpreadsheetApp.openById(copy.getId()).getSheets().length) bus70BackupError_('COPY_UNREADABLE');
    state.lastCopy = copy.getId();
    state.lastSuccess = Date.now();
    // Keep the pre-copy revision: edits during copying remain eligible next time.
    state.sourceModified = Number(state.pendingModified);
    state.pendingCopy = '';
    delete state.pendingModified;
    state.failures = 0;
    state.retryAfter = 0;
    state.errorCode = '';
    bus70BackupSaveState_(c, state);
    return { status: 'snapshot-created', verified: 'private-readable-copy', fullRestoreTested: false };
  } catch (error) {
    state.failures = Number(state.failures || 0) + 1;
    state.lastAttempt = now;
    state.errorCode = error.backupCode || 'SERVICE_FAILURE';
    state.retryAfter = now + Math.min(240, 15 * Math.pow(2, Math.min(state.failures - 1, 4))) * 60000;
    bus70BackupSaveState_(c, state);
    // Only controlled error codes reach trigger execution logs and failure notifications.
    throw new Error('BUS70_BACKUP_' + state.errorCode);
  } finally { lock.releaseLock(); }
}

/** Owner-only editor helper; cursor IDs remain in private Script Properties. */
function bus70BackupStatus() {
  const c = bus70BackupConfig_(), state = bus70BackupState_(c);
  return { enabled: c.enabled, lastSuccess: state.lastSuccess || null,
    lastAttempt: state.lastAttempt || null, failures: state.failures || 0,
    retryAfter: state.retryAfter || null, errorCode: state.errorCode || '',
    pendingVerification: !!state.pendingCopy, fullRestoreTested: false };
}
