import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * Liveness probe consommée par le mobile pour la détection de connectivité (spec 17 §3.2).
 *
 * Contraintes :
 * - non authentifiée — un token expiré ne doit pas passer pour une panne réseau
 * - aucun accès base — répond même si PostgreSQL est saturé
 * - hors rate limiting — sinon le mobile se croirait hors ligne
 */
@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Liveness probe — utilisé par le mobile pour la détection réseau',
  })
  @ApiResponse({ status: 200, description: 'Service disponible' })
  check(): { status: string } {
    return { status: 'ok' };
  }
}
