import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import * as Separator from "@radix-ui/react-separator";
import {
  LayoutDashboard,
  CalendarRange,
  Inbox,
  UserCircle,
  GraduationCap,
  DoorOpen,
  Building2,
  BookOpen,
  BookMarked,
  Users,
  Calendar,
  SlidersHorizontal,
  Trash2,
  FileText,
  Building,
  User,
  Info,
} from "lucide-react";
import { useAppSelector } from "../../store/hooks";
import { apiClient } from "../../api/apiClient";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItemClass =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-inset";
const navItemActiveClass = "bg-primary-muted text-primary font-semibold border-l-2 border-primary";

const iconSize = 18;
const iconClass = "shrink-0";

function NavItem({
  to,
  icon: Icon,
  children,
  onClose,
}: {
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/dashboard"}
      className={({ isActive }) =>
        `${navItemClass} ${isActive ? navItemActiveClass : ""} border-l-2 border-transparent`
      }
      onClick={onClose}
    >
      <Icon size={iconSize} className={iconClass} aria-hidden />
      {children}
    </NavLink>
  );
}

function RequestsNavItem({ onClose }: { onClose: () => void }) {
  const [pendingCount, setPendingCount] = useState(0);
  const user = useAppSelector((s) => s.auth.user);

  useEffect(() => {
    if (user?.role !== "CHAIRMAN" && user?.role !== "ADMIN" && user?.role !== "DEAN") return;
    apiClient
      .get<{ count: number }>("/assignment-requests/count")
      .then(({ data }) => setPendingCount(data?.count ?? 0))
      .catch(() => setPendingCount(0));
  }, [user?.role]);

  return (
    <NavLink
      to="/requests"
      className={({ isActive }) =>
        `${navItemClass} ${isActive ? navItemActiveClass : ""} border-l-2 border-transparent`
      }
      onClick={onClose}
    >
      <Inbox size={iconSize} className={iconClass} aria-hidden />
      <span className="flex-1">Requests</span>
      {pendingCount > 0 && (
        <span className="min-w-[1.25rem] rounded-full bg-primary px-1.5 py-0.5 text-center text-xs font-medium text-primary-contrast">
          {pendingCount > 99 ? "99+" : pendingCount}
        </span>
      )}
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
          <NavItem to="/dashboard" icon={LayoutDashboard} onClose={onClose}>Dashboard</NavItem>
        </div>

        {user?.role === "CHAIRMAN" && (
          <>
            <Separator.Root className="my-2 h-px bg-border" />
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Scheduler
              </div>
              <NavItem to="/scheduler" icon={CalendarRange} onClose={onClose}>Scheduler</NavItem>
              <RequestsNavItem onClose={onClose} />
            </div>
          </>
        )}

        <Separator.Root className="my-2 h-px bg-border" />
        <div className="space-y-1">
          <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            Schedules
          </div>
          <NavItem to="/schedules/faculty" icon={UserCircle} onClose={onClose}>Faculty schedule</NavItem>
          <NavItem to="/schedules/student-class" icon={GraduationCap} onClose={onClose}>Class schedule</NavItem>
          <NavItem to="/schedules/rooms" icon={DoorOpen} onClose={onClose}>Room availability</NavItem>
        </div>

        {(user?.role === "ADMIN" || user?.role === "DEAN" || user?.role === "CHAIRMAN" || user?.role === "OFFICER") && (
          <>
            <Separator.Root className="my-2 h-px bg-border" />
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Management
              </div>
              <NavItem to="/rooms" icon={Building} onClose={onClose}>Rooms</NavItem>
              {(user?.role === "ADMIN" || user?.role === "DEAN") && <RequestsNavItem onClose={onClose} />}
              {(user?.role === "ADMIN" || user?.role === "OFFICER" || user?.role === "DEAN" || user?.role === "CHAIRMAN") && (
                <>
                  <NavItem to="/departments" icon={Building2} onClose={onClose}>Departments</NavItem>
                  <NavItem to="/curriculum" icon={BookOpen} onClose={onClose}>Curriculum</NavItem>
                  {(user?.role === "ADMIN" || user?.role === "DEAN" || user?.role === "CHAIRMAN") && (
                    <>
                      <NavItem to="/subjects" icon={BookMarked} onClose={onClose}>Subjects</NavItem>
                      <NavItem to="/student-classes" icon={GraduationCap} onClose={onClose}>Student classes</NavItem>
                      {user?.role === "CHAIRMAN" && <NavItem to="/faculty" icon={Users} onClose={onClose}>Faculty</NavItem>}
                    </>
                  )}
                  {user?.role === "ADMIN" && (
                    <>
                      <NavItem to="/users" icon={Users} onClose={onClose}>Users</NavItem>
                      <NavItem to="/academic-years" icon={Calendar} onClose={onClose}>Academic years</NavItem>
                      <NavItem to="/admin/scheduling-rules" icon={SlidersHorizontal} onClose={onClose}>Scheduling rules</NavItem>
                      <NavItem to="/trash" icon={Trash2} onClose={onClose}>Trash</NavItem>
                    </>
                  )}
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
          <NavItem to="/reports" icon={FileText} onClose={onClose}>Reports</NavItem>
        </div>

        <Separator.Root className="my-2 h-px bg-border" />
        <div className="space-y-1">
          <NavItem to="/profile" icon={User} onClose={onClose}>Profile</NavItem>
          <NavItem to="/about" icon={Info} onClose={onClose}>About</NavItem>
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
