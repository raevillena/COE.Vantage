import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/protectedRoute/ProtectedRoute";
import { ExperimentalRoute } from "./components/protectedRoute/ExperimentalRoute";
import { Layout } from "./components/layout/Layout";
import { LoginPage } from "./pages/login/LoginPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { DashboardDetailPage } from "./pages/dashboard/DashboardDetailPage";
import { UsersPage } from "./pages/users/UsersPage";
import { RoomsPage } from "./pages/rooms/RoomsPage";
import { CurriculumPage } from "./pages/curriculum/CurriculumPage";
import { CurriculumBuildPage } from "./pages/curriculum/CurriculumBuildPage";
import { SubjectsPage } from "./pages/subjects/SubjectsPage";
import { StudentClassesPage } from "./pages/studentClasses/StudentClassesPage";
import { AcademicYearsPage } from "./pages/academicYears/AcademicYearsPage";
import { DepartmentsPage } from "./pages/departments/DepartmentsPage";
import { SchedulerPage } from "./pages/scheduler/SchedulerPage";
import { SchedulingRulesPage } from "./pages/scheduler/SchedulingRulesPage";
import { FacultySchedulePage } from "./pages/schedules/FacultySchedulePage";
import { StudentSchedulePage } from "./pages/schedules/StudentSchedulePage";
import { RoomAvailabilityPage } from "./pages/schedules/RoomAvailabilityPage";
import { ReportsPage } from "./pages/reports/ReportsPage";
import { RequestsPage } from "./pages/requests/RequestsPage";
import { TrashPage } from "./pages/trash/TrashPage";
import { ChairmanFacultyPage } from "./pages/faculty/ChairmanFacultyPage";
import { UserProfilePage } from "./pages/profile/UserProfilePage";
import { ResetPasswordPage } from "./pages/resetPassword/ResetPasswordPage";
import { ForgotPasswordPage } from "./pages/forgotPassword/ForgotPasswordPage";
import { FeedbackPage } from "./pages/feedback/FeedbackPage";
import { GeSubjectsPage } from "./pages/geSubjects/GeSubjectsPage";
import { AboutPage } from "./pages/about/AboutPage";
import { NotFoundPage } from "./pages/notFound/NotFoundPage";
import { ExperimentalGradesPage } from "./pages/experimental/ExperimentalGradesPage";
import { AuditLogPage } from "./pages/audit/AuditLogPage";
import { UniversityPage } from "./pages/university/UniversityPage";
import { CollegesPage } from "./pages/university/CollegesPage";
import { PublicGradesPage } from "./pages/publicGrades/PublicGradesPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/grades" element={<PublicGradesPage />} />
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
        <Route path="dashboard/details/:metric" element={<ProtectedRoute allowedRoles={["ADMIN", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY"]}><DashboardDetailPage /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute allowedRoles={["ADMIN"]}><UsersPage /></ProtectedRoute>} />
        <Route path="rooms" element={<ProtectedRoute allowedRoles={["ADMIN", "DEAN", "CHAIRMAN", "OFFICER", "COLLEGE_SECRETARY", "PRESIDENT"]}><RoomsPage /></ProtectedRoute>} />
        <Route path="curriculum" element={<ProtectedRoute allowedRoles={["ADMIN", "OFFICER", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY", "PRESIDENT"]}><CurriculumPage /></ProtectedRoute>} />
        <Route path="curriculum/:id/build" element={<ProtectedRoute allowedRoles={["ADMIN", "CHAIRMAN"]}><CurriculumBuildPage /></ProtectedRoute>} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route path="student-classes" element={<StudentClassesPage />} />
        <Route path="university" element={<ProtectedRoute allowedRoles={["ADMIN", "PRESIDENT"]}><UniversityPage /></ProtectedRoute>} />
        <Route path="colleges" element={<ProtectedRoute allowedRoles={["ADMIN"]}><CollegesPage /></ProtectedRoute>} />
        <Route path="audit-log" element={<ProtectedRoute allowedRoles={["ADMIN", "DEAN", "COLLEGE_SECRETARY"]}><AuditLogPage /></ProtectedRoute>} />
        <Route path="academic-years" element={<ProtectedRoute allowedRoles={["ADMIN", "DEAN", "COLLEGE_SECRETARY", "PRESIDENT"]}><AcademicYearsPage /></ProtectedRoute>} />
        <Route path="departments" element={<ProtectedRoute allowedRoles={["ADMIN", "OFFICER", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY", "PRESIDENT"]}><DepartmentsPage /></ProtectedRoute>} />
        <Route path="scheduler" element={<ProtectedRoute allowedRoles={["CHAIRMAN"]}><SchedulerPage /></ProtectedRoute>} />
        <Route path="faculty" element={<ProtectedRoute allowedRoles={["CHAIRMAN", "DEAN"]}><ChairmanFacultyPage /></ProtectedRoute>} />
        <Route path="scheduler/rules" element={<ProtectedRoute allowedRoles={["ADMIN", "CHAIRMAN"]}><SchedulingRulesPage backTo="/scheduler" title="Scheduling rule sets" /></ProtectedRoute>} />
        <Route path="admin/scheduling-rules" element={<ProtectedRoute allowedRoles={["ADMIN", "COLLEGE_SECRETARY"]}><SchedulingRulesPage backTo="/dashboard" title="Scheduling rules" isAdminPage /></ProtectedRoute>} />
        <Route path="ge-subjects" element={<ProtectedRoute allowedRoles={["ADMIN", "COLLEGE_SECRETARY", "DEAN"]}><GeSubjectsPage /></ProtectedRoute>} />
        <Route path="requests" element={<ProtectedRoute allowedRoles={["CHAIRMAN", "ADMIN", "DEAN", "COLLEGE_SECRETARY"]}><RequestsPage /></ProtectedRoute>} />
        <Route path="schedules/faculty" element={<ProtectedRoute allowedRoles={["ADMIN", "DEAN", "CHAIRMAN", "OFFICER", "COLLEGE_SECRETARY", "PRESIDENT"]}><FacultySchedulePage /></ProtectedRoute>} />
        <Route path="schedules/student-class" element={<StudentSchedulePage />} />
        <Route path="schedules/rooms" element={<RoomAvailabilityPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="trash" element={<ProtectedRoute allowedRoles={["ADMIN"]}><TrashPage /></ProtectedRoute>} />
        <Route path="profile" element={<UserProfilePage />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route
          path="experimental/grades"
          element={
            <ProtectedRoute allowedRoles={["ADMIN", "FACULTY", "CHAIRMAN", "DEAN"]}>
              <ExperimentalRoute featureKey="gradeModule">
                <ExperimentalGradesPage />
              </ExperimentalRoute>
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
