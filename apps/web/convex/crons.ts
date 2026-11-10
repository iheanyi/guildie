import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("sync guild rosters", { hours: 1 }, internal.sync.syncAll, {});
crons.weekly("sync recipe catalog", { dayOfWeek: "tuesday", hourUTC: 9, minuteUTC: 0 }, internal.recipes.syncCatalog, {});

export default crons;
