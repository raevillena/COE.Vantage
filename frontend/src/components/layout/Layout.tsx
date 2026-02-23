import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { logout } from "../../store/authSlice";
import { apiClient } from "../../api/apiClient";

export function Layout() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      dispatch(logout());
      navigate("/login");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-slate-800 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="font-semibold text-lg">
            COE.Vantage
          </Link>
          <nav className="flex items-center gap-4">
            <Link to="/dashboard" className="hover:underline">Dashboard</Link>
            {user?.role === "ADMIN" && (
              <>
                <Link to="/users" className="hover:underline">Users</Link>
                <Link to="/academic-years" className="hover:underline">Academic Years</Link>
              </>
            )}
            {(user?.role === "ADMIN" || user?.role === "DEAN" || user?.role === "CHAIRMAN") && (
              <>
                <Link to="/rooms" className="hover:underline">Rooms</Link>
                <Link to="/curriculum" className="hover:underline">Curriculum</Link>
                <Link to="/subjects" className="hover:underline">Subjects</Link>
                <Link to="/student-classes" className="hover:underline">Student Classes</Link>
              </>
            )}
            {user?.role === "CHAIRMAN" && (
              <Link to="/scheduler" className="hover:underline">Scheduler</Link>
            )}
            <Link to="/schedules/faculty" className="hover:underline">Faculty Schedule</Link>
            <Link to="/schedules/student-class" className="hover:underline">Class Schedule</Link>
            <Link to="/schedules/rooms" className="hover:underline">Room Availability</Link>
            <Link to="/reports" className="hover:underline">Reports</Link>
            <span className="text-slate-300 text-sm">{user?.name} ({user?.role})</span>
            <button type="button" onClick={handleLogout} className="text-slate-300 hover:text-white">
              Logout
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
