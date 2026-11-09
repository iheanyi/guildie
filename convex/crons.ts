import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("sync guild rosters", { hours: 1 }, internal.sync.syncAll, {});

export default crons;
