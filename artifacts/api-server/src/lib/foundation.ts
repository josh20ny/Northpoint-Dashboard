import { disabledAuthProvider } from "./auth";
import { databaseReadiness } from "./readiness";
import { reportingWeekEnding, REPORTING_TIMEZONE } from "./reporting-calendar";

const ministries = [
  [
    "service-programming",
    "Service Programming",
    "Adult environments, service plans and evaluations.",
  ],
  ["communications", "Communications", "Digital reach, campaigns and communications."],
  ["giving", "Giving", "Permission-controlled financial analytics."],
  ["connection", "Connection", "Groups, guest services and next steps."],
  ["insideout", "InsideOut", "High school ministry."],
  ["transit", "Transit", "Middle school ministry."],
  ["upstreet", "UpStreet", "Elementary ministry."],
  ["waumba-land", "Waumba Land", "Birth through preschool ministry."],
  ["special-sundays", "Special Sundays", "Christmas and Easter environments."],
  ["camp-75", "Camp 75", "Camp and event reporting; definitions pending."],
].map(([slug, name, description]) => ({ slug, name, description, status: "not_connected" }));

const integrations = [
  ["planning-center", "Planning Center", "People, Check-Ins, Giving, Groups and Services"],
  ["youtube", "YouTube", "Channel and video analytics"],
  ["meta", "Instagram & Facebook", "Social analytics; permissions require validation"],
  ["ga4", "Google Analytics 4", "Website analytics"],
  ["mailchimp", "Mailchimp", "Audience and campaign analytics"],
  ["clearstream", "Clearstream", "Messaging; authorization capabilities unverified"],
  ["podcasts", "Podcast platforms", "Capabilities and export availability unverified"],
  ["clickup", "ClickUp", "Future approved leadership reports"],
  ["sheets-forms", "Sheets & Forms", "Future approved manual and survey sources"],
].map(([id, name, purpose]) => ({ id, name, purpose, status: "not_connected" }));

export async function foundationStatus() {
  const now = new Date();
  return {
    phase: 0,
    mode: "foundation_only",
    timezone: REPORTING_TIMEZONE,
    weekEnding: reportingWeekEnding(now),
    asOf: now.toISOString(),
    quality: "no_live_data",
    auth: {
      enabled: disabledAuthProvider.enabled,
      provider: disabledAuthProvider.name,
      status: "setup_required",
    },
    database: await databaseReadiness(),
    ministries,
    integrations,
  };
}
