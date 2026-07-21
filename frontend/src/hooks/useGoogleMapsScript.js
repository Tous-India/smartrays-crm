import { useEffect, useState } from "react";

const SCRIPT_ID = "google-maps-js-sdk";

// Module-level, not component state — if two map views mount at once (or a
// user navigates away and back quickly), the SDK script tag must only ever
// be injected once. A second `<script>` tag pointing at the same Maps JS
// SDK either silently no-ops or (worse) logs a "you have included the
// Google Maps JavaScript API multiple times" console error.
let loadingPromise = null;

/**
 * Loads the Google Maps JS SDK via a plain `<script>` tag and resolves once
 * `window.google.maps` is available — chosen over a wrapper library
 * (e.g. `@react-google-maps/api`) because the Location module's own scope is
 * deliberately basic (§7.4b: markers + a polyline, no clustering/info
 * windows/autocomplete), so a wrapper's abstraction wouldn't earn its
 * dependency weight here. `GoogleMapView.jsx` talks to `window.google.maps`
 * directly once this resolves.
 */
export function useGoogleMapsScript() {
  const [isLoaded, setIsLoaded] = useState(Boolean(window.google?.maps));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isLoaded) {
      return;
    }

    if (!loadingPromise) {
      loadingPromise = new Promise((resolve, reject) => {
        const existingScript = document.getElementById(SCRIPT_ID);

        if (existingScript) {
          existingScript.addEventListener("load", () => resolve());
          existingScript.addEventListener("error", () => reject(new Error("Failed to load Google Maps")));
          return;
        }

        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        const script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Google Maps"));
        document.head.appendChild(script);
      });
    }

    let isMounted = true;

    loadingPromise
      .then(() => {
        if (isMounted) {
          setIsLoaded(true);
        }
      })
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isLoaded]);

  return { isLoaded, error };
}

export default useGoogleMapsScript;
