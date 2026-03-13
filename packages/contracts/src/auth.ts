export type AuthProvider =
  | "firebase_anonymous"
  | "firebase_google"
  | "firebase_email_link"
  | "firebase_other";

export interface AuthIdentity {
  subject: string;
  provider: AuthProvider;
  email: string | null;
  isAnonymous: boolean;
}

export interface AuthSession {
  identity: AuthIdentity;
  roles: string[];
}

export interface AuthAdapter {
  getSession(request: Request): Promise<AuthSession | null>;
}
