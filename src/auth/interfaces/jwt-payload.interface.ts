export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: 'owner' | 'manager' | 'agent';
  email: string;
  iat?: number;
  exp?: number;
}
