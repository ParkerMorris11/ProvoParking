import test from "node:test";
import assert from "node:assert/strict";
import { initAuth, hideAuth, showAuth } from "../js/pages/auth.js";
import { state } from "../js/state.js";

function setup(onSignedIn = async () => hideAuth()) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, inert: false, value: "", type: "password", checked: true,
      disabled: false, textContent: id === "li-submit" ? "Log in" : "",
      dataset: {}, listeners: {}, attrs: {},
      classList: { toggle() {} },
      setAttribute(k,v) { this.attrs[k] = v; },
      removeAttribute(k) { delete this.attrs[k]; },
      getAttribute(k) { return this.attrs[k]; },
      addEventListener(k,v) { this.listeners[k] = v; },
      querySelector() { return null; },
      focus() { document.activeElement = this; },
    });
    return elements.get(id);
  };
  globalThis.document = { getElementById: get, querySelectorAll: () => [], activeElement: null };
  globalThis.window = { scrollTo() {} };
  globalThis.location = { hash: "" };
  get("auth-loading").hidden = true;
  get("li-email").value = "james@example.com";
  get("li-password").value = "password";
  initAuth({ onSignedIn, onGuest: async () => {}, authStorage: { setRemember() {}, remember() { return true; } } });
  return { get, submit: () => get("login-form").listeners.submit({ preventDefault() {} }) };
}

test("invalid login stays on the form without showing the transition", async () => {
  const { get, submit } = setup();
  get("li-email").value = "";
  await submit();
  assert.equal(get("auth-loading").hidden, true);
  assert.equal(get("li-email").attrs["aria-invalid"], "true");
});

test("login stays busy through account loading, blocks duplicate submits, then enters app", async () => {
  let finishLogin, finishAccount, calls = 0;
  const account = new Promise(resolve => { finishAccount = resolve; });
  const { get, submit } = setup(async () => { await account; hideAuth(); });
  state.db = { auth: { signInWithPassword: () => {
    calls++;
    return new Promise(resolve => { finishLogin = resolve; });
  } } };
  const pending = submit();
  assert.equal(get("auth-loading").hidden, false);
  assert.equal(get("auth-screen").inert, true);
  assert.equal(document.activeElement, get("auth-loading"));
  await submit();
  assert.equal(calls, 1);
  finishLogin({ data: { session: { user: { id: "account" } } }, error: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get("auth-loading").hidden, false);
  assert.equal(get("li-submit").disabled, true);
  finishAccount();
  await pending;
  assert.equal(get("auth-loading").hidden, true);
  assert.equal(get("auth-screen").inert, false);
  assert.equal(get("auth-screen").hidden, true);
  assert.equal(get("li-submit").disabled, false);
});

test("a failed login removes the transition and allows a retry", async () => {
  const { get, submit } = setup();
  state.db = { auth: { signInWithPassword: async () => ({
    data: {}, error: { message: "Invalid login credentials" },
  }) } };
  const oldWarn = console.warn;
  console.warn = () => {};
  try { await submit(); } finally { console.warn = oldWarn; }
  assert.equal(get("auth-loading").hidden, true);
  assert.equal(get("auth-screen").inert, false);
  assert.equal(get("li-submit").disabled, false);
  assert.equal(get("auth-msg").hidden, false);
  assert.match(get("auth-msg").textContent, /don't match/);
  assert.equal(document.activeElement, get("li-email"));
});

test("returning to an auth form clears the loading screen", () => {
  const { get } = setup();
  // An existing-account screen avoids starting a permit data request in this unit test.
  get("auth-loading").hidden = false;
  get("auth-screen").inert = true;
  showAuth("login");
  assert.equal(get("auth-loading").hidden, true);
  assert.equal(get("auth-screen").inert, false);
});
