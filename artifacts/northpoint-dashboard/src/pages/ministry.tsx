import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useGetFoundation } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, Panel, QueryError, StatusPill, usePageTitle } from "@/components/kit";
import AttendanceDetails from "@/pages/attendance";
import { GivingTransactions, MinistryDataView } from "@/components/ministry-data";
import { GivingHealth, GivingPolicyForm } from "@/components/giving-admin";
import { isDataMinistry } from "@/lib/ministry-data";
import { useAuth } from "@workspace/replit-auth-web";

const FUTURE = [
  [
    "Weekly summary",
    "A short narrative of the week for this ministry, with the source of every figure one click away.",
  ],
  ["Trends", "Comparisons against prior weeks and seasons, once enough verified history exists."],
  ["Evidence", "The underlying records and their provenance, visible only to authorised staff."],
];
const SPD_PENDING = [
  ["Online attendance", "Online connections, kept distinct from estimated viewers or people."],
  [
    "Service capacity",
    "Capacity and attendance distribution by service, using the relevant dated capacity.",
  ],
  ["Volunteers and service plans", "Serving and programming data associated with each service."],
  ["Service scorecards", "Welcome, Music, Vision, Message, Production and Walk Away scores."],
];

export default function Ministry() {
  const { slug } = useParams<{ slug: string }>();
  const q = useGetFoundation();
  const { user } = useAuth();
  const m = q.data?.ministries.find((x) => x.slug === slug);
  usePageTitle(m?.name ?? "Ministry");

  const back = (
    <Link
      href="/ministries"
      className="mb-6 inline-flex items-center gap-1.5 rounded text-[13px] text-muted-foreground hover:text-foreground"
      data-testid="link-back-ministries"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All ministries
    </Link>
  );

  if (q.isError)
    return (
      <>
        {back}
        <QueryError error={q.error} onRetry={() => q.refetch()} />
      </>
    );
  if (q.isLoading)
    return (
      <>
        {back}
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      </>
    );
  if (!m)
    return (
      <>
        {back}
        <div
          className="rounded-xl border border-dashed bg-card/60 p-10 text-center"
          data-testid="status-not-found"
        >
          <p className="text-sm font-medium">Ministry not found</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            This ministry is not in the directory.
          </p>
        </div>
      </>
    );

  return (
    <>
      {back}
      <PageHeader
        eyebrow="Ministry"
        title={m.name}
        description={m.description}
        actions={
          <StatusPill
            status={m.status}
            label={slug === "service-programming" ? "Attendance connected" : undefined}
            testId="status-ministry"
          />
        }
      />
      {slug === "service-programming" && (
        <section
          className="mb-8"
          aria-label="Adult attendance"
          data-testid="section-ministry-attendance"
        >
          <AttendanceDetails />
        </section>
      )}
      {slug === "service-programming" && (
        <section className="mb-8" aria-label="Serving" data-testid="section-ministry-serving">
          <MinistryDataView ministry={slug} mode="serving" />
        </section>
      )}
      {isDataMinistry(slug) && (
        <>
          <section className="mb-8" aria-label="Ministry data" data-testid="section-ministry-data">
            <MinistryDataView ministry={slug} />
          </section>
          {slug === "giving" && user?.role === "admin" && (
            <section className="mb-8" aria-label="Giving transactions" data-testid="section-giving-transactions">
              <GivingTransactions />
            </section>
          )}
          {slug === "giving" && user?.role === "admin" && (
            <section className="mb-8 space-y-5" aria-label="Giving formula and units" data-testid="section-giving-policy">
              <GivingPolicyForm />
              <GivingHealth />
            </section>
          )}
        </>
      )}
      {!isDataMinistry(slug) && (<>
      <Panel
        title={
          slug === "service-programming"
            ? "Other Service Programming KPIs"
            : "Planned for this view"
        }
        meta={<span className="font-mono text-[11px] text-muted-foreground">Planned</span>}
      >
        <ol className="divide-y">
          {(slug === "service-programming" ? SPD_PENDING : FUTURE).map(([t, d], i) => (
            <li key={t} className="flex gap-4 px-5 py-4">
              <span className="font-mono text-[12px] text-muted-foreground">0{i + 1}</span>
              <div>
                <p className="text-[14px] font-medium">{t}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
      <p className="mt-4 text-[12.5px] text-muted-foreground">
        {slug === "service-programming"
          ? "The other KPIs listed above are not connected yet."
          : "No ministry reports are available."}
      </p>
      </>)}
    </>
  );
}
