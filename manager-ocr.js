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

  root.Bus70Ocr = {compact, orderedMatches, containsTime, suggest};
})(typeof window === "undefined" ? globalThis : window);
