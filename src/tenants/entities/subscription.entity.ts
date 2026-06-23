import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Plan } from '../../admin/entities/plan.entity';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({
    type: 'enum',
    enum: ['starter', 'pro', 'enterprise'],
    default: 'starter',
  })
  plan: 'starter' | 'pro' | 'enterprise';

  @Column({ type: 'uuid', nullable: true })
  planId?: string;

  @ManyToOne(() => Plan, { nullable: true })
  @JoinColumn({ name: 'planId' })
  planRef?: Plan;

  @Column({
    type: 'enum',
    enum: ['active', 'expired', 'cancelled', 'suspended'],
    default: 'active',
  })
  status: 'active' | 'expired' | 'cancelled' | 'suspended';

  @Column({ type: 'int', default: 0 })
  invoicesThisMonth: number;

  @Column({ type: 'int', nullable: true })
  invoiceLimit?: number;

  @Column({ type: 'int', default: 1 })
  usersCount: number;

  @Column({ type: 'int', nullable: true })
  usersLimit?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  customPricePerMonth?: number;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastResetAt?: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
