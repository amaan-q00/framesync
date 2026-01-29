export interface User {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  created_at: Date;
}

export type SafeUser = Omit<User, 'password_hash'>;

export interface TokenPayload {
  userId: number;
  email: string;
}