import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  getGetAdminWorkspaceQueryKey,
  useGetAdminWorkspace,
  useCreateInvitation,
  useRevokeInvitation,
  useUpdateAccessUser,
  useCreateMinistry,
  useUpdateMinistry,
  useCreateServiceOccurrence,
  useUpdateServiceOccurrence,
  type AccessUser,
  type MinistryRecord,
  type ServiceRecord,
  type MinistryInput,
  type ServiceInput,
} from "@workspace/api-client-react";
import { ShieldCheck, Users, Mail, CalendarDays, ClipboardList, RefreshCw } from "lucide-react";
import {
  PageHeader,
  Panel,
  QueryError,
  RefreshButton,
  StatusPill,
  usePageTitle,
  formatDate,
} from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyRecord,
  FormError,
  InvitationRow,
  RestrictedState,
  SectionHeading,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/admin-controls";
import { MinistryDataAdminPanel } from "@/components/ministry-data-admin";
import { AuditTable, MinistryList, ServiceList, UserTable } from "@/components/admin-record-tables";
import {
  chicagoAbbreviation,
  chicagoDateTimeFromInstant,
  resolveChicagoServiceTime,
} from "@/lib/service-time";

const WORKSPACE_PREFIX = ["/api/v1/admin/workspace"];
const ROLES = ["staff", "leadership", "admin"] as const;
type Role = (typeof ROLES)[number];
type AccessStatus = "active" | "suspended";
const csrfRequest = (csrfToken: string | null) => ({
  request: { headers: { "X-CSRF-Token": csrfToken ?? "" } },
});
const blankMinistry = { code: "", name: "", activeFrom: "", activeTo: "" };
const blankService = {
  ministryId: "",
  serviceDate: "",
  startTime: "",
  ambiguousStartAt: "",
  capacity: "",
  locationRef: "",
  planExternalId: "",
  specialEventRef: "",
};

