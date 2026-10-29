import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const directory = path.join(process.cwd(), ".data");
const destination = path.join(directory, "accounts.json");
if (existsSync(destination)) throw new Error("Accounts already exist. Provisioning will not overwrite passwords.");
const definitions = [
  ["aline", "Aline", "aline@dms.cnrs.edu.lb", "AL", "Editor"],
  ["rabab-majzoub", "Rabab Majzoub", "rabab.majzoub@dms.cnrs.edu.lb", "RM", "Editor"],
  ["chadi-abdalla", "Dr Chadi Abdalla", "chadi.abdalla@dms.cnrs.edu.lb", "CA", "Administrator"],
  ["mahdi-maatouk", "Mahdi Maatouk", "mahdi.maatouk@dms.cnrs.edu.lb", "MM", "Administrator"],
];
const credentials = [];
const accounts = definitions.map(([id, name, email, initials, role]) => {
  const password = randomBytes(18).toString("base64url");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, salt, 64).toString("hex");
  credentials.push(`${name} (${role})\nEmail: ${email}\nPassword: ${password}`);
  return { id, name, email, initials, role, salt, passwordHash, sessionVersion: 1 };
});
mkdirSync(directory, { recursive: true, mode: 0o700 });
writeFileSync(destination, JSON.stringify(accounts, null, 2), { flag: "wx", mode: 0o600 });
const keyPath = path.join(directory, "session-secret");
if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(48).toString("hex"), { flag: "wx", mode: 0o600 });
writeFileSync("credentials.local.txt", "DMS account credentials — keep private and distribute individually.\nApplication accounts only; email mailboxes are not created.\n\n" + credentials.join("\n\n") + "\n", { flag: "wx", mode: 0o600 });
console.log("Created four accounts with unique passwords. Credentials saved to credentials.local.txt (excluded from Git).");
