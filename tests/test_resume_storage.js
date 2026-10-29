const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const storageScript = readFileSync(path.join(projectRoot, "static", "resume-storage.js"), "utf8");

function createBrowser(storage, userId) {
  const listeners = new Map();
  const window = {
    location: { reloadCount: 0, reload() { this.reloadCount += 1; } },
    addEventListener(name, callback) {
      listeners.set(name, callback);
    }
  };
  const document = { body: { dataset: { userId } } };
  vm.runInNewContext(storageScript, { document, localStorage: storage, window });
  return { storage: window.ResumeDraftStorage, window, listeners };
}

function createLocalStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function asJson(value) {
  return JSON.stringify(value);
}

test("accounts sharing a browser get separate drafts when switching accounts", () => {
  const localStorage = createLocalStorage();
  const firstAccount = createBrowser(localStorage, "101").storage;
  const firstDraft = { data: { name: "First Account" }, entries: {} };
  firstAccount.saveDraft(firstDraft);

  const secondAccountPage = createBrowser(localStorage, "202");
  assert.equal(secondAccountPage.storage.readDraft(), null);
  secondAccountPage.storage.saveDraft({ data: { name: "Second Account" }, entries: {} });

  const firstAccountAgain = createBrowser(localStorage, "101").storage;
  assert.equal(asJson(firstAccountAgain.readDraft()), asJson(firstDraft));
  assert.notEqual(firstAccount.draftKey, secondAccountPage.storage.draftKey);
});

test("an account switch reloads another account's already-open page", () => {
  const localStorage = createLocalStorage();
  const firstAccount = createBrowser(localStorage, "101");
  createBrowser(localStorage, "202");

  firstAccount.listeners.get("storage")({ key: "forma-active-account", newValue: "202" });
  assert.equal(firstAccount.window.location.reloadCount, 1);
});

test("legacy drafts stay unassigned unless explicitly imported", () => {
  const legacyDraft = { data: { name: "Legacy Owner" }, entries: {} };
  const localStorage = createLocalStorage({ "forma-resume-draft": JSON.stringify(legacyDraft) });
  const account = createBrowser(localStorage, "303").storage;

  assert.equal(account.readDraft(), null);
  assert.equal(account.hasLegacyDraft(), true);
  assert.equal(account.importLegacyDraft(), true);
  assert.equal(asJson(account.readDraft()), asJson(legacyDraft));
  assert.equal(account.hasLegacyDraft(), false);
});

test("legacy import never overwrites an account draft", () => {
  const legacyDraft = { data: { name: "Unassigned" }, entries: {} };
  const accountDraft = { data: { name: "Current Account" }, entries: {} };
  const localStorage = createLocalStorage({ "forma-resume-draft": JSON.stringify(legacyDraft) });
  const account = createBrowser(localStorage, "404").storage;
  account.saveDraft(accountDraft);

  assert.throws(() => account.importLegacyDraft(), /A draft already exists for this account/);
  assert.equal(asJson(account.readDraft()), asJson(accountDraft));
  assert.equal(account.hasLegacyDraft(), true);
});

test("export reads only the signed-in account's draft", () => {
  const localStorage = createLocalStorage();
  const firstAccount = createBrowser(localStorage, "101").storage;
  firstAccount.saveDraft({ data: { name: "First Account" }, entries: {} });
  const secondAccount = createBrowser(localStorage, "202").storage;
  const secondDraft = { data: { name: "Second Account" }, entries: {} };
  secondAccount.saveDraft(secondDraft);

  const exported = secondAccount.buildExportData({
    profile: { name: "Second Account" },
    preferences: {},
    jobApplications: [],
    exportedAt: "2026-10-29T00:00:00.000Z"
  });
  assert.equal(asJson(exported.resumeDraft), asJson(secondDraft));
});

test("clearing a draft removes only the signed-in account's scoped draft", () => {
  const localStorage = createLocalStorage({ "forma-resume-draft": '{"data":{},"entries":{}}' });
  const firstAccount = createBrowser(localStorage, "101").storage;
  const secondAccount = createBrowser(localStorage, "202").storage;
  firstAccount.saveDraft({ data: { name: "First Account" }, entries: {} });
  secondAccount.saveDraft({ data: { name: "Second Account" }, entries: {} });

  firstAccount.clearDraft();
  assert.equal(firstAccount.readDraft(), null);
  assert.equal(secondAccount.readDraft().data.name, "Second Account");
  assert.equal(firstAccount.hasLegacyDraft(), true);

  const settingsTemplate = readFileSync(path.join(projectRoot, "templates", "settings.html"), "utf8");
  const settingsScript = readFileSync(path.join(projectRoot, "static", "settings.js"), "utf8");
  assert.match(settingsTemplate, /Clear This Account's Local Data/);
  assert.match(settingsScript, /resumeStorage\.clearDraft\(\)/);
  assert.match(settingsScript, /resume draft, and job applications from this browser/);
});
