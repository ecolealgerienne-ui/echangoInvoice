import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Setting } from './setting.entity';
import { TaxRateConfig } from './tax-rate-config.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting) private readonly repo: Repository<Setting>,
    @InjectRepository(TaxRateConfig) private readonly taxRepo: Repository<TaxRateConfig>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async get(tenantId: string) {
    let setting = await this.repo.findOne({ where: { tenantId } });
    if (!setting) {
      setting = await this.initDefaults(tenantId);
    }
    return { data: setting };
  }

  async update(tenantId: string, dto: UpdateSettingsDto, userId: string) {
    if (dto.taxRates) {
      const defaults = dto.taxRates.filter(t => t.isDefault);
      if (defaults.length > 1) throw new UnprocessableEntityException('settings_multiple_default_tax');
    }

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      let setting = await qr.manager.findOne(Setting, { where: { tenantId } });
      if (!setting) {
        setting = qr.manager.create(Setting, { tenantId });
      }

      if (dto.companyName !== undefined) setting.companyName = dto.companyName;
      if (dto.taxRate !== undefined) setting.taxRate = dto.taxRate;
      if (dto.currency !== undefined) setting.currency = dto.currency;
      if (dto.blNumberFormat !== undefined) setting.blNumberFormat = dto.blNumberFormat;
      if (dto.invoiceNumberFormat !== undefined) setting.invoiceNumberFormat = dto.invoiceNumberFormat;
      if (dto.quoteNumberFormat !== undefined) setting.quoteNumberFormat = dto.quoteNumberFormat;
      if (dto.poNumberFormat !== undefined) setting.poNumberFormat = dto.poNumberFormat;
      if (dto.email !== undefined) setting.email = dto.email;
      if (dto.phone !== undefined) setting.phone = dto.phone;
      if (dto.address !== undefined) setting.address = dto.address;
      if (dto.footerText !== undefined) setting.footerText = dto.footerText;
      if (dto.units !== undefined) setting.units = dto.units;
      setting.updatedBy = userId;

      const saved = await qr.manager.save(Setting, setting);

      if (dto.taxRates !== undefined) {
        await qr.manager.delete(TaxRateConfig, { settingsId: saved.id });
        if (dto.taxRates.length > 0) {
          const configs = dto.taxRates.map(t =>
            qr.manager.create(TaxRateConfig, {
              tenantId,
              settingsId: saved.id,
              name: t.name,
              rate: t.rate,
              isDefault: t.isDefault,
              currency: setting!.currency,
            }),
          );
          await qr.manager.save(TaxRateConfig, configs);
        }
      }

      await qr.commitTransaction();
      const result = await this.repo.findOne({ where: { tenantId } });
      return { data: result };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async initDefaults(tenantId: string): Promise<Setting> {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const setting = qr.manager.create(Setting, {
        tenantId,
        companyName: 'Mon Entreprise',
        taxRate: 19,
        currency: 'DA',
        blNumberFormat: 'BL-YY-###',
        invoiceNumberFormat: 'FAC-YY-###',
        quoteNumberFormat: 'DEV-YY-###',
        poNumberFormat: 'PO-YY-###',
        units: ['kg', 'g', 'tonne', 'L', 'mL', 'pcs', 'm', 'm²', 'm³', 'boîte', 'palette', 'sac'],
      });
      const saved = await qr.manager.save(Setting, setting);

      const defaultTax = qr.manager.create(TaxRateConfig, {
        tenantId,
        settingsId: saved.id,
        name: 'TVA',
        rate: 19.00,
        isDefault: true,
        currency: 'DA',
      });
      await qr.manager.save(TaxRateConfig, defaultTax);

      await qr.commitTransaction();
      return (await this.repo.findOne({ where: { tenantId } }))!;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
