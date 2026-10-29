import { useEffect, useRef, useState } from "react";
import { useAppSelector } from "../../store/hooks";
import { useAppDispatch } from "../../store/hooks";
import { apiClient } from "../../api/apiClient";
import { Select } from "../../components/ui/select";
import { useSchedulePalette, type SchedulePaletteId } from "../../context/SchedulePaletteContext";
import { setProfile, setUserExperimentalFeatures } from "../../store/authSlice";
import {
  experimentalFeatureCatalog,
  type ExperimentalFeatureDefinition,
} from "../../features/experimental/featureCatalog";
import type { ExperimentalFeatureKey } from "../../types/auth";
import { UserAvatar } from "../../components/ui/userAvatar";
import { Button } from "../../components/ui/button";
import { resizeImage } from "../../utils/compressImage";
import toast from "react-hot-toast";
import { getApiErrorMessage } from "../../types/api";
import { HelpTip } from "../../components/ui/helpTip";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  DEAN: "Dean",
  COLLEGE_SECRETARY: "College Secretary",
  CHAIRMAN: "Chairman",
  FACULTY: "Faculty",
  OFFICER: "Officer",
  PRESIDENT: "President",
};

const AVATAR_MAX_MB = 1;
const field = "w-full rounded border border-border-strong bg-surface px-3 py-2 text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1";

