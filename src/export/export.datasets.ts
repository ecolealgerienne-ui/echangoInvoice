import { Colonne } from './csv';

/**
 * Catalogue des jeux exportables.
 *
 * Chaque jeu est décrit — SELECT, FROM, filtres autorisés — plutôt que codé
 * dans un service dédié. Quinze exports écrits à la main, ce sont quinze
 * endroits où l'échappement CSV, la marque d'encodage ou le filtre locataire
 * peuvent diverger ; ici la mécanique est écrite une fois et la description
 * est la seule chose qui change d'un jeu à l'autre.
 *
 * Le SQL est écrit à la main, pas déduit des entités : l'export doit rendre
 * le nom du client, pas son identifiant, et le numéro du BL d'origine, pas
 * une clé étrangère. C'est un document comptable, pas un extrait de base.
 */

const STATUT_FACTURE = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  partial: 'Partiellement réglée',
  paid: 'Réglée',
  overdue: 'En retard',
  cancelled: 'Annulée',
};

const STATUT_BL = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  signed: 'Signé',
  delivered: 'Livré',
  cancelled: 'Annulé',
};

const STATUT_DEVIS = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  accepted: 'Accepté',
  rejected: 'Refusé',
  expired: 'Expiré',
  converted: 'Converti',
};

const STATUT_AVOIR = { draft: 'Brouillon', applied: 'Appliqué', cancelled: 'Annulé' };

const STATUT_COMMANDE = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  received: 'Réceptionnée',
  invoiced: 'Facturée',
  cancelled: 'Annulée',
};

const STATUT_RECEPTION = { pending: 'En attente', partial: 'Partielle', completed: 'Complète' };

const STATUT_FACTURE_FOURNISSEUR = {
  draft: 'Brouillon',
  validated: 'Validée',
  partial: 'Partiellement réglée',
  paid: 'Réglée',
  cancelled: 'Annulée',
};

const STATUT_LOT = {
  available: 'Disponible',
  reserved: 'Réservé',
  sold: 'Consommé',
  adjusted: 'Ajusté',
};

const MODE_REGLEMENT = {
  cash: 'Espèces',
  bank_transfer: 'Virement',
  cheque: 'Chèque',
  other: 'Autre',
};

const CATEGORIE_DEPENSE = {
  loyer: 'Loyer',
  utilities: 'Charges',
  transport: 'Transport',
  rh: 'Personnel',
  maintenance: 'Maintenance',
  other: 'Autre',
};

export interface Jeu {
  /** Segment d'URL et clé de traduction côté client. */
  cle: string;
  /** Base du nom de fichier proposé au téléchargement. */
  fichier: string;
  colonnes: Colonne[];
  select: string;
  from: string;
  /** Conditions toujours appliquées, en plus du locataire. */
  conditions?: string[];
  ordre: string;
  /** Colonne portant le filtre de période. Absente : dateFrom/dateTo refusés. */
  colonneDate?: string;
  /** Colonne de statut, avec ses valeurs acceptées. */
  colonneStatut?: string;
  valeursStatut?: string[];
  colonneClient?: string;
  colonneFournisseur?: string;
  /** Filtre « type » des articles (product / material). */
  colonneType?: string;
  /** Filtre « catégorie » des dépenses. */
  colonneCategorie?: string;
  valeursCategorie?: string[];
}

/**
 * Les horodatages sont convertis en UTC explicitement. `to_char` sur un
 * `timestamptz` rend la date dans le fuseau du serveur : le même export lancé
 * sur une machine réglée à Alger et sur une autre en UTC ne donnerait pas
 * toujours le même jour pour une facture émise près de minuit.
 */
const jour = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
/** Les colonnes `date` n'ont pas de fuseau : pas de conversion à faire. */
const jourSimple = (col: string) => `to_char(${col}, 'YYYY-MM-DD')`;

