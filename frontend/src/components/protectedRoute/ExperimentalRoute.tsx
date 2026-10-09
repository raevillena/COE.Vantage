import { Navigate } from "react-router-dom";
import { useAppSelector } from "../../store/hooks";
import type { ExperimentalFeatureKey } from "../../types/auth";
import { hasExperimentalFeatureEnabled } from "../../features/experimental/featureCatalog";

interface ExperimentalRouteProps {
  featureKey: ExperimentalFeatureKey;
  children: React.ReactNode;
}

export function ExperimentalRoute({ featureKey, children }: ExperimentalRouteProps) {
  const user = useAppSelector((s) => s.auth.user);
  if (!hasExperimentalFeatureEnabled(user, featureKey)) {
    return <Navigate to="/profile" replace />;
  }
  return <>{children}</>;
}

