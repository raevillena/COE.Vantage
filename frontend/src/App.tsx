import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/protectedRoute/ProtectedRoute";
import { Layout } from "./components/layout/Layout";
import { LoginPage } from "./pages/login/LoginPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { UsersPage } from "./pages/users/UsersPage";
import { RoomsPage } from "./pages/rooms/RoomsPage";
import { CurriculumPage } from "./pages/curriculum/CurriculumPage";
import { CurriculumBuildPage } from "./pages/curriculum/CurriculumBuildPage";
import { SubjectsPage } from "./pages/subjects/SubjectsPage";
import { StudentClassesPage } from "./pages/studentClasses/StudentClassesPage";
import { AcademicYearsPage } from "./pages/academicYears/AcademicYearsPage";
import { DepartmentsPage } from "./pages/departments/DepartmentsPage";
import { SchedulerPage } from "./pages/scheduler/SchedulerPage";
import { FacultySchedulePage } from "./pages/schedules/FacultySchedulePage";
import { StudentSchedulePage } from "./pages/schedules/StudentSchedulePage";
import { RoomAvailabilityPage } from "./pages/schedules/RoomAvailabilityPage";
import { ReportsPage } from "./pages/reports/ReportsPage";
import { TrashPage } from "./pages/trash/TrashPage";
import { UserProfilePage } from "./pages/profile/UserProfilePage";
import { ResetPasswordPage } from "./pages/resetPassword/ResetPasswordPage";
import { AboutPage } from "./pages/about/AboutPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="users" element={<ProtectedRoute allowedRoles={["ADMIN"]}><UsersPage /></ProtectedRoute>} />
        <Route path="rooms" element={<ProtectedRoute allowedRoles={["ADMIN", "DEAN", "CHAIRMAN", "OFFICER"]}><RoomsPage /></ProtectedRoute>} />
        <Route path="curriculum" element={<ProtectedRoute allowedRoles={["ADMIN", "OFFICER", "DEAN", "CHAIRMAN"]}><CurriculumPage /></ProtectedRoute>} />
        <Route path="curriculum/:id/build" element={<ProtectedRoute allowedRoles={["ADMIN", "CHAIRMAN"]}><CurriculumBuildPage /></ProtectedRoute>} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route path="student-classes" element={<StudentClassesPage />} />
        <Route path="academic-years" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AcademicYearsPage /></ProtectedRoute>} />
        <Route path="departments" element={<ProtectedRoute allowedRoles={["ADMIN", "OFFICER", "DEAN", "CHAIRMAN"]}><DepartmentsPage /></ProtectedRoute>} />
        <Route path="scheduler" element={<ProtectedRoute allowedRoles={["CHAIRMAN"]}><SchedulerPage /></ProtectedRoute>} />
        <Route path="schedules/faculty" element={<FacultySchedulePage />} />
        <Route path="schedules/student-class" element={<StudentSchedulePage />} />
        <Route path="schedules/rooms" element={<RoomAvailabilityPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="trash" element={<ProtectedRoute allowedRoles={["ADMIN"]}><TrashPage /></ProtectedRoute>} />
        <Route path="profile" element={<UserProfilePage />} />
        <Route path="about" element={<AboutPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
