import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { Readable } from 'stream';
import { ExportService } from './export.service';
import { ExportQueryDto } from './dto/export-query.dto';
import { JEUX } from './export.datasets';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Export')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller('export')
export class ExportController {
  constructor(private readonly service: ExportService) {}

  @Get()
  @Roles('owner', 'manager')
  @ApiOperation({ summary: 'Lister les jeux de données exportables' })
  catalogue() {
    return {
      data: JEUX.map((j) => ({
        cle: j.cle,
        colonnes: j.colonnes.map((c) => c.libelle),
        filtres: {
          periode: Boolean(j.colonneDate),
          statut: j.valeursStatut ?? null,
          client: Boolean(j.colonneClient),
          fournisseur: Boolean(j.colonneFournisseur),
          type: Boolean(j.colonneType),
          categorie: j.valeursCategorie ?? null,
        },
      })),
    };
  }

  /**
   * Réservé aux propriétaires et gérants. Un agent saisit des documents, mais
   * un export emporte le fichier clients complet — l'actif qu'une entreprise
   * perd le plus facilement et regrette le plus longtemps.
   */
  @Get(':dataset')
  @Roles('owner', 'manager')
  // Une requête d'export balaye une table entière. Le plafond doit laisser
  // passer une session de fin de mois — quinze fichiers à la suite pour le
  // comptable — tout en empêchant qu'un clic répété sature la base.
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @ApiOperation({ summary: 'Exporter un jeu de données en CSV' })
  async telecharger(
    @Param('dataset') dataset: string,
    @Query() query: ExportQueryDto,
    @CurrentUser() user: any,
    @Res() reply: FastifyReply,
  ) {
    const jeu = this.service.jeu(dataset);
    const nom = `${jeu.fichier}_${new Date().toISOString().slice(0, 10)}.csv`;

    // Les filtres sont validés avant l'ouverture du flux : une fois les
    // en-têtes envoyés, un rejet arriverait dans un fichier à moitié écrit
    // au lieu d'un message d'erreur lisible.
    const contenu = this.service.generer(jeu, user.tenantId!, query);
    const premier = await contenu.next();

    async function* reste() {
      if (!premier.done) yield premier.value;
      yield* contenu;
    }

    void reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${nom}"`)
      .send(Readable.from(reste()));
  }
}
