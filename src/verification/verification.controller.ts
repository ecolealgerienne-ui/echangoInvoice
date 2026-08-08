import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TypeDocumentVerifiable, verifierSignature } from '../common/verification';

const SOURCES: Record<TypeDocumentVerifiable, { table: string; numero: string; date: string }> = {
  facture: { table: 'sales_invoices', numero: 'invoiceNumber', date: 'invoiceDate' },
  devis: { table: 'quotes', numero: 'quoteNumber', date: 'quoteDate' },
  bl: { table: 'delivery_notes', numero: 'blNumber', date: 'deliveryDate' },
  avoir: { table: 'credit_notes', numero: 'creditNoteNumber', date: 'creditNoteDate' },
};

/**
 * Vérification publique d'un document, via le QR qu'il porte.
 *
 * **Route publique assumée** — épinglée dans CLAUDE.md (R023). Elle est ouverte
 * parce que celui qui scanne est le destinataire du document : il n'a pas de
 * compte, et lui en demander un viderait la fonction de son sens.
 *
 * Ce qu'elle rend est volontairement **minimal** : émetteur, numéro, date,
 * total, statut. Ni lignes, ni coordonnées, ni marge. Une URL publique doit
 * pouvoir circuler sans révéler ce qu'un tiers n'a pas à savoir.
 *
 * Sans signature valide, elle répond 404 et non 403 : distinguer les deux
 * dirait à qui essaie qu'un document existe à cet identifiant.
 */
@ApiTags('Vérification')
@Controller('verify')
export class VerificationController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Get(':type/:id/:signature')
  @ApiOperation({ summary: "Vérifier l'authenticité d'un document depuis son QR" })
  async verifier(
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('signature') signature: string,
  ) {
    const source = SOURCES[type as TypeDocumentVerifiable];
    if (!source || !verifierSignature(type as TypeDocumentVerifiable, id, signature)) {
      throw new NotFoundException('errors.document_not_found');
    }

    const [doc] = await this.ds.query(
      `SELECT d."${source.numero}" AS numero,
              d."${source.date}"   AS date,
              d."totalAmount"      AS total,
              d.status,
              s."companyName"      AS emetteur,
              s.nif                AS "emetteurNif",
              c.name               AS destinataire
       FROM ${source.table} d
       JOIN partners c ON c.id = d."customerId"
       LEFT JOIN settings s ON s."tenantId" = d."tenantId"
       WHERE d.id = $1 AND d."deletedAt" IS NULL`,
      [id],
    );
    if (!doc) throw new NotFoundException('errors.document_not_found');

    return {
      data: {
        type,
        numero: doc.numero,
        date: doc.date,
        total: doc.total,
        statut: doc.status,
        emetteur: doc.emetteur,
        emetteurNif: doc.emetteurNif,
        destinataire: doc.destinataire,
        // Le statut seul ne se lit pas : « annulée » doit sauter aux yeux de
        // celui qui a le papier en main.
        valide: doc.status !== 'cancelled',
        verifieLe: new Date().toISOString(),
      },
    };
  }
}
