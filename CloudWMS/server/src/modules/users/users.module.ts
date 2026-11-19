import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Warehouse } from '../warehouses/entities/warehouse.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Warehouse])],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
