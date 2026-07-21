import { useState } from "react";

/**
 * Wraps the browser `Geolocation` API for the check-in/out widget. Permission
 * denial is surfaced as a real, visible error message (`error` state) rather
 * than silently leaving `coords` null with no explanation — the task's own
 * explicit requirement, since a silent failure here would just look like a
 * stuck "capturing location..." spinner forever.
 */
export function useGeolocation() {
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  function requestLocation() {
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }

    setIsLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setIsLoading(false);
      },
      (geoError) => {
        const isPermissionDenied = geoError.code === geoError.PERMISSION_DENIED;
        setError(
          isPermissionDenied
            ? "Location access was denied — allow location access in your browser to check in/out."
            : "Could not determine your location — please try again."
        );
        setIsLoading(false);
      }
    );
  }

  function reset() {
    setCoords(null);
    setError(null);
  }

  return { coords, error, isLoading, requestLocation, reset };
}

export default useGeolocation;
