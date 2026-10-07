#!/usr/bin/env node
'use strict';

// One-time migration helper. It reads the previously deployed route modules,
// extracts only their data constants, and writes a local Apps Script module.
// The generated file must never be committed to the public repository.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function fail(message) {
  process.stderr.write(`Private route migration failed: ${message}\n`);
  process.exit(1);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function exportConstant(file, constantName) {
  if (!file || !fs.existsSync(file)) fail(`missing source file: ${file || constantName}`);
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes(constantName)) fail(`${path.basename(file)} does not contain ${constantName}`);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}\n;this.__BUS70_EXPORTED_DATA__ = ${constantName};`, context, {filename:file});
  return JSON.parse(JSON.stringify(context.__BUS70_EXPORTED_DATA__));
}

function exportShiftConfig(file) {
  if (!file || !fs.existsSync(file)) fail(`missing source file: ${file || 'manager module'}`);
  const source = fs.readFileSync(file, 'utf8');
  const anchor = source.match(/bus70ManagerDaysBetween_\(\s*['"](\d{4}-\d{2}-\d{2})['"]\s*,\s*date\s*\)/);
  const shifts = source.match(/===\s*0\s*\?\s*['"]([AB])['"]\s*:\s*['"]([AB])['"]/);
  if (!anchor || !shifts || shifts[1] === shifts[2]) {
    fail(`${path.basename(file)} does not contain a migratable shift anchor`);
  }
  const bootstrapAccounts=[];
  const accountPattern=/upsertAccount\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g;
  let account;
  while((account=accountPattern.exec(source))!==null){
    bootstrapAccounts.push({accountId:account[1],role:account[2],driverId:account[3],loginName:account[4],initialPassword:account[5],note:account[6]});
  }
  if(!bootstrapAccounts.length)fail(`${path.basename(file)} does not contain migratable bootstrap accounts`);
  const driverOnly=source.match(/if\s*\(\s*id\s*===\s*'([^']+)'\s*\)\s*return\s*''/);
  return {shiftAnchorDate:anchor[1],shiftAnchor:shifts[1],bootstrapAccounts:bootstrapAccounts,driverOnlyIds:driverOnly?[driverOnly[1]]:[]};
}

const route5File = argument('--route5');
const route70File = argument('--route70');
const managerFile = argument('--manager');
const outputFile = argument('--output');
if (!outputFile) fail('--output is required');
if (fs.existsSync(outputFile) && !process.argv.includes('--force')) fail(`output already exists: ${outputFile}`);

const routes = {
  config: exportShiftConfig(managerFile),
  '5': exportConstant(route5File, 'BUS70_ROUTE5_REFERENCE_'),
  '70': exportConstant(route70File, 'BUS70_ROUTE70_REFERENCE_')
};
const payload = `/* PRIVATE OPERATION DATA - DO NOT COMMIT */\nvar BUS70_PRIVATE_ROUTE_DATA_ = ${JSON.stringify(routes, null, 2)};\n`;
fs.writeFileSync(outputFile, payload, {encoding:'utf8', mode:0o600});
process.stdout.write(`Private route data migrated to ${path.basename(outputFile)}.\n`);
