import { Link } from "react-router-dom";
import { useAppSelector } from "../../store/hooks";

export function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Dashboard</h1>
      <p className="text-slate-600 mb-6">Welcome, {user?.name}. Role: {user?.role}.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {user?.role === "ADMIN" && (
          <>
            <Link to="/users" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow">Manage Users</Link>
            <Link to="/academic-years" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow">Academic Years</Link>
          </>
        )}
        {(user?.role === "ADMIN" || user?.role === "DEAN" || user?.role === "CHAIRMAN") && (
          <>
            <Link to="/rooms" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow">Manage Rooms</Link>
            <Link to="/curriculum" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow">Curriculum</Link>
            <Link to="/subjects" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow">Subjects</Link>
            <Link to="/student-classes" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow">Student Classes</Link>
          </>
        )}
        {user?.role === "CHAIRMAN" && (
          <Link to="/scheduler" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow">Drag-and-Drop Scheduler</Link>
        )}
        <Link to="/schedules/faculty" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow">Faculty Schedule</Link>
        <Link to="/schedules/student-class" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow">Class Schedule</Link>
        <Link to="/schedules/rooms" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow">Room Availability</Link>
        <Link to="/reports" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow">Reports</Link>
      </div>
    </div>
  );
}
