import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Matches,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'SKU must contain only uppercase letters, numbers, hyphens, and underscores',
  })
  sku: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsNotEmpty()
  unitOfMeasurement: string;

  @IsInt()
  @Min(0, { message: 'Minimum stock level must be 0 or greater' })
  minimumStockLevel: number;

  @IsString()
  @IsOptional()
  imageUrl?: string;
}
