export interface JwtPayload {
  sub: string;
  /**
   * Alias de `sub` posé par JwtStrategy.validate. Les contrôleurs écrivent
   * `user.id` pour renseigner createdBy/updatedBy ; sans cet alias la valeur
   * était `undefined` et la piste d'audit restait vide.
   */
  id?: string;
  tenantId: string | null;
  role: 'owner' | 'manager' | 'agent' | 'superadmin';
  email: string;
  iat?: number;
  exp?: number;
}
