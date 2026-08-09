import { SetMetadata } from '@nestjs/common';

/**
 * `accountant` est un rôle de **lecture seule** : il n'apparaît que sur des
 * handlers @Get. `scripts/verifier-securite.js` échoue s'il se glisse sur une
 * écriture — c'est la seule garantie, le décorateur ne distingue pas les verbes.
 */
export type Role = 'owner' | 'manager' | 'agent' | 'accountant';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
