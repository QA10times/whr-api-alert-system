import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ModuleInputDto, ModuleUpdateDto } from './dto/module.dto';
import { ModulesService } from './modules.service';

@Controller('modules')
export class ModulesController {
  constructor(private readonly svc: ModulesService) {}

  @Get()
  list(@Query('env') env?: string) {
    return this.svc.list(env || undefined);
  }

  @Post()
  create(@Body() dto: ModuleInputDto) {
    return this.svc.create(dto);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.svc.detail(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: ModuleUpdateDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
