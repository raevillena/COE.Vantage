import { Navigate, useLocation } from "react-router-dom";
import { useAppSelector } from "../../store/hooks";
import type { Role } from "../../types/auth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

/** Redirects to /login if not authenticated; to /dashboard if role not in allowedRoles (when specified). */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, accessToken } = useAppSelector((s) => s.auth);
  const location = useLocation();

  if (!accessToken || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
