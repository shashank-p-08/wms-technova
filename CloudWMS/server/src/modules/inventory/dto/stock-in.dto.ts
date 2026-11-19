import { IsString, IsNotEmpty, IsInt, Min, IsOptional, IsUUID } from 'class-validator';

export class StockInDto {
  /** Warehouse the movement happens in - the user must be assigned to it */
  @IsUUID('4')
  warehouseId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1, { message: 'Quantity to receive must be at least 1' })
  quantity: number;

  @IsString()
  @IsNotEmpty({ message: 'Reference number (e.g. PO-2026-001) is required' })
  reference: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
