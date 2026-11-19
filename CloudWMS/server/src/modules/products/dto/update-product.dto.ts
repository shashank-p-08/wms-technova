import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Matches,
} from 'class-validator';

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'SKU must contain only uppercase letters, numbers, hyphens, and underscores',
  })
  sku?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  unitOfMeasurement?: string;

  @IsInt()
  @Min(0, { message: 'Minimum stock level must be 0 or greater' })
  @IsOptional()
  minimumStockLevel?: number;

  @IsString()
  @IsOptional()
  imageUrl?: string;
}
