import { env } from "../config/env.js";

const DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json";

// Accepts either a {lat, lng} coords object or a plain address string — the
// same flexibility Google's own Distance Matrix API offers for origins/
// destinations. travelLog.service.js's manual entry only ever passes coords
// today (§6.5's TravelLog schema has no address fields), but this utility
// doesn't need to assume that.
function formatLocation(location) {
  if (typeof location === "string") {
    return location;
  }

  return `${location.lat},${location.lng}`;
}

/**
 * Returns the distance between two points in kilometers, via the Google
 * Maps Distance Matrix API (§6.5/§7.6). Throws if the API returns no usable
 * result — callers that must never fail because of this (e.g. Attendance
 * checkout's auto travel-log generation) are responsible for catching it.
 */
export async function getDistanceKm(origin, destination) {
  const url = new URL(DISTANCE_MATRIX_URL);
  url.searchParams.set("origins", formatLocation(origin));
  url.searchParams.set("destinations", formatLocation(destination));
  url.searchParams.set("units", "metric");
  url.searchParams.set("key", env.googleMapsApiKey);

  const response = await fetch(url);
  const data = await response.json();
  const element = data.rows?.[0]?.elements?.[0];

  if (!element || element.status !== "OK") {
    throw new Error(
      `Google Maps Distance Matrix returned no usable result (${element?.status || data.status})`
    );
  }

  return element.distance.value / 1000;
}
