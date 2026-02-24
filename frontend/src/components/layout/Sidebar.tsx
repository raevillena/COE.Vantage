import { NavLink } from "react-router-dom";
import * as Separator from "@radix-ui/react-separator";
import { useAppSelector } from "../../store/hooks";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItemClass =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-inset";
const navItemActiveClass = "bg-primary-muted text-primary font-semibold border-l-2 border-primary";

function NavItem({ to, children, onClose }: { to: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <NavLink
      to={to}
      end={to === "/dashboard"}
      className={({ isActive }) =>
        `${navItemClass} ${isActive ? navItemActiveClass : ""} border-l-2 border-transparent`
      }
      onClick={onClose}
    >
      {children}
    </NavLink>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const user = useAppSelector((s) => s.auth.user);

  const sidebar = (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-surface">
      <nav className="flex flex-1 flex-col gap-1 p-3">
        <div className="space-y-1">
          <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            Home
          </div>
          <NavItem to="/dashboard" onClose={onClose}>Dashboard</NavItem>
        </div>

        {user?.role === "CHAIRMAN" && (
          <>
            <Separator.Root className="my-2 h-px bg-border" />
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Scheduler
              </div>
              <NavItem to="/scheduler" onClose={onClose}>Scheduler</NavItem>
            </div>
          </>
        )}

        <Separator.Root className="my-2 h-px bg-border" />
        <div className="space-y-1">
          <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            Schedules
          </div>
          <NavItem to="/schedules/faculty" onClose={onClose}>Faculty schedule</NavItem>
          <NavItem to="/schedules/student-class" onClose={onClose}>Class schedule</NavItem>
          <NavItem to="/schedules/rooms" onClose={onClose}>Room availability</NavItem>
        </div>

        {(user?.role === "ADMIN" || user?.role === "DEAN" || user?.role === "CHAIRMAN") && (
          <>
            <Separator.Root className="my-2 h-px bg-border" />
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Management
              </div>
              <NavItem to="/rooms" onClose={onClose}>Rooms</NavItem>
              <NavItem to="/curriculum" onClose={onClose}>Curriculum</NavItem>
              <NavItem to="/subjects" onClose={onClose}>Subjects</NavItem>
              <NavItem to="/student-classes" onClose={onClose}>Student classes</NavItem>
              {user?.role === "ADMIN" && (
                <>
                  <NavItem to="/users" onClose={onClose}>Users</NavItem>
                  <NavItem to="/academic-years" onClose={onClose}>Academic years</NavItem>
                </>
              )}
            </div>
          </>
        )}

        <Separator.Root className="my-2 h-px bg-border" />
        <div className="space-y-1">
          <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            Reports
          </div>
          <NavItem to="/reports" onClose={onClose}>Reports</NavItem>
        </div>
      </nav>
    </aside>
  );

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:flex md:flex-shrink-0">{sidebar}</div>
      {/* Mobile: overlay when open */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-foreground/50 md:hidden"
            onClick={onClose}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            role="button"
            tabIndex={0}
            aria-label="Close menu"
          />
          <div className="fixed inset-y-0 left-0 z-40 w-56 md:hidden">{sidebar}</div>
        </>
      )}
    </>
  );
}
