import { Global, Module } from '@nestjs/common';
import { NumberingService } from './numbering.service';

/**
 * Global : sept modules numérotent des documents, et les déclarer un à un
 * ferait de l'oubli d'un import la cause d'une panne à l'exécution — au
 * moment précis où l'on crée un document.
 */
@Global()
@Module({
  providers: [NumberingService],
  exports: [NumberingService],
})
export class NumberingModule {}
