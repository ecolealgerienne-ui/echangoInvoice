import {
  Injectable, NotFoundException, UnprocessableEntityException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, IsNull, ILike, FindOptionsWhere, DataSource } from 'typeorm';
import { Partner } from '../partners/partner.entity';
import { PartnerContact } from '../partners/entities/partner-contact.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { CreateCustomerContactDto } from './dto/create-customer-contact.dto';
import { resoudreTri } from '../common/tri';
// Fonctions pures : la date du jour à Alger, les bornes d'un mois, l'écart
// relatif. Elles vivent dans le module du tableau de bord parce qu'il les a
// posées le premier — les recopier ici ferait diverger la définition de « ce
// mois-ci » entre la liste des clients et l'écran qui la résume.
import { aujourdhuiAlger, bornesDuMois, evolution } from '../dashboard/periode';

/** Colonnes que le client peut demander en tri — voir common/tri.ts (R029). */
const COLONNES_TRIABLES = ['name', 'city', 'phone', 'email', 'createdAt'] as const;

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectRepository(Partner)
    private readonly repo: Repository<Partner>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateCustomerDto, tenantId: string, userId: string) {
    const customer = this.repo.create({
      ...dto,
      tenantId,
      isCustomer: dto.isCustomer ?? true,
      isSupplier: dto.isSupplier ?? false,
      isActive: dto.isActive ?? true,
      createdBy: userId,
      updatedBy: userId,
    });
    await this.repo.save(customer);
    this.logger.log(`Customer created: ${customer.id} for tenant ${tenantId}`);
    return { data: customer };
  }

  async findAll(query: ListCustomersDto, tenantId: string) {
    const { page, limit, search, isActive, city, type } = query;
    const skip = (page - 1) * limit;

    const base: FindOptionsWhere<Partner> = { tenantId, isCustomer: true, deletedAt: IsNull() };
    if (isActive !== undefined) base.isActive = isActive;
    // Égalité insensible à la casse plutôt que `=` : les villes sont saisies à
    // la main, et « BÉCHAR » ne doit pas former une deuxième entrée.
    if (city) base.city = ILike(city);
    if (type) base.isSupplier = type === 'both';

    // La recherche porte aussi sur le NIF et le RC : c'est ce que le champ
    // annonce à l'écran, et un identifiant fiscal est précisément ce qu'on colle
    // dans une recherche quand on tient une facture entre les mains.
    const where: FindOptionsWhere<Partner>[] = search
      ? [
          { ...base, name: ILike(`%${search}%`) },
          { ...base, contactPerson: ILike(`%${search}%`) },
          { ...base, email: ILike(`%${search}%`) },
          { ...base, phone: ILike(`%${search}%`) },
          { ...base, nif: ILike(`%${search}%`) },
          { ...base, rc: ILike(`%${search}%`) },
        ]
      : [base];

    const [data, total] = await this.repo.findAndCount({
      where,
      skip,
      take: limit,
      order: resoudreTri(COLONNES_TRIABLES, { colonne: 'name', sens: 'ASC' }, query),
    });

    return {
      data: await this.avecChiffreDuMois(data, tenantId),
      pagination: { total, page, limit },
    };
  }

  /**
   * Chiffre d'affaires du mois en cours, et son écart avec le mois précédent.
   *
   * Une **seule** requête pour toute la page, sur les identifiants déjà lus :
   * une sous-requête corrélée par ligne aurait multiplié les allers-retours par
   * la taille de page, et la liste des clients est l'écran le plus ouvert de
   * l'application.
   *
   * Les deux mois sont agrégés dans la même passe, par `FILTER` : deux requêtes
   * auraient pu diverger sur la règle d'exclusion, et c'est exactement l'écart
   * affiché qui serait alors devenu faux — sans que rien ne le signale.
   *
   * La règle est celle du tableau de bord, à la lettre : tout sauf `cancelled`
   * et les supprimées. Le même client doit peser le même montant dans les
   * « top clients » et dans sa ligne de liste, sinon l'un des deux écrans ment.
   *
   * L'écart est `null` quand le mois précédent est vide : un client qui
   * n'existait pas n'a pas progressé de l'infini, il est nouveau.
   */
  private async avecChiffreDuMois(clients: Partner[], tenantId: string) {
    if (!clients.length) return clients;

    const moisCourant = bornesDuMois(aujourdhuiAlger().slice(0, 7));
    const debut = new Date(`${moisCourant.dateFrom}T12:00:00Z`);
    const finPrecedent = new Date(debut.getTime() - 86_400_000).toISOString().slice(0, 10);
    const moisPrecedent = bornesDuMois(finPrecedent.slice(0, 7));

    const lignes: { id: string; courant: string; precedent: string }[] = await this.dataSource.query(
      `SELECT inv."customerId" AS id,
              COALESCE(SUM(inv."totalAmount")
                FILTER (WHERE inv."invoiceDate" BETWEEN $2 AND $3), 0) AS courant,
              COALESCE(SUM(inv."totalAmount")
                FILTER (WHERE inv."invoiceDate" BETWEEN $4 AND $5), 0) AS precedent
       FROM sales_invoices inv
       WHERE inv."tenantId" = $1
         AND inv."customerId" = ANY($6::uuid[])
         AND inv."invoiceDate" BETWEEN $4 AND $3
         AND inv.status != 'cancelled' AND inv."deletedAt" IS NULL
       GROUP BY inv."customerId"`,
      [
        tenantId,
        moisCourant.dateFrom, moisCourant.dateTo,
        moisPrecedent.dateFrom, moisPrecedent.dateTo,
        clients.map((c) => c.id),
      ],
    );

    const parClient = new Map(lignes.map((l) => [l.id, l]));

    // Object.assign sur l'instance, jamais un spread : un objet plain
    // désactiverait silencieusement les @Exclude() d'un futur
    // ClassSerializerInterceptor (R027).
    return clients.map((c) => {
      const l = parClient.get(c.id);
      const courant = Math.round(parseFloat(l?.courant ?? '0') * 100) / 100;
      const precedent = Math.round(parseFloat(l?.precedent ?? '0') * 100) / 100;
      return Object.assign(c, {
        revenueThisMonth: courant,
        revenueEvolution: evolution(courant, precedent),
      });
    });
  }

  /**
   * Inventaire des villes réellement présentes chez ce locataire.
   *
   * Il peuple la liste déroulante de filtre. Une liste des wilayas d'Algérie
   * écrite en dur aurait proposé quarante-huit entrées dont quarante-cinq ne
   * rendent aucune ligne — un filtre qui promet plus qu'il ne contient est pire
   * qu'un filtre absent.
   */
  async cities(tenantId: string) {
    const lignes: { city: string }[] = await this.dataSource.query(
      `SELECT DISTINCT city FROM partners
       WHERE "tenantId" = $1 AND "isCustomer" = TRUE AND "deletedAt" IS NULL
         AND city IS NOT NULL AND btrim(city) <> ''
       ORDER BY city`,
      [tenantId],
    );
    return { data: lignes.map((l) => l.city) };
  }

  async findOne(id: string, tenantId: string) {
    const customer = await this.repo.findOne({
      where: { id, tenantId, isCustomer: true, deletedAt: IsNull() },
    });
    if (!customer) throw new NotFoundException('errors.customer_not_found');

    const [deliveryNotes, invoices, quotes, payments, chiffres, grille] = await Promise.all([
      this.dataSource.query(
        `SELECT id, "blNumber", "deliveryDate", total AS "totalAmount", status
         FROM delivery_notes
         WHERE "customerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL
         ORDER BY "deliveryDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT id, "invoiceNumber", "invoiceDate", "dueDate", "totalAmount",
                "amountPaid", "creditedAmount", "amountDue", status
         FROM sales_invoices
         WHERE "customerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL
         ORDER BY "invoiceDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT id, "quoteNumber", "quoteDate", "totalAmount", status
         FROM quotes
         WHERE "customerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL
         ORDER BY "quoteDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT p.id, p."paymentDate", p.amount, p."paymentMethod", p.reference,
                f."invoiceNumber", f.id AS "invoiceId"
         FROM payments p
         JOIN sales_invoices f ON f.id = p."salesInvoiceId"
         WHERE f."customerId" = $1 AND p."tenantId" = $2 AND p."deletedAt" IS NULL
         ORDER BY p."paymentDate" DESC LIMIT 10`,
        [id, tenantId],
      ),
      // Brouillons et annulées sont exclus de tous les totaux. Une facture en
      // brouillon n'a pas été émise : elle ne représente ni un chiffre
      // d'affaires ni une créance, et la compter gonflerait l'encours d'un
      // montant que le client ne doit pas — au point de faire relancer
      // quelqu'un qui n'a jamais rien reçu.
      //
      // « En retard » se calcule sur la date d'échéance, pas sur le statut :
      // le statut `overdue` est posé par une tâche planifiée, et une facture
      // échue depuis ce matin ne l'a pas encore reçu.
      this.dataSource.query(
        `SELECT COALESCE(SUM("totalAmount"), 0) AS "chiffreAffaires",
                COALESCE(SUM("amountPaid"), 0)  AS "encaisse",
                COALESCE(SUM("creditedAmount"), 0) AS "avoirs",
                COALESCE(SUM("amountDue"), 0)   AS "encours",
                COALESCE(SUM("amountDue") FILTER (
                  WHERE "dueDate" < CURRENT_DATE AND "amountDue" > 0
                ), 0) AS "enRetard",
                COUNT(*) AS "nbFactures"
         FROM sales_invoices
         WHERE "customerId" = $1 AND "tenantId" = $2
           AND "deletedAt" IS NULL AND status NOT IN ('draft', 'cancelled')`,
        [id, tenantId],
      ),
      this.dataSource.query(
        `SELECT g.name FROM price_lists g
         JOIN partners c ON c."priceListId" = g.id
         WHERE c.id = $1 AND c."tenantId" = $2`,
        [id, tenantId],
      ),
    ]);

    const c = chiffres[0] ?? {};

    // Object.assign plutôt qu'un spread : `{...customer}` produirait un objet
    // plain et désactiverait silencieusement les @Exclude() d'un futur
    // ClassSerializerInterceptor (R027). L'instance de classe est conservée.
    return {
      data: Object.assign(customer, {
        priceListName: grille[0]?.name ?? null,
        stats: {
          chiffreAffaires: parseFloat(c.chiffreAffaires ?? '0'),
          encaisse: parseFloat(c.encaisse ?? '0'),
          avoirs: parseFloat(c.avoirs ?? '0'),
          encours: parseFloat(c.encours ?? '0'),
          enRetard: parseFloat(c.enRetard ?? '0'),
          nbFactures: parseInt(c.nbFactures ?? '0', 10),
        },
        history: { invoices, deliveryNotes, quotes, payments },
      }),
    };
  }

  async update(id: string, dto: UpdateCustomerDto, tenantId: string, userId: string) {
    const customer = await this.repo.findOne({
      where: { id, tenantId, isCustomer: true, deletedAt: IsNull() },
    });
    if (!customer) throw new NotFoundException('errors.customer_not_found');
    Object.assign(customer, dto, { updatedBy: userId });
    await this.repo.save(customer);
    return { data: customer };
  }

  async remove(id: string, tenantId: string) {
    const customer = await this.repo.findOne({
      where: { id, tenantId, isCustomer: true, deletedAt: IsNull() },
    });
    if (!customer) throw new NotFoundException('errors.customer_not_found');

    const linked = await this.dataSource.query(
      `SELECT 1 FROM delivery_notes WHERE "customerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, tenantId],
    );
    if (linked.length > 0) {
      throw new UnprocessableEntityException('errors.customer_has_linked_documents');
    }

    await this.repo.softDelete(id);
  }

  // ─── Contacts ─────────────────────────────────────────────────────────────

  async listContacts(customerId: string, tenantId: string) {
    await this.findOne(customerId, tenantId);
    const contacts = await this.dataSource.manager.find(PartnerContact, {
      where: { partnerId: customerId, tenantId, deletedAt: IsNull() },
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
    return { data: contacts };
  }

  async createContact(customerId: string, dto: CreateCustomerContactDto, tenantId: string, userId: string) {
    await this.findOne(customerId, tenantId);

    if (dto.isPrimary) {
      await this.dataSource.query(
        `UPDATE partner_contacts SET "isPrimary" = false WHERE "partnerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
        [customerId, tenantId],
      );
    }

    const contact = this.dataSource.manager.create(PartnerContact, {
      ...dto,
      partnerId: customerId,
      tenantId,
      isPrimary: dto.isPrimary ?? false,
      createdBy: userId,
      updatedBy: userId,
    });
    await this.dataSource.manager.save(PartnerContact, contact);
    return { data: contact };
  }

  async updateContact(contactId: string, customerId: string, dto: CreateCustomerContactDto, tenantId: string, userId: string) {
    const contact = await this.dataSource.manager.findOne(PartnerContact, {
      where: { id: contactId, partnerId: customerId, tenantId, deletedAt: IsNull() },
    });
    if (!contact) throw new NotFoundException('errors.contact_not_found');

    if (dto.isPrimary && !contact.isPrimary) {
      await this.dataSource.query(
        `UPDATE partner_contacts SET "isPrimary" = false WHERE "partnerId" = $1 AND "tenantId" = $2 AND "deletedAt" IS NULL`,
        [customerId, tenantId],
      );
    }

    Object.assign(contact, { ...dto, updatedBy: userId });
    await this.dataSource.manager.save(PartnerContact, contact);
    return { data: contact };
  }

  async removeContact(contactId: string, customerId: string, tenantId: string) {
    const contact = await this.dataSource.manager.findOne(PartnerContact, {
      where: { id: contactId, partnerId: customerId, tenantId, deletedAt: IsNull() },
    });
    if (!contact) throw new NotFoundException('errors.contact_not_found');
    await this.dataSource.manager.softDelete(PartnerContact, contactId);
  }
}
