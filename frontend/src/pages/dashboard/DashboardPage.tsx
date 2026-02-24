import { Link } from "react-router-dom";
import { useAppSelector } from "../../store/hooks";

interface DashboardCardProps {
  to: string;
  title: string;
  subtitle: string;
  primary?: boolean;
}

function DashboardCard({ to, title, subtitle, primary }: DashboardCardProps) {
  return (
    <Link
      to={to}
      className={`block rounded-lg border bg-surface p-4 shadow-sm transition-shadow hover:shadow focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 ${
        primary ? "border-primary ring-1 ring-primary/20" : "border-border"
      }`}
    >
      <h2 className="font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p>
    </Link>
  );
}

export function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);

  return (
    <div className="mb-6">
      <h1 className="mb-1 text-2xl font-semibold text-foreground">Dashboard</h1>
      <p className="mb-6 text-foreground-muted">
        Welcome, {user?.name}. You are signed in as {user?.role}.
      </p>

      {/* Scheduler — primary for CHAIRMAN */}
      {user?.role === "CHAIRMAN" && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-foreground-muted">Scheduler</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DashboardCard
              to="/scheduler"
              title="Scheduler"
              subtitle="Assign teaching loads to faculty and resolve conflicts"
              primary
            />
          </div>
        </section>
      )}

      {/* Schedule views */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-foreground-muted">Schedules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DashboardCard
            to="/schedules/faculty"
            title="Faculty schedule"
            subtitle="View weekly teaching loads by faculty"
          />
          <DashboardCard
            to="/schedules/student-class"
            title="Class schedule"
            subtitle="View weekly schedule by student class"
          />
          <DashboardCard
            to="/schedules/rooms"
            title="Room availability"
            subtitle="View weekly room occupancy"
          />
        </div>
      </section>

      {/* Management — rooms, curriculum, subjects, student classes; ADMIN also users & academic years */}
      {(user?.role === "ADMIN" || user?.role === "DEAN" || user?.role === "CHAIRMAN") && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-foreground-muted">Management</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DashboardCard to="/rooms" title="Rooms" subtitle="Manage rooms, capacity, and lab flags" />
            <DashboardCard to="/curriculum" title="Curriculum" subtitle="Manage degree programs and curricula" />
            <DashboardCard to="/subjects" title="Subjects" subtitle="Manage subjects, units, and lab designations" />
            <DashboardCard to="/student-classes" title="Student classes" subtitle="Manage student classes and enrollment" />
            {user?.role === "ADMIN" && (
              <>
                <DashboardCard to="/users" title="Users" subtitle="Manage user accounts and roles" />
                <DashboardCard to="/academic-years" title="Academic years" subtitle="Manage academic years and set active year" />
              </>
            )}
          </div>
        </section>
      )}

      {/* Reports */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-foreground-muted">Reports</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <DashboardCard to="/reports" title="Reports" subtitle="View and export schedule reports" />
        </div>
      </section>
    </div>
  );
}