/** Name and picture: the two things a person changes about themselves. The email stays with the administrator. */
function ProfileDetailsForm() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  if (!user) return null;

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = name.trim();
    if (!next) {
      toast.error("Name is required");
      return;
    }
    setSavingName(true);
    try {
      await apiClient.patch("/users/me", { name: next });
      dispatch(setProfile({ name: next }));
      toast.success("Name saved");
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Could not save your name"));
    } finally {
      setSavingName(false);
    }
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast.error("Choose a PNG, JPEG or WebP picture");
      return;
    }
    setUploading(true);
    try {
      // a square 256 px picture is plenty for an avatar and keeps the stored bytes small
      const small = await resizeImage(file, { maxSide: 256, square: true });
      if (small.size > AVATAR_MAX_MB * 1024 * 1024) {
        toast.error(`The picture is larger than ${AVATAR_MAX_MB} MB. Choose a smaller one.`);
        return;
      }
      const form = new FormData();
      form.append("image", small);
      const { data } = await apiClient.put<{ avatarVersion: number }>("/users/me/avatar", form);
      dispatch(setProfile({ avatarVersion: data.avatarVersion }));
      toast.success("Picture saved");
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Could not save the picture"));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removePicture = async () => {
    setUploading(true);
    try {
      await apiClient.delete("/users/me/avatar");
      dispatch(setProfile({ avatarVersion: null }));
      toast.success("Picture removed");
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Could not remove the picture"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-xl overflow-hidden rounded border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-4">
        <UserAvatar id={user.id} name={user.name} version={user.avatarVersion} className="!h-20 !w-20 [&_span]:!text-xl" />
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? "Saving…" : user.avatarVersion ? "Change picture" : "Add a picture"}
            </Button>
            {user.avatarVersion ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => void removePicture()} disabled={uploading}>
                Remove
              </Button>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-foreground-muted">PNG, JPEG or WebP, up to {AVATAR_MAX_MB} MB. It is cropped to a square and shrunk for you.</p>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Choose a picture" onChange={(e) => void chooseFile(e.target.files?.[0])} />
        </div>
      </div>
      <form onSubmit={saveName} className="flex flex-wrap items-end gap-3 px-4 py-3">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="profile-name" className="mb-1 block text-sm font-medium text-foreground-muted">Name</label>
          <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={field} />
        </div>
        <Button type="submit" disabled={savingName || !name.trim() || name.trim() === user.name}>
          {savingName ? "Saving…" : "Save name"}
        </Button>
      </form>
    </div>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      await apiClient.post("/auth/request-password-reset", { currentPassword });
      setMessage({
        type: "success",
        text: "Password reset email sent. Check your inbox (or the server console in development if SMTP is not configured).",
      });
      setCurrentPassword("");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Request failed";
      setMessage({ type: "error", text: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded border border-border bg-surface overflow-hidden p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="currentPassword" className="block text-sm font-medium text-foreground">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="mt-1 block w-full max-w-xs rounded border border-border-strong px-3 py-2 text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
          />
        </div>
        {message && (
          <p className={`text-sm ${message.type === "success" ? "text-success" : "text-danger"}`}>
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 focus:ring-2 focus:ring-focus-ring focus:ring-offset-2"
        >
          {loading ? "Sending…" : "Send password reset email"}
        </button>
      </form>
    </div>
  );
}

export function UserProfilePage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const { paletteId, palettes, setPaletteId } = useSchedulePalette();
  const [expLoading, setExpLoading] = useState(false);
  const [expSaving, setExpSaving] = useState(false);
  const [expMessage, setExpMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [expEnabled, setExpEnabled] = useState<boolean>(user?.experimentalFeatures?.enabled ?? false);
  const [selectedFeatures, setSelectedFeatures] = useState<ExperimentalFeatureKey[]>(
    user?.experimentalFeatures?.features ?? []
  );

  useEffect(() => {
    if (!user?.departmentId) return;
    apiClient
      .get<{ id: string; name: string }[]>("/departments")
      .then(({ data }) => {
        const dept = data.find((d) => d.id === user.departmentId);
        setDepartmentName(dept?.name ?? null);
      })
      .catch(() => setDepartmentName(null));
  }, [user?.departmentId]);

  useEffect(() => {
    setExpEnabled(user?.experimentalFeatures?.enabled ?? false);
    setSelectedFeatures(user?.experimentalFeatures?.features ?? []);
  }, [user?.experimentalFeatures?.enabled, user?.experimentalFeatures?.features]);

  useEffect(() => {
    if (!user) return;
    setExpLoading(true);
    apiClient
      .get<{ enabled: boolean; features: ExperimentalFeatureKey[] }>("/auth/me/experimental-features")
      .then(({ data }) => {
        setExpEnabled(data.enabled);
        setSelectedFeatures(data.features);
        dispatch(setUserExperimentalFeatures(data));
      })
      .catch(() => {
        // Keep local defaults when request fails.
      })
      .finally(() => setExpLoading(false));
  }, [dispatch, user?.id]);

  const visibleFeatureCatalog = (Object.values(experimentalFeatureCatalog) as ExperimentalFeatureDefinition[]).filter(
    (feature) => (user ? feature.allowedRoles.includes(user.role) : false)
  );

  const saveExperimentalPreferences = async (
    next: { enabled?: boolean; features?: ExperimentalFeatureKey[] }
  ) => {
    const prevEnabled = expEnabled;
    const prevFeatures = selectedFeatures;
    const nextEnabled = next.enabled ?? prevEnabled;
    const nextFeatures = next.features ?? prevFeatures;

    setExpMessage(null);
    setExpSaving(true);
    setExpEnabled(nextEnabled);
    setSelectedFeatures(nextFeatures);

    try {
      const { data } = await apiClient.patch<{ enabled: boolean; features: ExperimentalFeatureKey[] }>(
        "/auth/me/experimental-features",
        next
      );
      setExpEnabled(data.enabled);
      setSelectedFeatures(data.features);
      dispatch(setUserExperimentalFeatures(data));
      setExpMessage({ type: "success", text: "Experimental feature preferences updated." });
    } catch {
      setExpEnabled(prevEnabled);
      setSelectedFeatures(prevFeatures);
      setExpMessage({ type: "error", text: "Could not update experimental preferences." });
    } finally {
      setExpSaving(false);
    }
  };

  const toggleFeature = (featureKey: ExperimentalFeatureKey, checked: boolean) => {
    const nextFeatures = checked
      ? Array.from(new Set([...selectedFeatures, featureKey]))
      : selectedFeatures.filter((feature) => feature !== featureKey);
    void saveExperimentalPreferences({ features: nextFeatures });
  };

  if (!user) {
    return (
      <div className="rounded border border-border bg-surface p-8 text-center">
        <p className="text-foreground-muted">You are not signed in.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
<h1 className="text-2xl font-semibold text-foreground">
        Profile</h1>
<HelpTip>You can change your name and your picture. Your email, role and department can be changed only by an administrator.</HelpTip>
</div>
      <ProfileDetailsForm />
      <div className="mt-4 rounded border border-border bg-surface overflow-hidden max-w-xl">
        <dl className="divide-y divide-border">
          <div className="px-4 py-3">
            <dt className="text-sm font-medium text-foreground-muted">Email</dt>
            <dd className="mt-0.5 text-foreground">{user.email}</dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-sm font-medium text-foreground-muted">Role</dt>
            <dd className="mt-0.5 text-foreground">{ROLE_LABELS[user.role] ?? user.role}</dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-sm font-medium text-foreground-muted">Department</dt>
            <dd className="mt-0.5 text-foreground">{departmentName ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <section className="mt-8 max-w-xl">
        <div className="mb-3 flex items-center gap-2">
<h2 className="text-lg font-medium text-foreground">
          Change password</h2>
<HelpTip>A reset link is sent to your email address and you choose the new password yourself. Administrators cannot view or set your password.</HelpTip>
</div>
        <ChangePasswordForm />
      </section>

      <section className="mt-8 max-w-xl">
        <div className="mb-3 flex items-center gap-2">
<h2 className="text-lg font-medium text-foreground">
          Schedule color palette</h2>
<HelpTip>Controls how subjects are coloured in the scheduler. It applies to your account on this device only.</HelpTip>
</div>
        <div className="max-w-xs">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Palette
          </label>
          <Select.Root
            value={paletteId}
            onValueChange={(value) => setPaletteId(value as SchedulePaletteId)}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {palettes.map((p) => (
                <Select.Item key={p.id} value={p.id}>
                  {p.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <p className="mt-1 text-xs text-foreground-muted">
            {palettes.find((p) => p.id === paletteId)?.description}
          </p>
        </div>
      </section>

      <section className="mt-8 max-w-xl">
        <div className="mb-3 flex items-center gap-2">
<h2 className="text-lg font-medium text-foreground">
          Experimental features</h2>
<HelpTip>Opt in to early-access modules on your account. Individual features can be enabled as they become available.</HelpTip>
</div>

        <div className="rounded border border-border bg-surface p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-border-strong"
              checked={expEnabled}
              disabled={expSaving || expLoading}
              onChange={(e) => void saveExperimentalPreferences({ enabled: e.target.checked })}
            />
            <span>
              <span className="block text-sm font-medium text-foreground">Enable experimental features</span>
              <span className="block text-xs text-foreground-muted">
                When disabled, all experimental items are hidden from the sidebar and routes.
              </span>
            </span>
          </label>

          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Select enabled experiments</p>
            {visibleFeatureCatalog.length === 0 ? (
              <p className="text-sm text-foreground-muted">No experimental features available for your role yet.</p>
            ) : (
              visibleFeatureCatalog.map((feature) => (
                <label key={feature.key} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-border-strong"
                    checked={selectedFeatures.includes(feature.key)}
                    disabled={expSaving || expLoading || !expEnabled}
                    onChange={(e) => toggleFeature(feature.key, e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{feature.label}</span>
                    <span className="block text-xs text-foreground-muted">{feature.description}</span>
                  </span>
                </label>
              ))
            )}
          </div>

          {expMessage && (
            <p className={`mt-3 text-sm ${expMessage.type === "success" ? "text-success" : "text-danger"}`}>
              {expMessage.text}
            </p>
          )}
        </div>
      </section>

    </div>
  );
}
