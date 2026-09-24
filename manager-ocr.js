(function (root) {
  "use strict";

  function compact(value) {
    return String(value || "").normalize("NFKC").replace(/\s+/g, "");
  }

  function occurrence(text, value) {
    const needle = compact(value);
    if (!needle) return -1;
    return compact(text).indexOf(needle);
  }

  function distance(a, b) {
    a = compact(a); b = compact(b);
    const row = Array.from({length:b.length + 1}, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0]; row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const saved = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = saved;
      }
    }
    return row[b.length];
  }

  function fuzzyContains(text, value, tolerance) {
    const haystack = compact(text);
    const needle = compact(value);
    if (!needle) return false;
    if (haystack.includes(needle)) return true;
    const limit = tolerance == null ? (needle.length >= 3 ? 1 : 0) : tolerance;
    if (!limit) return false;
    for (let size = Math.max(1, needle.length - limit); size <= needle.length + limit; size++) {
      for (let i = 0; i + size <= haystack.length; i++) {
        if (distance(haystack.slice(i, i + size), needle) <= limit) return true;
      }
    }
    return false;
  }

  function orderedMatches(text, items, valueOf) {
    return items.map(item => ({item, position:occurrence(text, valueOf(item))}))
      .filter(match => match.position >= 0)
      .sort((a, b) => a.position - b.position)
      .map(match => match.item);
  }

  function timeDigits(value) {
    const match = String(value || "").match(/(\d{1,2})\D?(\d{2})/);
    return match ? String(Number(match[1])).padStart(2, "0") + match[2] : "";
  }

  function containsTime(text, value) {
    const expected = timeDigits(value);
    if (!expected) return true;
    const digits = String(text || "").replace(/\D/g, "");
    return digits.includes(expected) || digits.includes(String(Number(expected.slice(0, 2))) + expected.slice(2));
  }

  function suggest(boardText, timeText, sequences, drivers, vehicles, departures) {
    const matchedDrivers = orderedMatches(boardText, drivers, item => item.name);
    const matchedVehicles = orderedMatches(boardText, vehicles, item => item.last3);
    return sequences.map((sequence, index) => {
      const driver = matchedDrivers[index] || null;
      const vehicle = matchedVehicles[index] || null;
      const departure = departures[sequence] || {};
      return {
        sequence,
        driverId:driver ? driver.id : "",
        vehicleId:vehicle ? vehicle.id : "",
        driverMatched:Boolean(driver),
        vehicleMatched:Boolean(vehicle),
        timeMatched:containsTime(timeText, departure.time)
      };
    });
  }

  function verify(boardText, timeText, assignments, drivers, vehicles, departures) {
    const driverMap = Object.fromEntries(drivers.map(item => [item.id, item]));
    const vehicleMap = Object.fromEntries(vehicles.map(item => [item.id, item]));
    return assignments.map(assignment => {
      const driver = driverMap[assignment.driverId];
      const vehicle = vehicleMap[assignment.vehicleId];
      const departure = departures[assignment.sequence] || {};
      return {
        sequence:assignment.sequence,
        driverMatched:Boolean(driver && fuzzyContains(boardText, driver.name)),
        vehicleMatched:Boolean(vehicle && fuzzyContains(boardText, vehicle.last3, 0)),
        timeMatched:containsTime(timeText, departure.time)
      };
    });
  }

  root.Bus70Ocr = {compact, distance, fuzzyContains, orderedMatches, containsTime, suggest, verify};
})(typeof window === "undefined" ? globalThis : window);