export default function Administration() {
  usePageTitle("Administration");
  const { user, enabled, isLoading: authLoading, csrfToken, refresh } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const params = { page };
  const q = useGetAdminWorkspace(params, {
    query: {
      enabled: user?.role === "admin",
      queryKey: getGetAdminWorkspaceQueryKey(params),
      staleTime: 30000,
      refetchOnWindowFocus: true,
    },
  });
  const workspace = q.data;
  const invalidateWorkspace = () => queryClient.invalidateQueries({ queryKey: WORKSPACE_PREFIX });

  const invitationMutation = useCreateInvitation(csrfRequest(csrfToken));
  const revokeMutation = useRevokeInvitation(csrfRequest(csrfToken));
  const userMutation = useUpdateAccessUser(csrfRequest(csrfToken));
  const ministryCreateMutation = useCreateMinistry(csrfRequest(csrfToken));
  const ministryUpdateMutation = useUpdateMinistry(csrfRequest(csrfToken));
  const serviceCreateMutation = useCreateServiceOccurrence(csrfRequest(csrfToken));
  const serviceUpdateMutation = useUpdateServiceOccurrence(csrfRequest(csrfToken));

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("staff");
  const [editingUser, setEditingUser] = useState<AccessUser | null>(null);
  const [userRole, setUserRole] = useState<Role>("staff");
  const [userStatus, setUserStatus] = useState<AccessStatus>("active");
  const [ministryId, setMinistryId] = useState("");
  const [ministry, setMinistry] = useState(blankMinistry);
  const [serviceId, setServiceId] = useState("");
  const [service, setService] = useState(blankService);
  const serviceTimeResolution = resolveChicagoServiceTime(service.serviceDate, service.startTime);
  const selectedServiceStartAt =
    serviceTimeResolution.kind === "valid"
      ? serviceTimeResolution.instant
      : serviceTimeResolution.kind === "ambiguous"
        ? (serviceTimeResolution.instants.find((instant) => instant === service.ambiguousStartAt) ??
          null)
        : null;

  const notifyMutationSuccess = () => {
    void invalidateWorkspace();
  };
  const submitInvitation = (e: FormEvent) => {
    e.preventDefault();
    invitationMutation.mutate(
      { data: { email: inviteEmail.trim(), role: inviteRole } },
      {
        onSuccess: () => {
          setInviteEmail("");
          setInviteRole("staff");
          notifyMutationSuccess();
        },
      },
    );
  };
  const submitUser = (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (
      editingUser.id === user?.id &&
      (userRole !== editingUser.role || userStatus !== editingUser.status) &&
      !window.confirm("Changing your own access may end this session. Continue?")
    )
      return;
    userMutation.mutate(
      { id: editingUser.id, data: { role: userRole, status: userStatus } },
      {
        onSuccess: () => {
          setEditingUser(null);
          notifyMutationSuccess();
          if (editingUser.id === user?.id) void refresh();
        },
      },
    );
  };
  const toMinistryInput = (): MinistryInput => ({
    code: ministry.code.trim(),
    name: ministry.name.trim(),
    activeFrom: ministry.activeFrom || null,
    activeTo: ministry.activeTo || null,
  });
  const submitMinistry = (e: FormEvent) => {
    e.preventDefault();
    const data = toMinistryInput();
    const onSuccess = () => {
      setMinistryId("");
      setMinistry(blankMinistry);
      notifyMutationSuccess();
    };
    if (ministryId) ministryUpdateMutation.mutate({ id: ministryId, data }, { onSuccess });
    else ministryCreateMutation.mutate({ data }, { onSuccess });
  };
  const beginEditMinistry = (item: MinistryRecord) => {
    setMinistryId(item.id);
    setMinistry({
      code: item.code,
      name: item.name,
      activeFrom: item.activeFrom ?? "",
      activeTo: item.activeTo ?? "",
    });
  };
  const toServiceInput = (startAt: string): ServiceInput => ({
    ministryId: service.ministryId,
    serviceDate: service.serviceDate,
    startAt,
    capacity: service.capacity.trim() === "" ? null : Number(service.capacity),
    locationRef: service.locationRef.trim() || null,
    planExternalId: service.planExternalId.trim() || null,
    specialEventRef: service.specialEventRef.trim() || null,
  });
  const submitService = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedServiceStartAt) return;
    const data = toServiceInput(selectedServiceStartAt);
    const onSuccess = () => {
      setServiceId("");
      setService(blankService);
      notifyMutationSuccess();
    };
    if (serviceId) serviceUpdateMutation.mutate({ id: serviceId, data }, { onSuccess });
    else serviceCreateMutation.mutate({ data }, { onSuccess });
  };
  const beginEditService = (item: ServiceRecord) => {
    const localDateTime = chicagoDateTimeFromInstant(item.startAt);
    const resolution = resolveChicagoServiceTime(localDateTime.date, localDateTime.time);
    setServiceId(item.id);
    setService({
      ministryId: item.ministryId,
      serviceDate: localDateTime.date,
      startTime: localDateTime.time,
      ambiguousStartAt:
        resolution.kind === "ambiguous"
          ? (resolution.instants.find(
              (instant) => instant === new Date(item.startAt).toISOString(),
            ) ?? "")
          : "",
      capacity: item.capacity === null ? "" : String(item.capacity),
      locationRef: item.locationRef ?? "",
      planExternalId: item.planExternalId ?? "",
      specialEventRef: item.specialEventRef ?? "",
    });
  };

  if (authLoading)
    return (
      <>
        <PageHeader
          eyebrow="Access"
          title="Administration"
          description="Access and ministry configuration."
        />
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </>
    );
  if (!enabled)
    return (
      <>
        <PageHeader
          eyebrow="Access"
          title="Administration"
          description="Access and ministry configuration."
        />
        <RestrictedState
          title="Authentication is not enabled"
          detail="Administrative configuration is unavailable until invite-only sign-in is enabled."
        />
      </>
    );
  if (!user)
    return (
      <>
        <PageHeader
          eyebrow="Restricted"
          title="Administration"
          description="Access and ministry configuration."
        />
        <RestrictedState
          title="Log in to continue"
          detail="This workspace is limited to verified Northpoint Austin staff. Invitations are issued by an administrator."
        />
      </>
    );
  if (user.role !== "admin")
    return (
      <>
        <PageHeader
          eyebrow="Restricted"
          title="Administration"
          description="Access and ministry configuration."
        />
        <RestrictedState
          title="Administrator access required"
          detail={`Signed in as ${user.email} · ${user.role}. Your current role does not have access to configuration.`}
        />
      </>
    );

  const mutationBusy =
    invitationMutation.isPending ||
    revokeMutation.isPending ||
    userMutation.isPending ||
    ministryCreateMutation.isPending ||
    ministryUpdateMutation.isPending ||
    serviceCreateMutation.isPending ||
    serviceUpdateMutation.isPending;
  return (
    <>
      <PageHeader
        eyebrow="Northpoint Austin · Admin"
        title="Administration"
        description="Manage invited access, ministry records, service dates, and the configuration audit."
        actions={
          <>
            <Link
              href="/administration/imports"
              data-testid="link-admin-imports"
              className="inline-flex h-9 items-center rounded-lg border bg-card px-3 text-[13px] font-medium hover:bg-secondary"
            >
              Workbook imports
            </Link>
            <RefreshButton busy={q.isFetching} onClick={() => void q.refetch()} />
          </>
        }
      />
      {q.isRefetchError && workspace && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
        >
          <span>
            Refresh failed. Showing the last loaded admin data from{" "}
            {formatDate(workspace.asOf, true)}.
          </span>
          <button
            type="button"
            onClick={() => void q.refetch()}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-amber-400 px-2.5 text-[12px] font-medium hover:bg-amber-100"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
          </button>
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-[13px] font-medium">{user.email}</span>
          <StatusPill status={user.role} label="Admin" />
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          {workspace
            ? `Updated ${formatDate(workspace.asOf, true)} · Page ${workspace.page}`
            : "Admin workspace"}
        </p>
      </div>
      {mutationBusy && (
        <p role="status" className="sr-only">
          Saving configuration changes
        </p>
      )}
      {q.isError && !workspace ? (
        <QueryError
          title="Admin workspace unavailable"
          error={q.error}
          onRetry={() => void q.refetch()}
        />
      ) : q.isLoading || !workspace ? (
        <div className="space-y-4">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-60 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <div className="space-y-5">
            <Panel className="p-5 sm:p-6">
              <SectionHeading
                icon={Users}
                title="User access"
                detail="Edit active accounts. Suspension or role changes may revoke a session."
              />
              {workspace.users.length === 0 ? (
                <EmptyRecord>There are no user accounts on this page.</EmptyRecord>
              ) : (
                <UserTable
                  users={workspace.users}
                  currentUserId={user.id}
                  onEdit={(item) => {
                    setEditingUser(item);
                    setUserRole(item.role);
                    setUserStatus(item.status);
                  }}
                />
              )}
              {editingUser && (
                <form
                  onSubmit={submitUser}
                  className="mt-4 grid gap-3 rounded-lg border bg-muted/35 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                >
                  <p className="sm:col-span-3 text-[12px] text-muted-foreground">
                    Updating managed account:{" "}
                    <strong className="text-foreground">{editingUser.email}</strong>
                  </p>
                  <SelectField
                    name="managed-role"
                    label="Managed account role"
                    value={userRole}
                    onChange={(v) => setUserRole(v as Role)}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    name="managed-status"
                    label="Account status"
                    value={userStatus}
                    onChange={(v) => setUserStatus(v as AccessStatus)}
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </SelectField>
                  <div className="flex gap-2">
                    <SubmitButton pending={userMutation.isPending}>Save access</SubmitButton>
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="h-9 rounded-md border px-3 text-[12px]"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="sm:col-span-3 text-[11px] text-muted-foreground">
                    This changes the selected account only; it does not change your current role.
                  </p>
                  <div className="sm:col-span-3">
                    <FormError error={userMutation.error} />
                  </div>
                </form>
              )}
            </Panel>

            <Panel className="p-5 sm:p-6">
              <SectionHeading
                icon={Mail}
                title="Invitations"
                detail="Invite a verified email address to staff, leadership, or admin access."
              />
              <form
                onSubmit={submitInvitation}
                className="grid gap-3 sm:grid-cols-[1.5fr_1fr_auto] sm:items-end"
              >
                <TextField
                  name="invite-email"
                  label="Email address"
                  type="email"
                  value={inviteEmail}
                  onChange={setInviteEmail}
                  required
                  placeholder="name@example.org"
                />
                <SelectField
                  name="invite-role"
                  label="Invitation role"
                  value={inviteRole}
                  onChange={(v) => setInviteRole(v as Role)}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </SelectField>
                <SubmitButton pending={invitationMutation.isPending}>
                  Create invitation
                </SubmitButton>
              </form>
              <p className="mt-3 rounded-md bg-accent/55 px-3 py-2.5 text-[12px] leading-relaxed text-accent-foreground">
                Invite reserves access; share dashboard link separately. No email is sent. An
                invitation expires after 7 days.
              </p>
              <div className="mt-4">
                <FormError error={invitationMutation.error} />
              </div>
              {workspace.invitations.length === 0 ? (
                <EmptyRecord>No invitations on this page.</EmptyRecord>
              ) : (
                <div className="mt-4 divide-y border-t">
                  {workspace.invitations.map((item) => (
                    <InvitationRow
                      key={item.id}
                      item={item}
                      busy={revokeMutation.isPending}
                      onRevoke={() => {
                        if (window.confirm(`Revoke the unused invitation for ${item.email}?`))
                          revokeMutation.mutate(
                            { id: item.id },
                            { onSuccess: notifyMutationSuccess },
                          );
                      }}
                    />
                  ))}
                </div>
              )}
              <FormError error={revokeMutation.error} />
            </Panel>

            <Panel className="p-5 sm:p-6">
              <SectionHeading
                icon={ClipboardList}
                title="Ministries"
                detail="Create reporting groups. Set an end date to archive while keeping history."
              />
              <p className="mb-3 rounded-md bg-accent/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                Setup records only. This does not import Planning Center data or calculate metrics.
              </p>
              <form onSubmit={submitMinistry} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    name="ministry-code"
                    label="Code"
                    value={ministry.code}
                    onChange={(v) => setMinistry({ ...ministry, code: v })}
                    required
                    pattern="^[a-z][a-z0-9-]{1,59}$"
                    placeholder="care-team"
                    hint="Unique, stable ID; lowercase letters, numbers, or hyphens (for example, care-team)."
                  />
                  <TextField
                    name="ministry-name"
                    label="Name"
                    value={ministry.name}
                    onChange={(v) => setMinistry({ ...ministry, name: v })}
                    required
                    hint="Readable name shown in the dashboard."
                  />
                  <TextField
                    name="ministry-active-from"
                    label="Active from"
                    type="date"
                    value={ministry.activeFrom}
                    onChange={(v) => setMinistry({ ...ministry, activeFrom: v })}
                    hint="Optional; leave blank if unknown."
                  />
                  <TextField
                    name="ministry-active-to"
                    label="Active to"
                    type="date"
                    value={ministry.activeTo}
                    onChange={(v) => setMinistry({ ...ministry, activeTo: v })}
                    hint="Use an end date to archive; records are not deleted."
                  />
                </div>
                <FormError error={ministryCreateMutation.error || ministryUpdateMutation.error} />
                <div className="flex gap-2">
                  <SubmitButton
                    pending={ministryCreateMutation.isPending || ministryUpdateMutation.isPending}
                  >
                    {ministryId ? "Save ministry" : "Add ministry"}
                  </SubmitButton>
                  {ministryId && (
                    <button
                      type="button"
                      onClick={() => {
                        setMinistryId("");
                        setMinistry(blankMinistry);
                      }}
                      className="h-9 rounded-md border px-3 text-[12px]"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              </form>
              {workspace.ministries.length === 0 ? (
                <EmptyRecord>No ministries configured on this page.</EmptyRecord>
              ) : (
                <MinistryList ministries={workspace.ministries} onEdit={beginEditMinistry} />
              )}
            </Panel>

            <Panel className="p-5 sm:p-6">
              <SectionHeading
                icon={CalendarDays}
                title="Service occurrences"
                detail="Enter one record for each service date; no recurring schedule is assumed."
              />
              <p className="mb-3 rounded-md bg-accent/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                Setup records only. This does not import Planning Center data or calculate metrics.
              </p>
              <form onSubmit={submitService} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    name="service-ministry"
                    label="Configured ministry"
                    value={service.ministryId}
                    onChange={(v) => setService({ ...service, ministryId: v })}
                  >
                    {service.ministryId &&
                      !workspace.ministries.some((m) => m.id === service.ministryId) && (
                        <option value={service.ministryId}>
                          Previously selected ministry (not on this page)
                        </option>
                      )}
                    {workspace.ministries.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.code}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    name="service-date"
                    label="Service date"
                    type="date"
                    value={service.serviceDate}
                    onChange={(v) =>
                      setService({ ...service, serviceDate: v, ambiguousStartAt: "" })
                    }
                    required
                    hint="Use the service's calendar date in Chicago."
                  />
                  <TextField
                    name="service-start-at"
                    label="Start time (Chicago)"
                    type="time"
                    step={1}
                    value={service.startTime}
                    onChange={(v) => setService({ ...service, startTime: v, ambiguousStartAt: "" })}
                    required
                    hint="Enter the local start time in America/Chicago."
                  />
                  {serviceTimeResolution.kind === "ambiguous" && (
                    <SelectField
                      name="service-time-occurrence"
                      label="Which occurrence?"
                      value={service.ambiguousStartAt}
                      onChange={(v) => setService({ ...service, ambiguousStartAt: v })}
                    >
                      {serviceTimeResolution.instants.map((instant, index) => (
                        <option key={instant} value={instant}>
                          {index === 0 ? "First" : "Second"} occurrence (
                          {chicagoAbbreviation(instant)})
                        </option>
                      ))}
                    </SelectField>
                  )}
                  <TextField
                    name="service-capacity"
                    label="Capacity"
                    type="number"
                    min={0}
                    max={1000000}
                    step={1}
                    value={service.capacity}
                    onChange={(v) => setService({ ...service, capacity: v })}
                    placeholder="Leave blank if unknown"
                    hint="Blank means unknown; enter 0 only if capacity is zero."
                  />
                  <TextField
                    name="service-location"
                    label="Location reference"
                    value={service.locationRef}
                    onChange={(v) => setService({ ...service, locationRef: v })}
                    hint="Optional reference only; it does not connect to a location system."
                  />
                  <TextField
                    name="service-plan-id"
                    label="Plan external ID"
                    value={service.planExternalId}
                    onChange={(v) => setService({ ...service, planExternalId: v })}
                    hint="Optional external ID only; no service plan is imported."
                  />
                  <TextField
                    name="service-event-ref"
                    label="Special event reference"
                    value={service.specialEventRef}
                    onChange={(v) => setService({ ...service, specialEventRef: v })}
                    hint="Optional reference only; it does not link event data."
                  />
                </div>
                <FormError error={serviceCreateMutation.error || serviceUpdateMutation.error} />
                <div className="flex gap-2">
                  <SubmitButton
                    pending={serviceCreateMutation.isPending || serviceUpdateMutation.isPending}
                  >
                    {serviceId ? "Save occurrence" : "Add occurrence"}
                  </SubmitButton>
                  {serviceId && (
                    <button
                      type="button"
                      onClick={() => {
                        setServiceId("");
                        setService(blankService);
                      }}
                      className="h-9 rounded-md border px-3 text-[12px]"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
                {service.serviceDate &&
                  service.startTime &&
                  serviceTimeResolution.kind === "nonexistent" && (
                    <p role="alert" className="text-[12px] text-destructive">
                      This Chicago local time does not exist because clocks move forward. Choose
                      another start time.
                    </p>
                  )}
                {serviceTimeResolution.kind === "ambiguous" && !service.ambiguousStartAt && (
                  <p role="alert" className="text-[12px] text-destructive">
                    This Chicago local time occurs twice when clocks move back. Select the first or
                    second occurrence.
                  </p>
                )}
              </form>
              {workspace.services.length === 0 ? (
                <EmptyRecord>No dated service occurrences configured on this page.</EmptyRecord>
              ) : (
                <ServiceList
                  services={workspace.services}
                  ministries={workspace.ministries}
                  onEdit={beginEditService}
                />
              )}
            </Panel>

            <MinistryDataAdminPanel />

            <Panel className="p-5 sm:p-6">
              <SectionHeading
                icon={ClipboardList}
                title="Audit"
                detail="Read-only activity log. No personal data snapshots are shown."
              />
              {workspace.audit.length === 0 ? (
                <EmptyRecord>No audit entries on this page.</EmptyRecord>
              ) : (
                <AuditTable records={workspace.audit} users={workspace.users} />
              )}
            </Panel>
          </div>
          <div className="mt-5 flex items-center justify-between border-t pt-4">
            <span className="text-[11px] text-muted-foreground">
              Page {workspace.page} · {workspace.quality}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="button-page-previous"
                disabled={page <= 1 || q.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 rounded-md border px-3 text-[12px] disabled:opacity-45"
              >
                Previous
              </button>
              <button
                type="button"
                data-testid="button-page-next"
                disabled={!workspace.hasMore || q.isFetching}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 rounded-md border px-3 text-[12px] disabled:opacity-45"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
