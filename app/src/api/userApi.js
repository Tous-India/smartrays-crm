import apiClient from "./apiClient";
import { API_PATHS } from "../constants/api.constants";

/**
 * `GET /users/dropdown` — every active user as `{ _id, name, role }`, the
 * same directory the web uses to turn an id into a name (assigned by,
 * collected by). Any signed-in user may read it.
 */
export function getUserDirectory() {
  return apiClient.get(API_PATHS.USER_DIRECTORY);
}
