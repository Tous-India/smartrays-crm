/**
 * The trail out of a `GET /location/history` response.
 *
 * §7.67 changed that endpoint from a flat ping array to
 * `{ endpoints, pings, ... }`. Every reader goes through here so the shape is
 * known in ONE place — the regression this replaces happened precisely because
 * `useLocationHistory` was updated and `useLiveTrails`, which calls the API
 * directly, was not.
 *
 * Deliberately NOT in `locationApi.js`. This is pure logic, not a request, and
 * every test that mocks the api module with a factory would then have to
 * remember to re-export it or silently get `undefined` — which is exactly how
 * this class of bug reached production twice.
 *
 * The legacy array is still accepted: frontend and backend do not deploy
 * atomically here, so a new bundle can briefly talk to an old server, and a map
 * that throws is worse than one that draws no trail.
 */
export function pingsFromHistoryPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  return payload?.pings || [];
}

export default pingsFromHistoryPayload;

/**
 * The live-map payload.
 *
 * §7.69 changed `GET /location/live` from a flat entry array to
 * `{ entries, unlocatable, openShiftCount }`. Same reasoning as the history
 * reader above, and the same legacy tolerance: an older server still returns
 * the array, and a live map that throws is worse than one missing its warning
 * list.
 */
export function livePayload(payload) {
  if (Array.isArray(payload)) {
    return { entries: payload, unlocatable: [], openShiftCount: payload.length };
  }

  return {
    entries: payload?.entries || [],
    unlocatable: payload?.unlocatable || [],
    openShiftCount: payload?.openShiftCount ?? (payload?.entries?.length || 0),
  };
}
