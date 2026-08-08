import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { expensesApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Bloc, Champ, DocumentEnTete } from '@/components/shared/DocumentView';

export function ExpenseDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['expense', id],
    queryFn: () => expensesApi.get(id!),
    enabled: Boolean(id),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) {
    return (
      <div className="space-y-3">
        <Link to="/expenses" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('expenses.title')}
        </Link>
        <p className="text-sm text-foreground">{t('errors.expense_not_found')}</p>
      </div>
    );
  }

  const d = data.data;

  return (
    <div className="space-y-5">
      {/* La modale d'édition disparaît une fois la dépense approuvée : sans
          cette fiche, une dépense approuvée n'était plus consultable du tout. */}
      <DocumentEnTete
        retourVers="/expenses"
        retourLibelle={t('expenses.title')}
        titre={d.description}
        statut={{
          libelle: d.isApproved ? t('expenses.approved') : t('expenses.pending'),
          variant: d.isApproved ? 'success' : 'warning',
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloc titre={t('expenses.title')}>
          <Champ libelle={t('expenses.date')} valeur={formatDate(d.expenseDate)} />
          <Champ
            libelle={t('expenses.category')}
            valeur={<Badge variant="secondary">{t(`expenses.categories.${d.category}`)}</Badge>}
          />
          <Champ
            libelle={t('expenses.amount')}
            valeur={<span className="font-semibold">{formatCurrency(d.amount)}</span>}
          />
          <Champ libelle="Notes" valeur={d.notes ?? '—'} />
        </Bloc>

        <Bloc titre={t('common.history')}>
          <Champ libelle={t('common.createdAt')} valeur={formatDate(d.createdAt)} />
          <Champ libelle={t('common.updatedAt')} valeur={formatDate(d.updatedAt)} />
          <Champ
            libelle={t('common.status')}
            valeur={d.isApproved ? t('expenses.approved') : t('expenses.pending')}
          />
        </Bloc>
      </div>
    </div>
  );
}
