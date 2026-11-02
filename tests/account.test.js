import test from "node:test";
import assert from "node:assert/strict";
import { checkEmail, checkPassword, checkName, describeAuthError } from "../js/domain/account.js";
import { matchPermits } from "../js/domain/permit-search.js";
import { createAuthStorage, REMEMBER_KEY } from "../js/lib/auth-storage.js";

test("email check", () => {
  assert.equal(checkEmail(""), "Enter your email address.");
  assert.match(checkEmail("liam"), /valid email/);
  assert.match(checkEmail("liam@byu"), /valid email/);
  assert.equal(checkEmail("  liam@byu.edu "), "");
});

test("password check: 8 to 72 characters for new passwords, anything for log-in", () => {
  assert.equal(checkPassword(""), "Enter your password.");
  assert.match(checkPassword("short"), /at least 8/);
  assert.equal(checkPassword("parking123"), "");
  assert.match(checkPassword("x".repeat(73)), /72 characters or fewer/);
  assert.equal(checkPassword("short", { forLogin: true }), "");
  assert.equal(checkPassword("", { forLogin: true }), "Enter your password.");
});

test("name check", () => {
  assert.equal(checkName("   "), "Enter your name.");
  assert.equal(checkName("Emma"), "");
  assert.match(checkName("x".repeat(81)), /80 characters/);
});

test("Supabase errors become plain-language messages on the right field", () => {
  const d = (e, o) => describeAuthError(e, o);
  assert.deepEqual(d({ code: "invalid_credentials", message: "Invalid login credentials", status: 400 }).field, "");
  assert.match(d({ message: "Invalid login credentials" }).message, /don't match/);
  assert.match(d({ code: "email_not_confirmed", message: "Email not confirmed" }).message, /Confirm your email/);
  assert.equal(d({ code: "user_already_exists", message: "User already registered" }).field, "email");
  assert.equal(d({ code: "weak_password", message: "Password should be at least 8 characters." }).field, "password");
  assert.equal(d({ code: "email_address_invalid", message: 'Email address "a@b.co" is invalid' }).field, "email");
  assert.match(d({ code: "over_email_send_rate_limit", message: "email rate limit exceeded", status: 429 }).message, /last hour/);
  assert.match(d({ status: 429, message: "Too many requests" }).message, /Wait a minute/);
  assert.match(d({ message: "Signups not allowed for this instance" }).message, /turned off/);
  assert.match(d({ status: 500, code: "unexpected_failure", message: "Database error saving new user" }).message, /finish setting up/);
  assert.match(d({ status: 0, message: "Failed to fetch" }).message, /internet connection/);
  assert.match(d(new TypeError("NetworkError when attempting to fetch resource.")).message, /internet connection/);
  assert.match(d({ message: "Something odd" }).message, /Something went wrong: Something odd/);
  assert.match(d(null).message, /Something went wrong/);
});

const PERMITS = [
  { permit_id: 1, permit_code: "Y", permit_name: "Y Undergraduate", issuer: "BYU", description: "Valid in Y and U lots." },
  { permit_id: 2, permit_code: "G", permit_name: "G Graduate", issuer: "BYU", description: "Valid in G, Y, and U lots." },
  { permit_id: 3, permit_code: "PP", permit_name: "Provo Residential Permit", issuer: "City of Provo", description: "Homeowners or renters." },
  { permit_id: 6, permit_code: "YM", permit_name: "YM Wymount / Foreign Language", issuer: "BYU", description: "Wymount Terrace residents." },
  { permit_id: 7, permit_code: "YV", permit_name: "YV Wyview Park", issuer: "BYU", description: "Wyview Park residents." },
];
const codes = (list) => list.map((p) => p.permit_code);

test("permit search ranks exact codes, then prefixes, then name words, then descriptions", () => {
  assert.deepEqual(codes(matchPermits(PERMITS, "")), ["Y", "G", "PP", "YM", "YV"]);
  assert.deepEqual(codes(matchPermits(PERMITS, "y")), ["Y", "YM", "YV", "G"]);
  assert.deepEqual(codes(matchPermits(PERMITS, "grad")), ["G"]);
  assert.deepEqual(codes(matchPermits(PERMITS, "wymount")), ["YM"]);
  assert.deepEqual(codes(matchPermits(PERMITS, "provo")), ["PP"]);
  assert.deepEqual(codes(matchPermits(PERMITS, "language")), ["YM"]);
  assert.deepEqual(matchPermits(PERMITS, "zzz"), []);
});

test("permit search hides permits that are already chosen", () => {
  assert.deepEqual(codes(matchPermits(PERMITS, "y", [1, 6])), ["YV", "G"]);
  assert.deepEqual(codes(matchPermits(PERMITS, "", ["3"])), ["Y", "G", "YM", "YV"]);
});

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test("Keep me signed in: on stores the session in localStorage, off in sessionStorage", () => {
  const local = fakeStorage(), session = fakeStorage();
  const store = createAuthStorage({ local, session });
  assert.equal(store.remember(), true, "on by default");
  store.setItem("sb", "token1");
  assert.equal(local.getItem("sb"), "token1");
  assert.equal(session.getItem("sb"), null);

  store.setRemember(false);
  assert.equal(local.getItem(REMEMBER_KEY), "0");
  store.setItem("sb", "token2");
  assert.equal(local.getItem("sb"), null, "moved out of localStorage");
  assert.equal(session.getItem("sb"), "token2");
  assert.equal(store.getItem("sb"), "token2");

  store.removeItem("sb");
  assert.equal(store.getItem("sb"), null);
});

test("auth storage keeps working when browser storage is blocked", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  const store = createAuthStorage({ local: broken, session: null });
  assert.equal(store.remember(), true);
  assert.doesNotThrow(() => store.setItem("sb", "x"));
  assert.equal(store.getItem("sb"), null);
  assert.doesNotThrow(() => store.removeItem("sb"));
});
