/**
 * One stable colour per employee (§7.67).
 *
 * COLOUR ENCODES WHO. Shape encodes what happened (check-in flag, check-out
 * flag, plain dot for a ping). Colour is never reused for event type: once a
 * hue means "Priya", a red dot cannot also mean "problem" without the reader
 * having to guess which meaning applies.
 *
 * Derived from the employee id, not from array position, so the same person is
 * the same colour on the history map, on the Live Map, after a reload, and for
 * a different viewer whose visible-employee list is a different length.
 *
 * PALETTE. Twenty-four hues at alternating lightness, chosen to stay separable
 * well past twenty people. Deliberately NOT a red/green scale: red-green is the
 * commonest colour-vision deficiency, and those two hues already carry meaning
 * elsewhere in this app (timeline bands, geofence state). Adjacent entries are
 * pushed apart in hue so that two ids landing on neighbouring slots still look
 * different.
 */
const PALETTE = [
  "#1f77b4", "#d62728", "#2ca02c", "#9467bd", "#ff7f0e", "#17becf",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#393b79", "#a55194",
  "#3182bd", "#e6550d", "#31a354", "#756bb1", "#636363", "#c7c7c7",
  "#5254a3", "#ad494a", "#8ca252", "#b5cf6b", "#ce6dbd", "#6b6ecf",
];

/**
 * FNV-1a. A plain character sum collides badly on Mongo ObjectIds, which share
 * long prefixes — two employees created in the same second would differ only in
 * the last few characters and could land on the same slot. FNV-1a avalanches,
 * so a one-character difference changes the bucket.
 */
function hashToIndex(value, buckets) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash % buckets;
}

export function employeeColor(employeeId) {
  if (!employeeId) {
    return PALETTE[0];
  }

  return PALETTE[hashToIndex(String(employeeId), PALETTE.length)];
}

export { PALETTE as EMPLOYEE_COLOR_PALETTE };
export default employeeColor;
