// Every Supabase Auth call, plus loading the signed-in user's profile (app_user + user_permit).
// The database creates the profile and permits at sign-up (see
// supabase/migrations/20261102040636_account_sign_in.sql), so the browser never inserts them.
import { state } from "../state.js";

const pageUrl = () => window.location.origin + window.location.pathname;

export async function getCurrentSession() {
  const { data, error } = await state.db.auth.getSession();
  if (error) throw error;
  return data.session;
}

// Returns { session } when the account can be used right away, or { session: null } when
// Supabase sent a confirmation email first. Throws on any error, including an email that is taken.
export async function signUp({ email, password, displayName, permitIds }) {
  const { data, error } = await state.db.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: pageUrl(),
      data: { display_name: displayName, permit_ids: permitIds },
    },
  });
  if (error) throw error;
  // With email confirmation on, Supabase hides "already registered" by returning a user with no identities.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw Object.assign(new Error("User already registered"), { code: "user_already_exists" });
  }
  return { session: data.session };
}

export async function logIn(email, password) {
  const { data, error } = await state.db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function logOut() {
  const { error } = await state.db.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  const { error } = await state.db.auth.resetPasswordForEmail(email, { redirectTo: pageUrl() });
  if (error) throw error;
}

export async function setNewPassword(password) {
  const { error } = await state.db.auth.updateUser({ password });
  if (error) throw error;
}

export function onAuthChange(callback) {
  return state.db.auth.onAuthStateChange((event, session) => callback(event, session));
}

// The signed-in user's profile: { userId, displayName, email, permitIds }. Row security only
// returns the caller's own rows. Returns null if the account has no profile yet.
export async function loadProfile(authId) {
  const { data, error } = await state.db.from("app_user")
    .select("user_id, display_name, email, user_permit(permit_id)")
    .eq("auth_id", authId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    userId: data.user_id,
    displayName: data.display_name,
    email: data.email,
    permitIds: (data.user_permit || []).map((up) => up.permit_id),
  };
}
