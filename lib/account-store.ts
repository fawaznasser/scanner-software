import "server-only";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { DmsUser } from "@/data/users";

export type Account = DmsUser & { salt: string; passwordHash: string; sessionVersion: number };
const accountsPath = path.join(process.cwd(), ".data", "accounts.json");
export function readAccounts(): Account[] {
  try { return JSON.parse(readFileSync(accountsPath, "utf8")) as Account[]; }
  catch { return []; }
}
export function saveAccounts(accounts: Account[]) {
  const temporary = `${accountsPath}.${randomBytes(8).toString("hex")}.tmp`;
  writeFileSync(temporary, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  renameSync(temporary, accountsPath);
}
export function publicUser({ id, name, email, initials, role }: Account): DmsUser {
  return { id, name, email, initials, role };
}
export function getSessionVersion(id: string) { return readAccounts().find((user) => user.id === id)?.sessionVersion ?? 0; }
export function verifyPassword(email: string, password: string): DmsUser | null {
  const account = readAccounts().find((user) => user.email === email.trim().toLowerCase());
  const derived = scryptSync(password, account?.salt ?? "invalid-account-salt", 64);
  const expected = account ? Buffer.from(account.passwordHash, "hex") : Buffer.alloc(64);
  return account && expected.length === derived.length && timingSafeEqual(expected, derived) ? publicUser(account) : null;
}
export function changeUserPassword(id: string, currentPassword: string, newPassword: string) {
  const accounts = readAccounts();
  const account = accounts.find((candidate) => candidate.id === id);
  if (!account || !verifyPassword(account.email, currentPassword)) throw new Error("Current password is incorrect.");
  if (newPassword.length < 12 || newPassword.length > 128) throw new Error("Use between 12 and 128 characters for your new password.");
  account.salt = randomBytes(16).toString("hex");
  account.passwordHash = scryptSync(newPassword, account.salt, 64).toString("hex");
  account.sessionVersion += 1;
  saveAccounts(accounts);
  return publicUser(account);
}
