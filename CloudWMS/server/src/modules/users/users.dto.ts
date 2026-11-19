import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from './entities/user.entity';
import { PASSWORD_MIN_LENGTH } from '../auth/password';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` })
  @MaxLength(200)
  password: string;

  /** Warehouses the employee works in (ignored for ADMIN, who can access all) */
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @IsOptional()
  warehouseIds?: string[];
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @IsOptional()
  warehouseIds?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /** Admin password reset - also unlocks the account and signs the user out everywhere */
  @IsString()
  @IsOptional()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` })
  @MaxLength(200)
  password?: string;
}
