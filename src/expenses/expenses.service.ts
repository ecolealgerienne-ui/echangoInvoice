import {
  ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Expense } from './expense.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense) private readonly repo: Repository<Expense>,
  ) {}

  async create(dto: CreateExpenseDto, tenantId: string, userId: string) {
    const expense = this.repo.create({
      tenantId,
      expenseDate: dto.expenseDate as unknown as Date,
      description: dto.description,
      category: dto.category,
      amount: dto.amount,
      notes: dto.notes ?? null,
      isApproved: false,
      createdBy: userId,
      updatedBy: userId,
    });
    await this.repo.save(expense);
    return { data: expense };
  }

  async findAll(dto: ListExpensesDto, tenantId: string) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('e')
      .where('e.tenantId = :tenantId', { tenantId })
      .andWhere('e.deletedAt IS NULL');

    if (dto.category) qb.andWhere('e.category = :category', { category: dto.category });
    if (dto.isApproved !== undefined) qb.andWhere('e.isApproved = :isApproved', { isApproved: dto.isApproved });
    if (dto.dateFrom) qb.andWhere('e.expenseDate >= :dateFrom', { dateFrom: dto.dateFrom });
    if (dto.dateTo) qb.andWhere('e.expenseDate <= :dateTo', { dateTo: dto.dateTo });

    const [data, total] = await qb
      .orderBy('e.expenseDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, pagination: { total, page, limit } };
  }

  async findOne(id: string, tenantId: string) {
    const expense = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!expense) throw new NotFoundException('expense_not_found');
    return { data: expense };
  }

  async update(id: string, dto: CreateExpenseDto, tenantId: string, userId: string) {
    const expense = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!expense) throw new NotFoundException('expense_not_found');
    if (expense.isApproved) throw new ConflictException('expense_already_approved');

    expense.expenseDate = dto.expenseDate as unknown as Date;
    expense.description = dto.description;
    expense.category = dto.category;
    expense.amount = dto.amount;
    expense.notes = dto.notes ?? null;
    expense.updatedBy = userId;
    await this.repo.save(expense);
    return { data: expense };
  }

  async approve(id: string, tenantId: string, userId: string) {
    const expense = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!expense) throw new NotFoundException('expense_not_found');
    if (expense.isApproved) throw new ConflictException('expense_already_approved');

    expense.isApproved = true;
    expense.approvedBy = userId;
    expense.approvedAt = new Date();
    expense.updatedBy = userId;
    await this.repo.save(expense);
    return { data: expense };
  }

  async remove(id: string, tenantId: string, userId: string) {
    const expense = await this.repo.findOne({ where: { id, tenantId, deletedAt: IsNull() } });
    if (!expense) throw new NotFoundException('expense_not_found');
    if (expense.isApproved) throw new ConflictException('expense_approved_cannot_delete');

    expense.updatedBy = userId;
    await this.repo.save(expense);
    await this.repo.softDelete(id);
    return { data: { deleted: true } };
  }

  async getSummary(tenantId: string, month: string) {
    const [year, monthNum] = month.split('-').map(Number);
    const dateFrom = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const lastDay = new Date(year, monthNum, 0).getDate();
    const dateTo = `${year}-${String(monthNum).padStart(2, '0')}-${lastDay}`;

    const rows = await this.repo
      .createQueryBuilder('e')
      .select('e.category', 'category')
      .addSelect('SUM(e.amount)', 'total')
      .addSelect('SUM(CASE WHEN e."isApproved" THEN e.amount ELSE 0 END)', 'approved')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COUNT(CASE WHEN e."isApproved" THEN 1 END)', 'approvedCount')
      .where('e.tenantId = :tenantId', { tenantId })
      .andWhere('e.expenseDate >= :dateFrom', { dateFrom })
      .andWhere('e.expenseDate <= :dateTo', { dateTo })
      .andWhere('e.deletedAt IS NULL')
      .groupBy('e.category')
      .getRawMany();

    const categories = ['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'];
    const byCategory: Record<string, number> = {};
    categories.forEach((c) => (byCategory[c] = 0));

    let totalExpenses = 0;
    let totalApproved = 0;
    let totalCount = 0;
    let approvedCount = 0;

    for (const row of rows) {
      const t = parseFloat(row.total ?? 0);
      const a = parseFloat(row.approved ?? 0);
      byCategory[row.category] = Math.round(t * 100) / 100;
      totalExpenses += t;
      totalApproved += a;
      totalCount += parseInt(row.count ?? 0);
      approvedCount += parseInt(row.approvedCount ?? 0);
    }

    totalExpenses = Math.round(totalExpenses * 100) / 100;
    totalApproved = Math.round(totalApproved * 100) / 100;
    const totalPending = Math.round((totalExpenses - totalApproved) * 100) / 100;
    const pendingCount = totalCount - approvedCount;
    const daysInMonth = lastDay;

    return {
      data: {
        month,
        totalExpenses,
        totalApproved,
        totalPending,
        byCategory,
        average: {
          perDay: totalCount > 0 ? Math.round((totalExpenses / daysInMonth) * 100) / 100 : 0,
          perExpense: totalCount > 0 ? Math.round((totalExpenses / totalCount) * 100) / 100 : 0,
        },
        count: { total: totalCount, approved: approvedCount, pending: pendingCount },
      },
    };
  }
}
