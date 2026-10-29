import "server-only";

import type { DmsUser, UserRole } from "@/data/users";
import { readAccounts, saveAccounts, publicUser } from "@/lib/account-store";

declare global {
  var __dmsUserRoles: Record<string, UserRole> | undefined;
}


export function getDmsUsers(): DmsUser[] {
  return readAccounts().map(publicUser);
}

export function getDmsUserById(id: string) {
  return getDmsUsers().find((user) => user.id === id) ?? null;
}

export function getDmsUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return getDmsUsers().find((user) => user.email.toLowerCase() === normalizedEmail) ?? null;
}

export function updateDmsUserRole(id: string, role: UserRole) {
  const accounts = readAccounts();
  const user = accounts.find((candidate) => candidate.id === id);
  if (!user) return null;
  user.role = role;
  saveAccounts(accounts);
  return publicUser(user);
}
