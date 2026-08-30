export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  stewardRole: "viewer" | "editor" | "approver";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};
