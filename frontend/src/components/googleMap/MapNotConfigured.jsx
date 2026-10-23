/** What a map shows when this build has no Google Maps key (2026-10-23). */
function MapNotConfigured({ height }) {
  return (
    <div
      data-testid="map-not-configured"
      style={{ height, width: "100%" }}
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center"
    >
      <div className="font-semibold text-gray-800">Map not configured</div>
      <div className="mt-1 text-sm text-gray-500">The Google Maps key is not set for this site. Everything else on this page still works.</div>
    </div>
  );
}

export default MapNotConfigured;
