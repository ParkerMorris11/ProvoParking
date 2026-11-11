export function adminIdentity(username) {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,31}$/.test(normalized)) throw new Error("Use a username of 3–32 characters: start with a letter and use letters, numbers, dots, underscores or hyphens.");
  // This is an Auth identifier, not a mailbox. Provision it with the Auth admin API.
  // Knowing an identifier grants no privileges: the private database allowlist does.
  return `${normalized}@admin.provoparking.invalid`;
}

export const METRICS = [
  { key: "signups", kr: "KR 1a", title: "User sign-ups", target: 25, unit: "users", lower: false,
    help: "Number of signed-up app_user profiles linked to a real account. Demo profiles and authorized admin accounts are excluded. Target: at least 25 users." },
  { key: "favorites_average", kr: "KR 1b", title: "Favorite spots per user", target: 2, unit: "spots / user", lower: false,
    help: "Current favorite_area rows belonging to signed-up users divided by all signed-up users, including users with zero favorites. Removing a favorite reduces the count. Demo and admin accounts are excluded. Target: at least 2 per user." },
  { key: "distance_average_miles", kr: "KR 2a", title: "Parking-to-destination distance", target: 1, unit: "miles", lower: true, strict: true,
    help: "Mean straight-line distance in miles from each session’s parking_area coordinates to its saved destination building, using the haversine formula. Includes real lots and signed-up users; excludes sessions missing a destination, demo lots and admin accounts. Building and lot centers are approximate, not walking routes. Target: under 1 mile." },
  { key: "parking_average_minutes", kr: "KR 2b", title: "Time from app open to parking", target: 15, unit: "minutes", lower: true,
    help: "For each real-lot timer a signed-up user started in the main app, the minutes from the app visit linked to that session to the session’s server-stamped start, averaged. A visit opens when the app is first loaded in a browser tab (sign-in screen included) and is reused in that tab for up to an hour; each session links to that account’s latest visit opened in the hour before it started. Sessions with no linked visit, guest timers, demo lots and admins are excluded. Target: 15 minutes or less." },
];

export const OBJECTIVES = [
  { title: "Get people to use the app and find their favorite spots.", help: "Tracks adoption and saved parking spots. Together these show whether people discover the app and make it part of their parking routine." },
  { title: "Reduce user friction in parking.", help: "Tracks distance to a destination and time spent finding parking. Shorter distances and faster parking can make everyday trips easier." },
];
export const METRIC_REASONS = [
  "Shows whether the app is reaching people who can benefit from better parking information.",
  "Shows whether users find useful spots worth saving for future trips.",
  "Shows how close parking is to the places people need to reach. This is straight-line distance, not walking distance.",
  "Shows how quickly users move from opening the app to starting a parking timer; it is a proxy for parking friction, not a stopwatch of driving time.",
];
export const METRIC_SUMMARIES = [
  "Number of registered users, excluding demos and admins.",
  "Average saved spots across all registered users, including those with none.",
  "Average straight-line distance from parking to a saved destination.",
  "Average minutes from a linked app visit to starting a parking timer.",
];

export function defaultGoals() {
  return { objectives: OBJECTIVES.map(o => o.title), metrics: METRICS.map(m => ({ key: m.key, title: m.title, target: m.target })) };
}

// The measured quantities and comparison directions stay fixed; admins edit goals.
export function validateGoals(input) {
  const title = value => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 160;
  if (!input || !Array.isArray(input.objectives) || input.objectives.length !== 2 || !input.objectives.every(title)
      || !Array.isArray(input.metrics) || input.metrics.length !== METRICS.length) throw new Error("Enter both objectives and all four key results (1–160 characters each).");
  return {
    objectives: input.objectives.map(t => t.trim()),
    metrics: input.metrics.map((m, i) => {
      if (m.key !== METRICS[i].key || !title(m.title) || typeof m.target !== "number" || !Number.isFinite(m.target)
          || m.target < 0 || m.target > 1000000000 || (i === 0 && !Number.isInteger(m.target)) || (i === 2 && m.target === 0)) {
        throw new Error("Enter valid titles and targets from 0 to 1 billion. User targets must be whole numbers; distance must be greater than zero.");
      }
      return { key: m.key, title: m.title.trim(), target: m.target };
    }),
  };
}

export function metricPresentation(metric, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return { value: "—", status: "No data yet", kind: "empty" };
  const number = Number(value);
  const met = metric.lower ? metric.strict ? number < metric.target : number <= metric.target : number >= metric.target;
  const rounded = Number(number.toFixed(2));
  const label = rounded === metric.target && number !== metric.target
    ? `${number < metric.target ? "<" : ">"} ${metric.target}`
    : number.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return { value: metric.key === "signups" ? String(number) : label,
    status: met ? "Target met" : metric.lower ? "Above target" : "Building toward target",
    kind: met ? "met" : "pending" };
}
