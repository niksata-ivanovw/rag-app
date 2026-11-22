import { createContext } from 'react';
import type { AuthUser } from '../types';

export interface AuthContextType {
  /** The saved JWT; null = logged out */
  token: string | null;
  /** The logged-in account (null while it is being loaded, or when logged out) */
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  /** Creates the account and logs into it */
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
