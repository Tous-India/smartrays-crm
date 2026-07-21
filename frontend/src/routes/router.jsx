import { createBrowserRouter, createRoutesFromElements, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import RootRedirect from "./RootRedirect";
import MainLayout from "../layouts/MainLayout";
import PortalLayout from "../layouts/PortalLayout";
import LoginPage from "../pages/LoginPage";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";
import ResetPasswordPage from "../pages/ResetPasswordPage";
import DashboardPage from "../pages/DashboardPage";
import LeadsPage from "../pages/LeadsPage";
import LeadsBoardPage from "../pages/LeadsBoardPage";
import LeadDetailPage from "../pages/LeadDetailPage";
import CustomersPage from "../pages/CustomersPage";
import CustomerDetailPage from "../pages/CustomerDetailPage";
import ProjectDetailPage from "../pages/ProjectDetailPage";
import TasksPage from "../pages/TasksPage";
import AttendancePage from "../pages/AttendancePage";
import AttendanceTeamPage from "../pages/AttendanceTeamPage";
import LeavePage from "../pages/LeavePage";
import LocationPage from "../pages/LocationPage";
import PayrollPage from "../pages/PayrollPage";
import PayslipDetailPage from "../pages/PayslipDetailPage";
import TravelLogsPage from "../pages/TravelLogsPage";
import TicketsPage from "../pages/TicketsPage";
import TicketDetailPage from "../pages/TicketDetailPage";
import PaymentsPage from "../pages/PaymentsPage";
import AmcPage from "../pages/AmcPage";
import ReportsPage from "../pages/ReportsPage";
import PermissionSettingsPage from "../pages/PermissionSettingsPage";
import UserManagementPage from "../pages/UserManagementPage";
import PortalHomePage from "../pages/PortalHomePage";
import NotFoundPage from "../pages/NotFoundPage";

/**
 * The full §8 route map. Per smartrays.md's fixed routing rule, this is the
 * only pattern used anywhere in the app: `createBrowserRouter` +
 * `createRoutesFromElements` — no data loaders/actions, no file-based
 * routing, no other router library.
 *
 * `/login` sits outside `ProtectedRoute` (public); everything else is
 * nested under it. `MainLayout` (staff dashboard shell, §7.13) and
 * `PortalLayout` (customer, no internal nav, §8) are separate layout routes
 * under the same auth gate.
 */
export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route index element={<RootRedirect />} />

        <Route element={<MainLayout />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="leads/board" element={<LeadsBoardPage />} />
          <Route path="leads/:id" element={<LeadDetailPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<CustomerDetailPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="attendance/team" element={<AttendanceTeamPage />} />
          <Route path="leave" element={<LeavePage />} />
          <Route path="location" element={<LocationPage />} />
          <Route path="payroll" element={<PayrollPage />} />
          <Route path="payroll/:id/payslip" element={<PayslipDetailPage />} />
          <Route path="travel-logs" element={<TravelLogsPage />} />
          <Route path="tickets" element={<TicketsPage />} />
          <Route path="tickets/:id" element={<TicketDetailPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="amc" element={<AmcPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings/permissions" element={<PermissionSettingsPage />} />
          <Route path="settings/users" element={<UserManagementPage />} />
        </Route>

        <Route element={<PortalLayout />}>
          <Route path="portal" element={<PortalHomePage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </>
  )
);

export default router;
