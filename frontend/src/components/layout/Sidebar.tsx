import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
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
  FlaskConical,
  MessageSquarePlus,
  FileSpreadsheet,
  ScrollText,
  Landmark,
  Share2,
} from "lucide-react";
import { useAppSelector } from "../../store/hooks";
import { apiClient } from "../../api/apiClient";
import type { College } from "../../types/api";
import { getExperimentalFeaturesForUser } from "../../features/experimental/featureCatalog";
import { setViewCollege, useViewCollege } from "../../utils/collegeView";
import { collegeCode, collegeColor } from "../../utils/collegeColor";
import { CountBadge } from "../ui/countBadge";
import { CollegeSwitcher } from "./CollegeSwitcher";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItemClass =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-inset";
const navItemActiveClass = "bg-primary-muted text-primary font-semibold border-l-2 border-primary";

const iconSize = 18;
const iconClass = "shrink-0";

type Icon = React.ComponentType<{ size?: number; className?: string }>;

interface NavDef {
  to: string;
  label: string;
  icon: Icon;
  show: boolean;
  /** Shows the number of requests waiting for this person. */
  requests?: boolean;
  /** Shows the number of room requests waiting for this person. */
  roomShare?: boolean;
}

interface NavGroupDef {
  title: string;
  /** Marks the group as belonging to the college being viewed, with its code. */
  scoped?: boolean;
  items: NavDef[];
}

function NavItem({ to, icon: Icon, children, onClose }: { to: string; icon: Icon; children: React.ReactNode; onClose: () => void }) {
  return (
    <NavLink
      to={to}
      end={to === "/dashboard"}
      className={({ isActive }) => `${navItemClass} ${isActive ? navItemActiveClass : ""} border-l-2 border-transparent`}
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
    if (user?.role !== "CHAIRMAN" && user?.role !== "ADMIN" && user?.role !== "DEAN" && user?.role !== "COLLEGE_SECRETARY") return;
    apiClient
      .get<{ count: number }>("/assignment-requests/count")
      .then(({ data }) => setPendingCount(data?.count ?? 0))
      .catch(() => setPendingCount(0));
  }, [user?.role]);

  return (
    <NavLink
      to="/requests"
      className={({ isActive }) => `${navItemClass} ${isActive ? navItemActiveClass : ""} border-l-2 border-transparent`}
      onClick={onClose}
    >
      <Inbox size={iconSize} className={iconClass} aria-hidden />
      <span className="flex-1">Requests</span>
      <CountBadge count={pendingCount} />
    </NavLink>
  );
}

