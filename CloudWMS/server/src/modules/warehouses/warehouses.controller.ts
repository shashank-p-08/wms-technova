import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { WarehousesService } from './warehouses.service';
import { CurrentUser, Roles } from '../auth/decorators';
import { AuthUser } from '../auth/auth.types';
import { UserRole } from '../users/entities/user.entity';

export class CreateWarehouseDto {
  @IsString()
  @Matches(/^[A-Z0-9-]{2,20}$/, { message: 'Code must be 2-20 uppercase letters, digits or hyphens (e.g. HUB-02)' })
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(250)
  address?: string;
}

export class UpdateWarehouseDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(250)
  address?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  /** Admins see every warehouse; everyone else sees only the ones they are assigned to. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.warehouses.list(user);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@CurrentUser() admin: AuthUser, @Body() dto: CreateWarehouseDto) {
    return this.warehouses.create(admin, dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehouses.update(admin, id, dto);
  }
}
