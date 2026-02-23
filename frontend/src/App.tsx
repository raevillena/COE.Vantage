import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/protectedRoute/ProtectedRoute";
import { Layout } from "./components/layout/Layout";
import { LoginPage } from "./pages/login/LoginPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { UsersPage } from "./pages/users/UsersPage";
import { RoomsPage } from "./pages/rooms/RoomsPage";
import { CurriculumPage } from "./pages/curriculum/CurriculumPage";
import { SubjectsPage } from "./pages/subjects/SubjectsPage";
import { StudentClassesPage } from "./pages/studentClasses/StudentClassesPage";
import { AcademicYearsPage } from "./pages/academicYears/AcademicYearsPage";
import { SchedulerPage } from "./pages/scheduler/SchedulerPage";
import { FacultySchedulePage } from "./pages/schedules/FacultySchedulePage";
import { StudentSchedulePage } from "./pages/schedules/StudentSchedulePage";
import { RoomAvailabilityPage } from "./pages/schedules/RoomAvailabilityPage";
import { ReportsPage } from "./pages/reports/ReportsPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
        <Route path="rooms" element={<RoomsPage />} />
        <Route path="curriculum" element={<CurriculumPage />} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route path="student-classes" element={<StudentClassesPage />} />
        <Route path="academic-years" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AcademicYearsPage /></ProtectedRoute>} />
        <Route path="scheduler" element={<ProtectedRoute allowedRoles={["CHAIRMAN"]}><SchedulerPage /></ProtectedRoute>} />
        <Route path="schedules/faculty" element={<FacultySchedulePage />} />
        <Route path="schedules/student-class" element={<StudentSchedulePage />} />
        <Route path="schedules/rooms" element={<RoomAvailabilityPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
