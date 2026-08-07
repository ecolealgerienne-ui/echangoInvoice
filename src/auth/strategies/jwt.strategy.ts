import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { requireEnv } from '../../config/env.config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireEnv('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload.sub) {
      throw new UnauthorizedException('errors.invalid_token');
    }
    // superadmin has tenantId = null — that is valid
    if (payload.role !== 'superadmin' && !payload.tenantId) {
      throw new UnauthorizedException('errors.invalid_token');
    }
    // `id` est un alias de `sub`. La quasi-totalité des contrôleurs écrit
    // `user.id` pour renseigner createdBy/updatedBy, alors que le jeton ne
    // porte que `sub` : la valeur passée était `undefined`, et toute la piste
    // d'audit restait vide pour ce qui est créé via l'API — constaté le
    // 2026-08-08, seule facture créée par l'API sur 1001 : createdBy NULL.
    // L'alias corrige tous les appels d'un coup, sans en toucher aucun.
    return { ...payload, id: payload.sub };
  }
}
