import { JwtModuleOptions } from '@nestjs/jwt';
import { requireEnv } from './env.config';

export function getJwtConfig(): JwtModuleOptions {
  return {
    secret: requireEnv('JWT_SECRET'),
    signOptions: { expiresIn: parseInt(requireEnv('JWT_EXPIRY'), 10) },
  };
}
