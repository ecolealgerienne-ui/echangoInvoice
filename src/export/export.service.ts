import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BOM, Dialecte, enTete, ligne } from './csv';
import { JEUX_PAR_CLE, Jeu } from './export.datasets';
import { ExportQueryDto } from './dto/export-query.dto';

/** Nombre de lignes lues par aller-retour SQL. */
const TAILLE_LOT = 2000;

@Injectable()
export class ExportService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  jeu(cle: string): Jeu {
    const jeu = JEUX_PAR_CLE.get(cle);
    if (!jeu) throw new NotFoundException('export_dataset_not_found');
    return jeu;
  }

  /**
   * Rend le fichier morceau par morceau plutôt qu'une chaîne unique. Un
   * export d'un exercice entier peut faire des dizaines de milliers de
   * lignes : tout assembler en mémoire ferait porter au serveur le poids du
   * fichier complet, multiplié par le nombre d'utilisateurs qui exportent en
   * même temps — typiquement en fin de mois, tous à la fois.
   */
  async *generer(jeu: Jeu, tenantId: string, dto: ExportQueryDto): AsyncGenerator<string> {
    const { conditions, params } = this.filtrer(jeu, tenantId, dto);
    const dialecte: Dialecte = dto.dialect ?? 'fr';

    // L'en-tête est écrit même quand aucune ligne ne correspond : un fichier
    // vide laisserait croire à une panne, alors que le filtre est simplement
    // trop étroit.
    yield BOM + enTete(jeu.colonnes, dialecte);

    let decalage = 0;
    for (;;) {
      const lot: Record<string, unknown>[] = await this.dataSource.query(
        `SELECT ${jeu.select}
         FROM ${jeu.from}
         WHERE ${conditions.join(' AND ')}
         ORDER BY ${jeu.ordre}, t.id
         LIMIT ${TAILLE_LOT} OFFSET ${decalage}`,
        params,
      );

      for (const enregistrement of lot) yield ligne(enregistrement, jeu.colonnes, dialecte);

      if (lot.length < TAILLE_LOT) break;
      decalage += TAILLE_LOT;
    }
  }

  /**
   * Un filtre que le jeu ne connaît pas est REFUSÉ, jamais ignoré. Ignorer
   * `dateFrom` sur un export de clients rendrait le fichier entier alors que
   * l'utilisateur a demandé un mois : il n'aurait aucun moyen de s'en rendre
   * compte avant de fonder ses comptes dessus.
   */
  private filtrer(jeu: Jeu, tenantId: string, dto: ExportQueryDto) {
    const params: unknown[] = [tenantId];
    const conditions = ['t."tenantId" = $1', ...(jeu.conditions ?? [])];

    const ajouter = (fragment: (position: string) => string, valeur: unknown) => {
      params.push(valeur);
      conditions.push(fragment(`$${params.length}`));
    };
    // Le nom du filtre part dans `field` et non collé à la clé : le filtre
    // d'exceptions le transmet tel quel, et la clé reste traduisible.
    const refuser = (nom: string): never => {
      throw new BadRequestException({ message: 'export_filter_not_supported', field: nom });
    };

    if (dto.dateFrom) {
      if (!jeu.colonneDate) refuser('dateFrom');
      ajouter((p) => `${jeu.colonneDate} >= ${p}::date`, dto.dateFrom);
    }
    if (dto.dateTo) {
      if (!jeu.colonneDate) refuser('dateTo');
      // Borne stricte sur le lendemain, et non `<= dateTo` : les colonnes
      // d'horodatage portent une heure, et une facture émise à 14 h le
      // dernier jour de la période disparaîtrait de l'export.
      ajouter((p) => `${jeu.colonneDate} < (${p}::date + INTERVAL '1 day')`, dto.dateTo);
    }
    if (dto.status) {
      if (!jeu.colonneStatut) refuser('status');
      if (!jeu.valeursStatut?.includes(dto.status)) {
        throw new BadRequestException('export_invalid_status');
      }
      ajouter((p) => `${jeu.colonneStatut} = ${p}`, dto.status);
    }
    if (dto.customerId) {
      if (!jeu.colonneClient) refuser('customerId');
      ajouter((p) => `${jeu.colonneClient} = ${p}`, dto.customerId);
    }
    if (dto.supplierId) {
      if (!jeu.colonneFournisseur) refuser('supplierId');
      ajouter((p) => `${jeu.colonneFournisseur} = ${p}`, dto.supplierId);
    }
    if (dto.type) {
      if (!jeu.colonneType) refuser('type');
      ajouter((p) => `${jeu.colonneType} = ${p}`, dto.type);
    }
    if (dto.category) {
      if (!jeu.colonneCategorie) refuser('category');
      if (!jeu.valeursCategorie?.includes(dto.category)) {
        throw new BadRequestException('export_invalid_category');
      }
      ajouter((p) => `${jeu.colonneCategorie} = ${p}`, dto.category);
    }

    return { conditions, params };
  }
}
