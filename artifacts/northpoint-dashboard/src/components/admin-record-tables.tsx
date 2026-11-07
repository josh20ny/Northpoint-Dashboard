import { Pencil } from "lucide-react";
import type {
  AccessUser,
  AuditRecord,
  MinistryRecord,
  ServiceRecord,
} from "@workspace/api-client-react";
import { StatusPill, formatDate } from "@/components/kit";
import { AuditRow } from "@/components/admin-controls";

export function UserTable({
  users,
  currentUserId,
  onEdit,
}: {
  users: AccessUser[];
  currentUserId: string;
  onEdit: (user: AccessUser) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[13px]">
        <thead>
          <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3">Email</th>
            <th className="py-2 pr-3">Role</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              data-testid={`row-user-${user.id}`}
              className="border-b last:border-0"
            >
              <td className="py-3 pr-3 font-medium">
                {user.email}
                {user.id === currentUserId && (
                  <span className="ml-2 text-[10px] text-muted-foreground">You</span>
                )}
              </td>
              <td className="py-3 pr-3 capitalize">{user.role}</td>
              <td className="py-3 pr-3">
                <StatusPill status={user.status} />
              </td>
              <td className="py-3 text-right">
                <button
                  type="button"
                  onClick={() => onEdit(user)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] hover:bg-secondary"
                >
                  <Pencil className="h-3 w-3" aria-hidden />
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MinistryList({
  ministries,
  onEdit,
}: {
  ministries: MinistryRecord[];
  onEdit: (ministry: MinistryRecord) => void;
}) {
  return (
    <div className="mt-5 divide-y border-t">
      {ministries.map((ministry) => (
        <div key={ministry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <p className="text-[13px] font-medium">
              {ministry.name}
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                {ministry.code}
              </span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Active {formatDate(ministry.activeFrom ?? undefined)} –{" "}
              {ministry.activeTo ? formatDate(ministry.activeTo) : "ongoing"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onEdit(ministry)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] hover:bg-secondary"
          >
            <Pencil className="h-3 w-3" aria-hidden />
            Edit
          </button>
        </div>
      ))}
    </div>
  );
}

export function ServiceList({
  services,
  ministries,
  onEdit,
}: {
  services: ServiceRecord[];
  ministries: MinistryRecord[];
  onEdit: (service: ServiceRecord) => void;
}) {
  return (
    <div className="mt-5 divide-y border-t">
      {services.map((service) => {
        const ministry = ministries.find((item) => item.id === service.ministryId);
        return (
          <div key={service.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-[13px] font-medium">
                {ministry?.name ?? `Ministry ${service.ministryId}`} ·{" "}
                {formatDate(service.serviceDate)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatDate(service.startAt, true)} ({service.timezone}) · Capacity{" "}
                {service.capacity ?? "unknown"}
                {service.locationRef ? ` · ${service.locationRef}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onEdit(service)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] hover:bg-secondary"
            >
              <Pencil className="h-3 w-3" aria-hidden />
              Edit
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function AuditTable({ records, users }: { records: AuditRecord[]; users: AccessUser[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-[12px]">
        <thead>
          <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3">When</th>
            <th className="py-2 pr-3">Actor</th>
            <th className="py-2 pr-3">Action / target</th>
            <th className="py-2">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <AuditRow key={record.id} item={record} users={users} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
