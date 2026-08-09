import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

export interface PdfDocumentData {
  // « DEVIS » manquait : le service des devis passait `'DEVIS' as any` pour
  // contourner le type, et l'archivage n'aurait rien signalé si le dossier
  // avait été mal orthographié.
  type: 'FACTURES' | 'BL' | 'DEVIS' | 'AVOIRS' | 'RAPPORTS'
    | 'COMMANDES' | 'RECEPTIONS' | 'FACTURES_FOURNISSEURS';
  /** Locataire propriétaire — segment de chemin obligatoire, voir plus bas. */
  tenantId: string;
  /** Identifiant du document — désambiguïse deux archivages du même numéro. */
  documentId: string;
  filename: string;
  html: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rien de ce qui entre dans un chemin de fichier n'est repris tel quel : un
 * numéro vient de la base et pourrait, après un import ou un format mal réglé,
 * contenir un séparateur.
 */
function segmentSur(valeur: string): string {
  return valeur.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

/**
 * Chemin d'archive. Fonction pure et exportée pour être vérifiable sans lancer
 * Chrome — voir `scripts/verifier-archivage.js`.
 *
 * Le `tenantId` est dans le chemin parce que la numérotation est séquentielle
 * **par locataire** : sans lui, deux sociétés qui facturent le même mois
 * produisent le même `FAC-26-001.pdf`, et la seconde écrase l'archive légale de
 * la première — sans erreur, sans journal, et alors que le décret 05-468 impose
 * dix ans de conservation.
 *
 * Le `documentId` empêche en plus qu'une régénération écrase la version déjà
 * envoyée au client.
 */
export function cheminArchive(
  base: string,
  doc: Pick<PdfDocumentData, 'tenantId' | 'documentId' | 'type' | 'filename'>,
  maintenant: Date,
): string {
  if (!UUID_RE.test(doc.tenantId) || !UUID_RE.test(doc.documentId)) {
    throw new InternalServerErrorException('errors.pdf_archive_identity_missing');
  }
  const annee = maintenant.getFullYear().toString();
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0');
  return path.join(
    base, 'ARCHIVES', doc.tenantId, annee, mois, doc.type,
    `${segmentSur(doc.filename)}__${doc.documentId}.pdf`,
  );
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly storageBase = process.env.STORAGE_PATH ?? './uploads';

  async generate(doc: PdfDocumentData): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage();

      // `echapper()` (document-template.ts) empêche déjà d'injecter du balisage.
      // Ces deux mesures ferment ce qu'il reste : le gabarit place le logo dans
      // un attribut `src`, et une valeur `file://` ou une adresse interne y
      // resterait une requête légitime pour Chrome. Aucun script ne s'exécute,
      // aucune ressource hors `data:` n'est chargée.
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        if (url.startsWith('data:') || url === 'about:blank') {
          void req.continue();
          return;
        }
        this.logger.warn(`Ressource externe bloquée dans un PDF : ${url.slice(0, 120)}`);
        void req.abort();
      });

      await page.setContent(doc.html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  // Archivage R014 : ARCHIVES/{tenantId}/AAAA/MM/TYPE/{numéro}__{documentId}.pdf
  async generateAndArchive(doc: PdfDocumentData): Promise<{ buffer: Buffer; archivePath: string }> {
    // Avant de lancer Chrome : un chemin invalide doit échouer tout de suite.
    const filePath = cheminArchive(this.storageBase, doc, new Date());

    const buffer = await this.generate(doc);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
    this.logger.log(`PDF archivé : ${filePath}`);

    return { buffer, archivePath: filePath };
  }
}
