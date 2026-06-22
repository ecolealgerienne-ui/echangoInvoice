export interface JwtPayload {
  sub: string;
  tenantId: string | null;
  role: 'owner' | 'manager' | 'agent' | 'superadmin';
  email: string;
  iat?: number;
  exp?: number;
}
