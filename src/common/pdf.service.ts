import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

export interface PdfDocumentData {
  type: 'FACTURES' | 'BL' | 'AVOIRS' | 'RAPPORTS';
  filename: string;
  html: string;
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
      await page.setContent(doc.html, { waitUntil: 'load' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  // Archivage selon R014 : ARCHIVES/YYYY/MM/TYPE/filename.pdf
  async generateAndArchive(doc: PdfDocumentData): Promise<{ buffer: Buffer; archivePath: string }> {
    const buffer = await this.generate(doc);

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dir = path.join(this.storageBase, 'ARCHIVES', year, month, doc.type);

    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${doc.filename}.pdf`);
    fs.writeFileSync(filePath, buffer);
    this.logger.log(`PDF archivé : ${filePath}`);

    return { buffer, archivePath: filePath };
  }
}
