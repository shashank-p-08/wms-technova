import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Header,
  ParseUUIDPipe,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CurrentUser, Roles } from '../auth/decorators';
import { AuthUser } from '../auth/auth.types';
import { UserRole } from '../users/entities/user.entity';

/**
 * Permissions (role x assigned warehouse):
 *   view                 - every role, own warehouses (ADMIN: all)
 *   stock-in / stock-out - ADMIN, MANAGER, STAFF
 *   adjust (cycle count) - ADMIN, MANAGER
 */
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  getOverview(
    @CurrentUser() user: AuthUser,
    @Query('warehouseId', new ParseUUIDPipe()) warehouseId: string,
  ) {
    return this.inventoryService.getOverview(user, warehouseId);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="inventory-report.csv"')
  exportCsv(
    @CurrentUser() user: AuthUser,
    @Query('warehouseId', new ParseUUIDPipe()) warehouseId: string,
  ) {
    return this.inventoryService.exportCsv(user, warehouseId);
  }

  @Get('low-stock')
  getLowStockItems(
    @CurrentUser() user: AuthUser,
    @Query('warehouseId', new ParseUUIDPipe()) warehouseId: string,
  ) {
    return this.inventoryService.getLowStockItems(user, warehouseId);
  }

  @Get('transactions')
  getTransactionHistory(
    @CurrentUser() user: AuthUser,
    @Query('warehouseId', new ParseUUIDPipe({ optional: true })) warehouseId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '', 10);
    const safeLimit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 500) : 50;
    return this.inventoryService.getTransactionHistory(user, warehouseId, safeLimit);
  }

  @Post('stock-in')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  stockIn(@CurrentUser() user: AuthUser, @Body() dto: StockInDto) {
    return this.inventoryService.stockIn(user, dto);
  }

  @Post('stock-out')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
  stockOut(@CurrentUser() user: AuthUser, @Body() dto: StockOutDto) {
    return this.inventoryService.stockOut(user, dto);
  }

  @Post('adjust')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  adjustStock(@CurrentUser() user: AuthUser, @Body() dto: AdjustStockDto) {
    return this.inventoryService.adjustStock(user, dto);
  }
}
