export type UserRole = "Administrator" | "Editor";

export type DmsUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: UserRole;
};

export const dmsUsers: DmsUser[] = [
  {
    id: "aline",
    name: "Aline",
    email: "aline@dms.cnrs.edu.lb",
    initials: "AL",
    role: "Editor",
  },
  {
    id: "rabab-majzoub",
    name: "Rabab Majzoub",
    email: "rabab.majzoub@dms.cnrs.edu.lb",
    initials: "RM",
    role: "Editor",
  },
  {
    id: "chadi-abdalla",
    name: "Dr Chadi Abdalla",
    email: "chadi.abdalla@dms.cnrs.edu.lb",
    initials: "CA",
    role: "Administrator",
  },
  {
    id: "mahdi-maatouk",
    name: "Mahdi Maatouk",
    email: "mahdi.maatouk@dms.cnrs.edu.lb",
    initials: "MM",
    role: "Administrator",
  },
];

