import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { CurrentUser, Roles } from '../auth/decorators';
import { AuthUser } from '../auth/auth.types';
import { UserRole } from './entities/user.entity';

/** Employee management - company admins only. Users are deactivated, never deleted (audit trail). */
@Controller('users')
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() admin: AuthUser) {
    return this.users.list(admin);
  }

  @Post()
  create(@CurrentUser() admin: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(admin, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(admin, id, dto);
  }
}
