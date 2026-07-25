import { ofetch } from "ofetch";

export interface SessionResponse {
  id: string;
  userId: string;
  createdAt: string;
  accessedAt: string;
  expiresAt: string;
  device: string;
  userAgent: string;
}

export interface UserResponse {
  id: string;
  nickname: string;
  profile: {
    colorA: string;
    colorB: string;
    icon: string;
  };
  permissions: string[];
}

export interface LoginResponse {
  user: UserResponse;
  session: SessionResponse;
  token: string;
}

export function getAuthHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
  };
}
