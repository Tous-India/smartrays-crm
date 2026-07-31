import dayjs from "dayjs";
import { Card } from "antd";

/**
 * Plain fields straight off the already-fetched `user` record
 * (`UserDetailPage`'s own `useUserDetail`) — no separate fetch of its own,
 * unlike the sections below it. `managerName` is resolved from the
 * already-fetched user directory (shared with the Team card, one fetch for
 * both) rather than a second lookup.
 *
 * Base salary is deliberately NOT shown here — `User.baseSalary` is
 * `select: false` at the schema level and `GET /users/:id` never opts back
 * in with `.select("+baseSalary")`, so there is currently no endpoint
 * anywhere in the app that actually returns a user's real stored salary
 * (even the existing Edit User form's own "Salary" field is never
 * pre-filled, for the same reason) — showing it here would need a backend
 * change, out of scope for this frontend-only task.
 */
function UserBasicInfoCard({ user, managerName }) {
  return (
    <Card size="small" title={<span className="text-sm font-medium">Basic Info</span>} className="h-full">
      <div className="flex flex-col gap-2 text-sm">
        <div>
          <span className="text-gray-500">Email:</span> {user.email}
        </div>
        <div>
          <span className="text-gray-500">Phone:</span> {user.phone || "—"}
        </div>
        <div>
          <span className="text-gray-500">Manager:</span> {managerName || "—"}
        </div>
        <div>
          <span className="text-gray-500">Joined:</span>{" "}
          {user.createdAt ? dayjs(user.createdAt).format("DD MMM YYYY") : "—"}
        </div>
      </div>
    </Card>
  );
}

export default UserBasicInfoCard;
