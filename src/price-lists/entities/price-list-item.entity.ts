import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { PriceList } from './price-list.entity';

@Index('IDX_price_list_items_list', ['priceListId'])
@Entity('price_list_items')
export class PriceListItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  priceListId: string;

  @ManyToOne(() => PriceList, (list) => list.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'priceListId' })
  priceList: PriceList;

  @Column({ type: 'uuid' })
  finishedProductId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