function RoomShareNavItem({ onClose }: { onClose: () => void }) {
  const [count, setCount] = useState(0);
  const location = useLocation();

  useEffect(() => {
    const load = () =>
      apiClient
        .get<{ count: number }>("/room-share/requests/count")
        .then(({ data }) => setCount(data?.count ?? 0))
        .catch(() => setCount(0));
    load();
    // a decision made on the page refreshes the badge at once
    window.addEventListener("room-share-changed", load);
    return () => window.removeEventListener("room-share-changed", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  return (
    <NavLink
      to="/room-sharing"
      className={({ isActive }) => `${navItemClass} ${isActive ? navItemActiveClass : ""} border-l-2 border-transparent`}
      onClick={onClose}
    >
      <Share2 size={iconSize} className={iconClass} aria-hidden />
      <span className="flex-1">Room sharing</span>
      <CountBadge count={count} />
    </NavLink>
  );
}

function ScopeTag({ college }: { college: College | null }) {
  return (
    <span
      className="rounded-full px-1.5 py-px text-[9.5px] font-semibold tracking-wide text-white"
      style={{ background: college ? collegeColor(college.id) : "#475569" }}
      title={college ? college.name : "Every college"}
    >
      {college ? collegeCode(college) : "ALL"}
    </span>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const user = useAppSelector((s) => s.auth.user);
  const experimentalFeatures = getExperimentalFeaturesForUser(user);
  const viewId = useViewCollege();
  const [colleges, setColleges] = useState<College[] | null>(null);

  useEffect(() => {
    if (!user) return;
    apiClient
      .get<College[]>("/colleges")
      .then(({ data }) => {
        setColleges(data);
        // a remembered choice that is no longer allowed or no longer exists is dropped
        if (viewId && !data.some((c) => c.id === viewId)) setViewCollege(null);
      })
      .catch(() => setColleges([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const role = user?.role;
  const areas = user?.unitAreas ?? [];
  const isUnit = role === "UNIT";
  /** A unit viewer sees a part of the system only when the admin granted one of its areas. */
  const unitHas = (...wanted: string[]) => !isUnit || wanted.some((a) => areas.includes(a));
  const viewer = role === "PRESIDENT" || isUnit;
  const is = (...roles: string[]) => !!role && roles.includes(role);

  // Only these roles look across colleges; everyone else belongs to one.
  const canSwitch = role === "ADMIN" || role === "PRESIDENT" || isUnit;
  const list = colleges ?? [];
  const locked = !canSwitch || list.length <= 1;
  const viewed = locked ? list[0] ?? null : list.find((c) => c.id === viewId) ?? null;

  const groups: NavGroupDef[] = [
    {
      title: "Scheduling",
      scoped: true,
      items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: !viewer },
        { to: "/scheduler", label: "Scheduler", icon: CalendarRange, show: is("CHAIRMAN") },
        { to: "/requests", label: "Requests", icon: Inbox, show: is("CHAIRMAN", "ADMIN", "DEAN", "COLLEGE_SECRETARY"), requests: true },
        { to: "/room-sharing", label: "Room sharing", icon: Share2, show: is("CHAIRMAN", "DEAN", "COLLEGE_SECRETARY"), roomShare: true },
        { to: "/schedules/faculty", label: "Faculty schedule", icon: UserCircle, show: role !== "FACULTY" && unitHas("SCHEDULES") },
        { to: "/schedules/student-class", label: "Class schedule", icon: GraduationCap, show: unitHas("SCHEDULES") },
        { to: "/schedules/rooms", label: "Room availability", icon: DoorOpen, show: unitHas("SCHEDULES", "ROOMS") },
      ],
    },
    {
      title: "College setup",
      scoped: true,
      items: [
        { to: "/rooms", label: "Rooms", icon: Building, show: is("ADMIN", "DEAN", "CHAIRMAN", "OFFICER", "COLLEGE_SECRETARY", "PRESIDENT") || (isUnit && unitHas("ROOMS")) },
        { to: "/departments", label: "Departments", icon: Building2, show: is("ADMIN", "OFFICER", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY", "PRESIDENT") || (isUnit && unitHas("CURRICULUM")) },
        { to: "/curriculum", label: "Curriculum", icon: BookOpen, show: is("ADMIN", "OFFICER", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY", "PRESIDENT") || (isUnit && unitHas("CURRICULUM")) },
        { to: "/subjects", label: "Subjects", icon: BookMarked, show: is("ADMIN", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY", "PRESIDENT") || (isUnit && unitHas("CURRICULUM")) },
        { to: "/student-classes", label: "Student classes", icon: GraduationCap, show: is("ADMIN", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY", "PRESIDENT") || (isUnit && unitHas("CURRICULUM")) },
        { to: "/faculty", label: "Faculty", icon: Users, show: is("CHAIRMAN", "DEAN") || (isUnit && unitHas("FACULTY")) },
        { to: "/ge-subjects", label: "GE subjects", icon: FileSpreadsheet, show: is("ADMIN", "DEAN", "COLLEGE_SECRETARY") },
        { to: "/admin/scheduling-rules", label: "Scheduling rules", icon: SlidersHorizontal, show: is("ADMIN", "COLLEGE_SECRETARY") },
      ],
    },
    {
      title: "University setup",
      items: [
        { to: "/university", label: "Overview", icon: Landmark, show: is("ADMIN", "PRESIDENT", "UNIT") },
        { to: "/colleges", label: "Colleges", icon: Building, show: is("ADMIN") },
        { to: "/users", label: "Users", icon: Users, show: is("ADMIN") },
        { to: "/academic-years", label: "Academic years", icon: Calendar, show: is("ADMIN", "DEAN", "COLLEGE_SECRETARY", "PRESIDENT", "UNIT") },
      ],
    },
    {
      title: "Reports",
      items: [
        { to: "/reports", label: "Reports", icon: FileText, show: unitHas("REPORTS") },
        { to: "/audit-log", label: "Audit log", icon: ScrollText, show: is("ADMIN", "DEAN", "COLLEGE_SECRETARY") },
      ],
    },
  ];

  const sidebar = (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-surface">
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3">
        <CollegeSwitcher
          colleges={list}
          value={locked ? viewed?.id ?? null : viewId}
          onChange={setViewCollege}
          locked={locked}
          allLabel={isUnit ? "All my colleges" : "All colleges"}
        />

        {groups.map((g) => {
          const items = g.items.filter((i) => i.show);
          if (items.length === 0) return null;
          return (
            <div key={g.title} className="mt-3 space-y-1">
              <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                {g.title}
                {g.scoped && <ScopeTag college={viewed} />}
              </div>
              {items.map((i) =>
                i.requests ? (
                  <RequestsNavItem key={i.to} onClose={onClose} />
                ) : i.roomShare ? (
                  <RoomShareNavItem key={i.to} onClose={onClose} />
                ) : (
                  <NavItem key={i.to} to={i.to} icon={i.icon} onClose={onClose}>
                    {i.label}
                  </NavItem>
                )
              )}
            </div>
          );
        })}

        {experimentalFeatures.length > 0 && (
          <div className="mt-3 space-y-1">
            <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-foreground-muted">Experimental</div>
            {experimentalFeatures.map((feature) => (
              <NavItem key={feature.key} to={feature.routePath} icon={FlaskConical} onClose={onClose}>
                {feature.sidebarLabel}
              </NavItem>
            ))}
          </div>
        )}

        <Separator.Root className="my-2 h-px shrink-0 bg-border" />
        <div className="space-y-1">
          {role === "ADMIN" && (
            <NavItem to="/trash" icon={Trash2} onClose={onClose}>
              Trash
            </NavItem>
          )}
          <NavItem to="/profile" icon={User} onClose={onClose}>Profile</NavItem>
          <NavItem to="/about" icon={Info} onClose={onClose}>About</NavItem>
          <NavItem to="/feedback" icon={MessageSquarePlus} onClose={onClose}>Feedback</NavItem>
        </div>
      </nav>
    </aside>
  );

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:sticky md:top-14 md:flex md:h-[calc(100vh-3.5rem)] md:flex-shrink-0 md:self-start">{sidebar}</div>
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
