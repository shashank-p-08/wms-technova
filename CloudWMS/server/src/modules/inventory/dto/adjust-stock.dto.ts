import { IsString, IsNotEmpty, IsInt, Min, IsOptional, IsUUID } from 'class-validator';

export class AdjustStockDto {
  /** Warehouse the movement happens in - the user must be assigned to it */
  @IsUUID('4')
  warehouseId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(0, { message: 'New physical count cannot be negative' })
  newQuantity: number;

  @IsString()
  @IsNotEmpty({ message: 'Adjustment reference or audit ticket is required' })
  reference: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