export const JEUX: Jeu[] = [
  {
    cle: 'factures',
    fichier: 'factures',
    colonnes: [
      { cle: 'numero', libelle: 'Numéro', type: 'texte' },
      { cle: 'date_facture', libelle: 'Date', type: 'date' },
      { cle: 'echeance', libelle: 'Échéance', type: 'date' },
      { cle: 'client', libelle: 'Client', type: 'texte' },
      { cle: 'nif', libelle: 'NIF', type: 'texte' },
      { cle: 'rc', libelle: 'RC', type: 'texte' },
      { cle: 'ville', libelle: 'Ville', type: 'texte' },
      { cle: 'statut', libelle: 'Statut', type: 'enum', valeurs: STATUT_FACTURE },
      { cle: 'total_ht', libelle: 'Total HT', type: 'nombre' },
      { cle: 'tva', libelle: 'TVA', type: 'nombre' },
      { cle: 'total_ttc', libelle: 'Total TTC', type: 'nombre' },
      { cle: 'encaisse', libelle: 'Encaissé', type: 'nombre' },
      { cle: 'avoirs', libelle: 'Avoirs', type: 'nombre' },
      { cle: 'reste_du', libelle: 'Reste dû', type: 'nombre' },
      { cle: 'bl_origine', libelle: 'BL d\'origine', type: 'texte' },
      { cle: 'devis_origine', libelle: 'Devis d\'origine', type: 'texte' },
      { cle: 'notes', libelle: 'Notes', type: 'texte' },
    ],
    select: `t."invoiceNumber" AS numero, ${jour('t."invoiceDate"')} AS date_facture,
             ${jourSimple('t."dueDate"')} AS echeance, c.name AS client, c.nif, c.rc,
             c.city AS ville, t.status AS statut, t.subtotal AS total_ht,
             t."taxAmount" AS tva, t."totalAmount" AS total_ttc, t."amountPaid" AS encaisse,
             t."creditedAmount" AS avoirs, t."amountDue" AS reste_du,
             bl."blNumber" AS bl_origine, dv."quoteNumber" AS devis_origine, t.notes`,
    from: `sales_invoices t
           LEFT JOIN partners c ON c.id = t."customerId"
           LEFT JOIN delivery_notes bl ON bl.id = t."deliveryNoteId"
           LEFT JOIN quotes dv ON dv.id = t."quoteId"`,
    conditions: ['t."deletedAt" IS NULL'],
    ordre: 't."invoiceDate", t."invoiceNumber"',
    colonneDate: 't."invoiceDate"',
    colonneStatut: 't.status',
    valeursStatut: Object.keys(STATUT_FACTURE),
    colonneClient: 't."customerId"',
  },

  {
    cle: 'lignes-factures',
    fichier: 'lignes-factures',
    colonnes: [
      { cle: 'numero_facture', libelle: 'Facture', type: 'texte' },
      { cle: 'date_facture', libelle: 'Date', type: 'date' },
      { cle: 'client', libelle: 'Client', type: 'texte' },
      { cle: 'statut_facture', libelle: 'Statut facture', type: 'enum', valeurs: STATUT_FACTURE },
      { cle: 'code_article', libelle: 'Code article', type: 'texte' },
      { cle: 'article', libelle: 'Article', type: 'texte' },
      { cle: 'quantite', libelle: 'Quantité', type: 'nombre' },
      { cle: 'unite', libelle: 'Unité', type: 'texte' },
      { cle: 'prix_unitaire', libelle: 'Prix unitaire', type: 'nombre' },
      { cle: 'taux_tva', libelle: 'Taux TVA', type: 'nombre' },
      { cle: 'montant_tva', libelle: 'Montant TVA', type: 'nombre' },
      { cle: 'total_ligne', libelle: 'Total ligne', type: 'nombre' },
    ],
    select: `f."invoiceNumber" AS numero_facture, ${jour('f."invoiceDate"')} AS date_facture,
             c.name AS client, f.status AS statut_facture, p.code AS code_article,
             p.name AS article, t.quantity AS quantite, t.unit AS unite,
             t."unitPrice" AS prix_unitaire, t."taxRate1" AS taux_tva,
             t."taxAmount1" AS montant_tva, t."lineTotal" AS total_ligne`,
    from: `sales_invoice_items t
           INNER JOIN sales_invoices f ON f.id = t."salesInvoiceId"
           LEFT JOIN partners c ON c.id = f."customerId"
           LEFT JOIN finished_products p ON p.id = t."finishedProductId"`,
    conditions: ['f."deletedAt" IS NULL'],
    ordre: 'f."invoiceDate", f."invoiceNumber", t."createdAt"',
    colonneDate: 'f."invoiceDate"',
    colonneStatut: 'f.status',
    valeursStatut: Object.keys(STATUT_FACTURE),
    colonneClient: 'f."customerId"',
  },

  {
    cle: 'encaissements',
    fichier: 'encaissements',
    colonnes: [
      { cle: 'date_reglement', libelle: 'Date', type: 'date' },
      { cle: 'facture', libelle: 'Facture', type: 'texte' },
      { cle: 'client', libelle: 'Client', type: 'texte' },
      { cle: 'montant', libelle: 'Montant', type: 'nombre' },
      { cle: 'mode', libelle: 'Mode', type: 'enum', valeurs: MODE_REGLEMENT },
      { cle: 'reference', libelle: 'Référence', type: 'texte' },
      { cle: 'notes', libelle: 'Notes', type: 'texte' },
    ],
    select: `${jourSimple('t."paymentDate"')} AS date_reglement, f."invoiceNumber" AS facture,
             c.name AS client, t.amount AS montant, t."paymentMethod" AS mode,
             t.reference, t.notes`,
    from: `payments t
           LEFT JOIN sales_invoices f ON f.id = t."salesInvoiceId"
           LEFT JOIN partners c ON c.id = f."customerId"`,
    conditions: ['t."deletedAt" IS NULL'],
    ordre: 't."paymentDate", f."invoiceNumber"',
    colonneDate: 't."paymentDate"',
    colonneClient: 'f."customerId"',
  },

  {
    cle: 'avoirs',
    fichier: 'avoirs',
    colonnes: [
      { cle: 'numero', libelle: 'Numéro', type: 'texte' },
      { cle: 'date_avoir', libelle: 'Date', type: 'date' },
      { cle: 'client', libelle: 'Client', type: 'texte' },
      { cle: 'facture', libelle: 'Facture', type: 'texte' },
      { cle: 'statut', libelle: 'Statut', type: 'enum', valeurs: STATUT_AVOIR },
      { cle: 'total_ht', libelle: 'Total HT', type: 'nombre' },
      { cle: 'tva', libelle: 'TVA', type: 'nombre' },
      { cle: 'total_ttc', libelle: 'Total TTC', type: 'nombre' },
      { cle: 'motif', libelle: 'Motif', type: 'texte' },
      { cle: 'notes', libelle: 'Notes', type: 'texte' },
    ],
    select: `t."creditNoteNumber" AS numero, ${jourSimple('t."creditNoteDate"')} AS date_avoir,
             c.name AS client, f."invoiceNumber" AS facture, t.status AS statut,
             t.subtotal AS total_ht, t."taxAmount" AS tva, t."totalAmount" AS total_ttc,
             t.reason AS motif, t.notes`,
    from: `credit_notes t
           LEFT JOIN partners c ON c.id = t."customerId"
           LEFT JOIN sales_invoices f ON f.id = t."salesInvoiceId"`,
    conditions: ['t."deletedAt" IS NULL'],
    ordre: 't."creditNoteDate", t."creditNoteNumber"',
    colonneDate: 't."creditNoteDate"',
    colonneStatut: 't.status',
    valeursStatut: Object.keys(STATUT_AVOIR),
    colonneClient: 't."customerId"',
  },

  {
    cle: 'devis',
    fichier: 'devis',
    colonnes: [
      { cle: 'numero', libelle: 'Numéro', type: 'texte' },
      { cle: 'date_devis', libelle: 'Date', type: 'date' },
      { cle: 'validite', libelle: 'Validité', type: 'date' },
      { cle: 'client', libelle: 'Client', type: 'texte' },
      { cle: 'statut', libelle: 'Statut', type: 'enum', valeurs: STATUT_DEVIS },
      { cle: 'total_ht', libelle: 'Total HT', type: 'nombre' },
      { cle: 'tva', libelle: 'TVA', type: 'nombre' },
      { cle: 'total_ttc', libelle: 'Total TTC', type: 'nombre' },
      { cle: 'facture_liee', libelle: 'Facture', type: 'texte' },
      { cle: 'bl_lie', libelle: 'BL', type: 'texte' },
      { cle: 'notes', libelle: 'Notes', type: 'texte' },
    ],
    select: `t."quoteNumber" AS numero, ${jourSimple('t."quoteDate"')} AS date_devis,
             ${jourSimple('t."expiryDate"')} AS validite, c.name AS client, t.status AS statut,
             t.subtotal AS total_ht, t."taxAmount" AS tva, t."totalAmount" AS total_ttc,
             f."invoiceNumber" AS facture_liee, bl."blNumber" AS bl_lie, t.notes`,
    from: `quotes t
           LEFT JOIN partners c ON c.id = t."customerId"
           LEFT JOIN sales_invoices f ON f.id = t."convertedToInvoiceId"
           LEFT JOIN delivery_notes bl ON bl.id = t."convertedToDeliveryNoteId"`,
    conditions: ['t."deletedAt" IS NULL'],
    ordre: 't."quoteDate", t."quoteNumber"',
    colonneDate: 't."quoteDate"',
    colonneStatut: 't.status',
    valeursStatut: Object.keys(STATUT_DEVIS),
    colonneClient: 't."customerId"',
  },

  {
    cle: 'bons-livraison',
    fichier: 'bons-livraison',
    colonnes: [
      { cle: 'numero', libelle: 'Numéro', type: 'texte' },
      { cle: 'date_livraison', libelle: 'Date', type: 'date' },
      { cle: 'client', libelle: 'Client', type: 'texte' },
      { cle: 'statut', libelle: 'Statut', type: 'enum', valeurs: STATUT_BL },
      { cle: 'total_ht', libelle: 'Total HT', type: 'nombre' },
      { cle: 'tva', libelle: 'TVA', type: 'nombre' },
      { cle: 'total_ttc', libelle: 'Total TTC', type: 'nombre' },
      { cle: 'signe', libelle: 'Signé', type: 'booleen' },
      { cle: 'date_signature', libelle: 'Date signature', type: 'date' },
      { cle: 'facture', libelle: 'Facture', type: 'texte' },
      { cle: 'notes', libelle: 'Notes', type: 'texte' },
    ],
    select: `t."blNumber" AS numero, ${jourSimple('t."deliveryDate"')} AS date_livraison,
             c.name AS client, t.status AS statut, t.subtotal AS total_ht,
             t."taxAmount" AS tva, t.total AS total_ttc,
             (t."customerSignature" IS NOT NULL) AS signe,
             ${jourSimple('t."signedDate"')} AS date_signature,
             f."invoiceNumber" AS facture, t.notes`,
    from: `delivery_notes t
           LEFT JOIN partners c ON c.id = t."customerId"
           LEFT JOIN sales_invoices f ON f.id = t."convertedToInvoiceId"`,
    conditions: ['t."deletedAt" IS NULL'],
    ordre: 't."deliveryDate", t."blNumber"',
    colonneDate: 't."deliveryDate"',
    colonneStatut: 't.status',
    valeursStatut: Object.keys(STATUT_BL),
    colonneClient: 't."customerId"',
  },

  {
    cle: 'clients',
    fichier: 'clients',
    colonnes: [
      { cle: 'nom', libelle: 'Nom', type: 'texte' },
      { cle: 'contact', libelle: 'Contact', type: 'texte' },
      { cle: 'email', libelle: 'Email', type: 'texte' },
      { cle: 'telephone', libelle: 'Téléphone', type: 'texte' },
      { cle: 'nif', libelle: 'NIF', type: 'texte' },
      { cle: 'rc', libelle: 'RC', type: 'texte' },
      { cle: 'ai', libelle: 'Article imposition', type: 'texte' },
      { cle: 'nis', libelle: 'NIS', type: 'texte' },
      { cle: 'adresse', libelle: 'Adresse', type: 'texte' },
      { cle: 'ville', libelle: 'Ville', type: 'texte' },
      { cle: 'grille', libelle: 'Grille tarifaire', type: 'texte' },
      { cle: 'encours', libelle: 'Encours', type: 'nombre' },
      { cle: 'actif', libelle: 'Actif', type: 'booleen' },
      { cle: 'notes', libelle: 'Notes', type: 'texte' },
    ],
    // L'encours est la première colonne que cherche un comptable dans un
    // fichier clients : le total facturé n'a pas d'intérêt sans ce qui reste
    // à recouvrer. Brouillons et annulées en sont exclus — une facture non
    // émise n'est pas une créance, et la même règle vaut sur la fiche client.
    select: `t.name AS nom, t."contactPerson" AS contact, t.email, t.phone AS telephone,
             t.nif, t.rc, t.ai, t.nis, t.address AS adresse, t.city AS ville,
             g.name AS grille, COALESCE(s.reste, 0) AS encours, t."isActive" AS actif, t.notes`,
    from: `partners t
           LEFT JOIN price_lists g ON g.id = t."priceListId"
           LEFT JOIN LATERAL (
             SELECT SUM(i."amountDue") AS reste FROM sales_invoices i
             WHERE i."customerId" = t.id AND i."tenantId" = t."tenantId"
               AND i."deletedAt" IS NULL AND i.status NOT IN ('draft', 'cancelled')
           ) s ON TRUE`,
    conditions: ['t."isCustomer" = TRUE', 't."deletedAt" IS NULL'],
    ordre: 't.name',
  },

  {
    cle: 'fournisseurs',
    fichier: 'fournisseurs',
    colonnes: [
      { cle: 'nom', libelle: 'Nom', type: 'texte' },
      { cle: 'contact', libelle: 'Contact', type: 'texte' },
      { cle: 'email', libelle: 'Email', type: 'texte' },
      { cle: 'telephone', libelle: 'Téléphone', type: 'texte' },
      { cle: 'nif', libelle: 'NIF', type: 'texte' },
      { cle: 'rc', libelle: 'RC', type: 'texte' },
      { cle: 'adresse', libelle: 'Adresse', type: 'texte' },
      { cle: 'ville', libelle: 'Ville', type: 'texte' },
      { cle: 'dette', libelle: 'Dette', type: 'nombre' },
      { cle: 'actif', libelle: 'Actif', type: 'booleen' },
      { cle: 'notes', libelle: 'Notes', type: 'texte' },
    ],
    select: `t.name AS nom, t."contactPerson" AS contact, t.email, t.phone AS telephone,
             t.nif, t.rc, t.address AS adresse, t.city AS ville,
             COALESCE(s.reste, 0) AS dette, t."isActive" AS actif, t.notes`,
    from: `partners t
           LEFT JOIN LATERAL (
             SELECT SUM(b."amountDue") AS reste FROM vendor_bills b
             WHERE b."supplierId" = t.id AND b."tenantId" = t."tenantId"
               AND b."deletedAt" IS NULL AND b.status NOT IN ('draft', 'cancelled')
           ) s ON TRUE`,
    conditions: ['t."isSupplier" = TRUE', 't."deletedAt" IS NULL'],
    ordre: 't.name',
  },

  {
    cle: 'articles',
    fichier: 'articles',
    colonnes: [
      { cle: 'code', libelle: 'Code', type: 'texte' },
      { cle: 'nom', libelle: 'Désignation', type: 'texte' },
      { cle: 'type', libelle: 'Type', type: 'enum', valeurs: { product: 'Produit', material: 'Matière' } },
      { cle: 'unite', libelle: 'Unité', type: 'texte' },
      { cle: 'prix_vente', libelle: 'Prix de vente', type: 'nombre' },
      { cle: 'dernier_cout', libelle: 'Dernier coût', type: 'nombre' },
      { cle: 'cout_moyen', libelle: 'Coût moyen', type: 'nombre' },
      { cle: 'stock', libelle: 'Stock', type: 'nombre' },
      { cle: 'reserve', libelle: 'Réservé', type: 'nombre' },
      { cle: 'valeur_stock', libelle: 'Valeur du stock', type: 'nombre' },
      { cle: 'seuil_alerte', libelle: 'Seuil d\'alerte', type: 'nombre' },
      { cle: 'premiere_peremption', libelle: 'Première péremption', type: 'date' },
      { cle: 'fournisseur', libelle: 'Fournisseur', type: 'texte' },
      { cle: 'actif', libelle: 'Actif', type: 'booleen' },
    ],
    select: `t.code, t.name AS nom, t.type, t.unit AS unite,
             t."defaultSalesPrice" AS prix_vente, t."lastCostPerUnit" AS dernier_cout,
             t."averageCostPerUnit" AS cout_moyen, t."stockQuantity" AS stock,
             t."reservedQuantity" AS reserve, t."totalStockValue" AS valeur_stock,
             t."alertThreshold" AS seuil_alerte,
             ${jour('t."earliestExpirationDate"')} AS premiere_peremption,
             f.name AS fournisseur, t."isActive" AS actif`,
    from: `finished_products t LEFT JOIN partners f ON f.id = t."supplierId"`,
    conditions: ['t."deletedAt" IS NULL'],
    ordre: 't.name',
    colonneType: 't.type',
  },

  {
    cle: 'lots-stock',
    fichier: 'lots-stock',
    colonnes: [
      { cle: 'code_article', libelle: 'Code article', type: 'texte' },
      { cle: 'article', libelle: 'Article', type: 'texte' },
      { cle: 'lot', libelle: 'Lot', type: 'texte' },
      { cle: 'quantite', libelle: 'Quantité restante', type: 'nombre' },
      { cle: 'cout_unitaire', libelle: 'Coût unitaire', type: 'nombre' },
      { cle: 'valeur', libelle: 'Valeur', type: 'nombre' },
      { cle: 'statut', libelle: 'Statut', type: 'enum', valeurs: STATUT_LOT },
      { cle: 'date_entree', libelle: 'Entré le', type: 'date' },
      { cle: 'peremption', libelle: 'Péremption', type: 'date' },
      { cle: 'bl_reception', libelle: 'BL de réception', type: 'texte' },
    ],
    select: `p.code AS code_article, p.name AS article, t."batchNumber" AS lot,
             t.quantity AS quantite, t."costPerUnit" AS cout_unitaire,
             t."totalCost" AS valeur, t.status AS statut,
             ${jour('t."enteredAt"')} AS date_entree, ${jour('t."expiresAt"')} AS peremption,
             r."blNumber" AS bl_reception`,
    // Les deux colonnes de rattachement coexistent depuis que les produits
    // finis sont eux aussi suivis par lots : COALESCE couvre les deux sans
    // supposer laquelle est renseignée.
    from: `stock_entries t
           LEFT JOIN finished_products p
             ON p.id = COALESCE(t."finishedProductId", t."rawMaterialId")
           LEFT JOIN reception_bls r ON r.id = t."receptionBlId"`,
    conditions: ['t."deletedAt" IS NULL'],
    ordre: 'p.name, t."enteredAt"',
    colonneDate: 't."enteredAt"',
    colonneStatut: 't.status',
    valeursStatut: Object.keys(STATUT_LOT),
  },

  {
    cle: 'depenses',
    fichier: 'depenses',
    colonnes: [
      { cle: 'date_depense', libelle: 'Date', type: 'date' },
      { cle: 'description', libelle: 'Description', type: 'texte' },
      { cle: 'categorie', libelle: 'Catégorie', type: 'enum', valeurs: CATEGORIE_DEPENSE },
      { cle: 'montant', libelle: 'Montant', type: 'nombre' },
      { cle: 'approuvee', libelle: 'Approuvée', type: 'booleen' },
      { cle: 'approuvee_par', libelle: 'Approuvée par', type: 'texte' },
      { cle: 'notes', libelle: 'Notes', type: 'texte' },
    ],
    select: `${jourSimple('t."expenseDate"')} AS date_depense, t.description,
             t.category AS categorie, t.amount AS montant, t."isApproved" AS approuvee,
             t."approvedBy" AS approuvee_par, t.notes`,
    from: 'expenses t',
    conditions: ['t."deletedAt" IS NULL'],
    ordre: 't."expenseDate"',
    colonneDate: 't."expenseDate"',
    colonneCategorie: 't.category',
    valeursCategorie: Object.keys(CATEGORIE_DEPENSE),
  },

  {
    cle: 'commandes-achat',
    fichier: 'commandes-achat',
    colonnes: [
      { cle: 'numero', libelle: 'Numéro', type: 'texte' },
      { cle: 'date_commande', libelle: 'Date', type: 'date' },
      { cle: 'livraison_prevue', libelle: 'Livraison prévue', type: 'date' },
      { cle: 'fournisseur', libelle: 'Fournisseur', type: 'texte' },
      { cle: 'statut', libelle: 'Statut', type: 'enum', valeurs: STATUT_COMMANDE },
      { cle: 'total_ht', libelle: 'Total HT', type: 'nombre' },
      { cle: 'tva', libelle: 'TVA', type: 'nombre' },
      { cle: 'total_ttc', libelle: 'Total TTC', type: 'nombre' },
      { cle: 'notes', libelle: 'Notes', type: 'texte' },
    ],
    select: `t."poNumber" AS numero, ${jourSimple('t."orderDate"')} AS date_commande,
             ${jourSimple('t."expectedDeliveryDate"')} AS livraison_prevue,
             f.name AS fournisseur, t.status AS statut, t.subtotal AS total_ht,
             t."taxAmount" AS tva, t.total AS total_ttc, t.notes`,
    from: 'purchase_orders t LEFT JOIN partners f ON f.id = t."supplierId"',
    conditions: ['t."deletedAt" IS NULL'],
    ordre: 't."orderDate", t."poNumber"',
    colonneDate: 't."orderDate"',
    colonneStatut: 't.status',
    valeursStatut: Object.keys(STATUT_COMMANDE),
    colonneFournisseur: 't."supplierId"',
  },

  {
    cle: 'receptions',
    fichier: 'receptions',
    colonnes: [
      { cle: 'numero', libelle: 'Numéro', type: 'texte' },
      { cle: 'date_reception', libelle: 'Date', type: 'date' },
      { cle: 'commande', libelle: 'Commande', type: 'texte' },
      { cle: 'fournisseur', libelle: 'Fournisseur', type: 'texte' },
      { cle: 'statut', libelle: 'Statut', type: 'enum', valeurs: STATUT_RECEPTION },
      { cle: 'quantite_recue', libelle: 'Quantité reçue', type: 'nombre' },
      { cle: 'notes', libelle: 'Notes', type: 'texte' },
    ],
    select: `t."blNumber" AS numero, ${jourSimple('t."receptionDate"')} AS date_reception,
             bc."poNumber" AS commande, f.name AS fournisseur, t.status AS statut,
             t."totalQuantityReceived" AS quantite_recue, t.notes`,
    from: `reception_bls t
           LEFT JOIN purchase_orders bc ON bc.id = t."purchaseOrderId"
           LEFT JOIN partners f ON f.id = bc."supplierId"`,
    conditions: ['t."deletedAt" IS NULL'],
    ordre: 't."receptionDate", t."blNumber"',
    colonneDate: 't."receptionDate"',
    colonneStatut: 't.status',
    valeursStatut: Object.keys(STATUT_RECEPTION),
    colonneFournisseur: 'bc."supplierId"',
  },

  {
    cle: 'factures-fournisseurs',
    fichier: 'factures-fournisseurs',
    colonnes: [
      { cle: 'numero', libelle: 'Numéro', type: 'texte' },
      { cle: 'date_facture', libelle: 'Date', type: 'date' },
      { cle: 'echeance', libelle: 'Échéance', type: 'date' },
      { cle: 'fournisseur', libelle: 'Fournisseur', type: 'texte' },
      { cle: 'commande', libelle: 'Commande', type: 'texte' },
      { cle: 'statut', libelle: 'Statut', type: 'enum', valeurs: STATUT_FACTURE_FOURNISSEUR },
      { cle: 'total_ht', libelle: 'Total HT', type: 'nombre' },
      { cle: 'tva', libelle: 'TVA', type: 'nombre' },
      { cle: 'total_ttc', libelle: 'Total TTC', type: 'nombre' },
      { cle: 'regle', libelle: 'Réglé', type: 'nombre' },
      { cle: 'reste_du', libelle: 'Reste dû', type: 'nombre' },
      { cle: 'notes', libelle: 'Notes', type: 'texte' },
    ],
    select: `t."billNumber" AS numero, ${jourSimple('t."billDate"')} AS date_facture,
             ${jourSimple('t."dueDate"')} AS echeance, f.name AS fournisseur,
             bc."poNumber" AS commande, t.status AS statut, t.subtotal AS total_ht,
             t."taxAmount" AS tva, t."totalAmount" AS total_ttc, t."amountPaid" AS regle,
             t."amountDue" AS reste_du, t.notes`,
    from: `vendor_bills t
           LEFT JOIN partners f ON f.id = t."supplierId"
           LEFT JOIN purchase_orders bc ON bc.id = t."purchaseOrderId"`,
    conditions: ['t."deletedAt" IS NULL'],
    ordre: 't."billDate", t."billNumber"',
    colonneDate: 't."billDate"',
    colonneStatut: 't.status',
    valeursStatut: Object.keys(STATUT_FACTURE_FOURNISSEUR),
    colonneFournisseur: 't."supplierId"',
  },

  {
    cle: 'reglements-fournisseurs',
    fichier: 'reglements-fournisseurs',
    colonnes: [
      { cle: 'date_reglement', libelle: 'Date', type: 'date' },
      { cle: 'facture', libelle: 'Facture', type: 'texte' },
      { cle: 'fournisseur', libelle: 'Fournisseur', type: 'texte' },
      { cle: 'montant', libelle: 'Montant', type: 'nombre' },
      { cle: 'mode', libelle: 'Mode', type: 'enum', valeurs: MODE_REGLEMENT },
      { cle: 'reference', libelle: 'Référence', type: 'texte' },
    ],
    select: `${jourSimple('t."paymentDate"')} AS date_reglement, fa."billNumber" AS facture,
             f.name AS fournisseur, t.amount AS montant, t.method AS mode, t.reference`,
    from: `vendor_payments t
           LEFT JOIN vendor_bills fa ON fa.id = t."vendorBillId"
           LEFT JOIN partners f ON f.id = fa."supplierId"`,
    ordre: 't."paymentDate"',
    colonneDate: 't."paymentDate"',
    colonneFournisseur: 'fa."supplierId"',
  },
];

export const JEUX_PAR_CLE = new Map(JEUX.map((j) => [j.cle, j]));
