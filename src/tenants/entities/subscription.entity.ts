import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({
    type: 'enum',
    enum: ['freemium', 'pro'],
    default: 'freemium',
  })
  plan: 'freemium' | 'pro';

  @Column({
    type: 'enum',
    enum: ['active', 'expired', 'cancelled'],
    default: 'active',
  })
  status: 'active' | 'expired' | 'cancelled';

  @Column({ type: 'int', default: 0 })
  invoicesThisMonth: number;

  @Column({ type: 'int', nullable: true })
  invoiceLimit?: number;

  @Column({ type: 'int', default: 1 })
  usersCount: number;

  @Column({ type: 'int', nullable: true })
  usersLimit?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  pricePerMonth?: number;

  @Column({ type: 'timestamptz', nullable: true })
  renewalDate?: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
