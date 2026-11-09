import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { experimentalFeatureCatalog, type ExperimentalFeatureDefinition } from "../../features/experimental/featureCatalog";
import type { ExperimentalFeatureKey, ExperimentalFeaturesPreference, Role } from "../../types/auth";

/**
 * Administrator: pick which experimental features one user is allowed to switch on.
 * The user still turns them on in their Profile; without a grant the option is not offered to them.
 */
export function ExperimentalAccessDialog({
  person,
  onClose,
}: {
  person: { id: string; name: string; role: Role };
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [granted, setGranted] = useState<ExperimentalFeatureKey[]>([]);
  const [failed, setFailed] = useState(false);
  const features = (Object.values(experimentalFeatureCatalog) as ExperimentalFeatureDefinition[]).filter((feature) =>
    feature.allowedRoles.includes(person.role)
  );
  const isAdmin = person.role === "ADMIN";

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<ExperimentalFeaturesPreference>(`/users/${person.id}/experimental-features`)
      .then(({ data }) => !cancelled && setGranted(data.granted))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [person.id]);

  const toggle = (key: ExperimentalFeatureKey, on: boolean) =>
    setGranted((prev) => (on ? Array.from(new Set([...prev, key])) : prev.filter((k) => k !== key)));

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/users/${person.id}/experimental-features`, { granted });
      toast.success(`Experimental access saved for ${person.name}.`);
      onClose();
    } catch {
      toast.error("Could not save experimental access.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content
          title="Experimental access"
          description={`Choose which experimental features ${person.name} may use. They switch them on themselves in their Profile.`}
        >
          {loading ? (
            <div className="flex justify-center py-8" aria-busy="true">
              <Spinner />
            </div>
          ) : failed ? (
            <p className="py-4 text-sm text-danger">Could not load this user&apos;s access.</p>
          ) : isAdmin ? (
            <p className="py-4 text-sm text-foreground-muted">Administrators can always use every experimental feature.</p>
          ) : features.length === 0 ? (
            <p className="py-4 text-sm text-foreground-muted">There are no experimental features for the {person.role} role.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {features.map((feature) => (
                <label key={feature.key} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-border-strong"
                    checked={granted.includes(feature.key)}
                    onChange={(e) => toggle(feature.key, e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{feature.label}</span>
                    <span className="block text-xs text-foreground-muted">{feature.description}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {isAdmin || failed ? "Close" : "Cancel"}
            </Button>
            {!isAdmin && !failed && !loading && features.length > 0 && (
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
